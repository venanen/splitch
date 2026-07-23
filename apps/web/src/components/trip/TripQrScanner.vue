<script setup lang="ts">
import { ref, onBeforeUnmount, watch, nextTick, toRef } from 'vue';
import { NButton, NSpace } from 'naive-ui';
import QrScanner from 'qr-scanner';
import { useMessage } from 'naive-ui';
import { parseQrPayload, type QrParsed } from '@/composables/useQrParser';
import { useQrImageAlign } from '@/composables/useQrImageAlign';

const props = defineProps<{ active?: boolean }>();
const emit = defineEmits<{
  (e: 'parsed', payload: QrParsed): void;
}>();

const message = useMessage();

const scanning = ref(false);
const qrVideo = ref<HTMLVideoElement | null>(null);
let qrScanner: QrScanner | null = null;
const qrFileInput = ref<HTMLInputElement | null>(null);

const alignViewport = ref<HTMLElement | null>(null);
let dragging = false;
let lastX = 0;
let lastY = 0;

const {
  VIEWPORT,
  aligning,
  imageUrl,
  imageStyle,
  scanStatus,
  lastRaw,
  startAlignFromFile,
  resetAlign,
  zoomIn,
  zoomOut,
  panBy,
} = useQrImageAlign(toRef(props, 'active'));

async function onQrDetected(res: { data: string } | string) {
  try {
    const data = typeof res === 'string' ? res : (res as { data: string }).data;
    if (!data) return;
    const parsed = parseQrPayload(data);
    emit('parsed', parsed);
    message.success('QR распознан — поля заполнены');
    resetAlign();
  } catch {
    message.error('Не удалось распознать QR');
  } finally {
    await stopCameraScan();
  }
}

async function startCameraScan() {
  try {
    resetAlign();
    await nextTick();
    if (!qrVideo.value) return;
    await stopCameraScan();
    qrScanner = new QrScanner(
      qrVideo.value,
      (r) => void onQrDetected(r as unknown as { data: string }),
      {
        preferredCamera: 'environment',
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
      },
    );
    await qrScanner.start();
    scanning.value = true;
  } catch {
    message.error('Нет доступа к камере или она недоступна');
  }
}

async function stopCameraScan() {
  try {
    if (qrScanner) {
      await qrScanner.stop();
      qrScanner.destroy();
      qrScanner = null;
    }
  } finally {
    scanning.value = false;
  }
}

function triggerFilePick() {
  qrFileInput.value?.click();
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await stopCameraScan();
  try {
    const res = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    await onQrDetected(res as unknown as { data: string });
  } catch {
    try {
      await startAlignFromFile(file);
      message.info('QR не найден — выровняйте код в квадрате');
    } catch {
      message.error('Не удалось открыть изображение');
    }
  } finally {
    if (input) input.value = '';
  }
}

function applyAligned() {
  if (scanStatus.value !== 'ok' || !lastRaw.value) return;
  void onQrDetected(lastRaw.value);
}

function onPointerDown(ev: PointerEvent) {
  if (!aligning.value) return;
  dragging = true;
  lastX = ev.clientX;
  lastY = ev.clientY;
  alignViewport.value?.setPointerCapture(ev.pointerId);
}

function onPointerMove(ev: PointerEvent) {
  if (!dragging) return;
  const dx = ev.clientX - lastX;
  const dy = ev.clientY - lastY;
  lastX = ev.clientX;
  lastY = ev.clientY;
  panBy(dx, dy);
}

function onPointerUp(ev: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  try {
    alignViewport.value?.releasePointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
}

function onWheel(ev: WheelEvent) {
  if (!aligning.value) return;
  if (ev.deltaY < 0) zoomIn();
  else zoomOut();
}

watch(
  () => props.active,
  async (v) => {
    if (!v) {
      await stopCameraScan();
      resetAlign();
    }
  },
);

onBeforeUnmount(async () => {
  await stopCameraScan();
  resetAlign();
});
</script>

<template>
  <div>
    <NSpace style="margin-bottom: 10px" wrap>
      <NButton secondary @click="startCameraScan" v-if="!scanning">Сканировать с камеры</NButton>
      <NButton secondary type="warning" @click="stopCameraScan" v-else>Остановить камеру</NButton>
      <NButton @click="triggerFilePick">Загрузить изображение</NButton>
      <input ref="qrFileInput" type="file" accept="image/*" @change="onFileChange" style="display:none"/>
    </NSpace>

    <div v-show="scanning" class="qr-preview">
      <video ref="qrVideo" class="qr-video" muted playsinline></video>
    </div>

    <div v-if="aligning && imageUrl" class="align-panel">
      <p class="align-hint">Двигайте и масштабируйте, чтобы QR попал в квадрат</p>
      <div
        ref="alignViewport"
        class="align-viewport"
        :style="{ width: VIEWPORT + 'px', height: VIEWPORT + 'px' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <img :src="imageUrl" alt="" class="align-img" :style="imageStyle" draggable="false" />
        <div class="align-frame" aria-hidden="true" />
      </div>

      <div class="align-status" :class="scanStatus">
        <template v-if="scanStatus === 'scanning'">Распознавание…</template>
        <template v-else-if="scanStatus === 'ok'">QR распознан</template>
        <template v-else-if="scanStatus === 'fail'">QR не распознан</template>
        <template v-else>Выровняйте изображение</template>
      </div>

      <NSpace style="margin-top: 10px" wrap>
        <NButton secondary @click="zoomOut">−</NButton>
        <NButton secondary @click="zoomIn">+</NButton>
        <NButton type="primary" :disabled="scanStatus !== 'ok'" @click="applyAligned">Применить</NButton>
        <NButton quaternary @click="resetAlign">Отмена</NButton>
        <NButton quaternary @click="triggerFilePick">Другое фото</NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.qr-preview {
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 10px;
}
.qr-video {
  width: 100%;
  max-height: 240px;
  display: block;
  background: rgba(255,255,255,0.06);
}

.align-panel {
  margin-bottom: 10px;
}

.align-hint {
  margin: 0 0 8px;
  font-size: 0.85rem;
  opacity: 0.75;
}

.align-viewport {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  touch-action: none;
  cursor: grab;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.align-viewport:active {
  cursor: grabbing;
}

.align-img {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
}

.align-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.align-status {
  text-align: center;
  margin-top: 8px;
  font-size: 0.9rem;
}

.align-status.ok {
  color: #4ade80;
}

.align-status.fail {
  color: #f87171;
}

.align-status.scanning {
  opacity: 0.8;
}
</style>
