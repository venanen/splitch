import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import QrScanner from 'qr-scanner';

const VIEWPORT = 280;
const OUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const SCAN_DEBOUNCE_MS = 200;

export type AlignScanStatus = 'idle' | 'scanning' | 'ok' | 'fail';

export function useQrImageAlign(active: Ref<boolean | undefined>) {
  const aligning = ref(false);
  const imageUrl = ref<string | null>(null);
  const naturalW = ref(0);
  const naturalH = ref(0);
  const zoom = ref(1);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const scanStatus = ref<AlignScanStatus>('idle');
  const lastRaw = ref<string | null>(null);

  const imgEl = ref<HTMLImageElement | null>(null);
  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  let scanGen = 0;
  let objectUrl: string | null = null;

  const coverScale = computed(() => {
    if (!naturalW.value || !naturalH.value) return 1;
    return VIEWPORT / Math.min(naturalW.value, naturalH.value);
  });

  const displayScale = computed(() => coverScale.value * zoom.value);

  const imageStyle = computed(() => ({
    width: `${naturalW.value}px`,
    height: `${naturalH.value}px`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${displayScale.value})`,
    transformOrigin: '0 0',
    willChange: 'transform',
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  }));

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clampOffsets() {
    const s = displayScale.value;
    const scaledW = naturalW.value * s;
    const scaledH = naturalH.value * s;
    const minX = VIEWPORT - scaledW;
    const minY = VIEWPORT - scaledH;
    // Image must cover viewport when possible
    if (scaledW >= VIEWPORT) {
      offsetX.value = Math.min(0, Math.max(minX, offsetX.value));
    } else {
      offsetX.value = (VIEWPORT - scaledW) / 2;
    }
    if (scaledH >= VIEWPORT) {
      offsetY.value = Math.min(0, Math.max(minY, offsetY.value));
    } else {
      offsetY.value = (VIEWPORT - scaledH) / 2;
    }
  }

  function fitCover() {
    zoom.value = 1;
    const s = coverScale.value;
    offsetX.value = (VIEWPORT - naturalW.value * s) / 2;
    offsetY.value = (VIEWPORT - naturalH.value * s) / 2;
    clampOffsets();
  }

  function resetAlign() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    scanGen += 1;
    aligning.value = false;
    imageUrl.value = null;
    naturalW.value = 0;
    naturalH.value = 0;
    zoom.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    scanStatus.value = 'idle';
    lastRaw.value = null;
    imgEl.value = null;
    revokeUrl();
  }

  async function startAlignFromFile(file: File) {
    resetAlign();
    objectUrl = URL.createObjectURL(file);
    imageUrl.value = objectUrl;

    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      img.src = objectUrl!;
    });
    imgEl.value = img;
    naturalW.value = img.naturalWidth;
    naturalH.value = img.naturalHeight;
    fitCover();
    aligning.value = true;
    scheduleScan();
  }

  function setZoom(next: number) {
    const prev = displayScale.value;
    const cx = VIEWPORT / 2;
    const cy = VIEWPORT / 2;
    // Keep point under center fixed
    const imgX = (cx - offsetX.value) / prev;
    const imgY = (cy - offsetY.value) / prev;
    zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const s = displayScale.value;
    offsetX.value = cx - imgX * s;
    offsetY.value = cy - imgY * s;
    clampOffsets();
    scheduleScan();
  }

  function zoomIn() {
    setZoom(zoom.value + 0.25);
  }

  function zoomOut() {
    setZoom(zoom.value - 0.25);
  }

  function panBy(dx: number, dy: number) {
    offsetX.value += dx;
    offsetY.value += dy;
    clampOffsets();
    scheduleScan();
  }

  function cropToCanvas(): HTMLCanvasElement | null {
    const img = imgEl.value;
    if (!img || !naturalW.value) return null;
    const s = displayScale.value;
    const sx = -offsetX.value / s;
    const sy = -offsetY.value / s;
    const sw = VIEWPORT / s;
    const sh = VIEWPORT / s;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_SIZE, OUT_SIZE);
    return canvas;
  }

  function scheduleScan() {
    if (!aligning.value) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanStatus.value = 'scanning';
    lastRaw.value = null;
    const gen = ++scanGen;
    scanTimer = setTimeout(() => {
      void runScan(gen);
    }, SCAN_DEBOUNCE_MS);
  }

  async function runScan(gen: number) {
    const canvas = cropToCanvas();
    if (!canvas || gen !== scanGen) return;
    try {
      const res = await QrScanner.scanImage(canvas, { returnDetailedScanResult: true });
      if (gen !== scanGen) return;
      const data = typeof res === 'string' ? res : (res as { data: string }).data;
      if (data) {
        lastRaw.value = data;
        scanStatus.value = 'ok';
      } else {
        lastRaw.value = null;
        scanStatus.value = 'fail';
      }
    } catch {
      if (gen !== scanGen) return;
      lastRaw.value = null;
      scanStatus.value = 'fail';
    }
  }

  watch(
    () => active.value,
    (v) => {
      if (!v) resetAlign();
    },
  );

  onBeforeUnmount(() => {
    resetAlign();
  });

  return {
    VIEWPORT,
    aligning,
    imageUrl,
    imageStyle,
    zoom,
    scanStatus,
    lastRaw,
    startAlignFromFile,
    resetAlign,
    zoomIn,
    zoomOut,
    panBy,
    scheduleScan,
  };
}
