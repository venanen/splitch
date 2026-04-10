<script setup lang="ts">
import { ref, onBeforeUnmount, watch, nextTick } from 'vue';
import { NButton, NFormItem, NSpace } from 'naive-ui';
import QrScanner from 'qr-scanner';
import { useMessage } from 'naive-ui';
import { parseQrPayload, type QrParsed } from '@/composables/useQrParser';

const props = defineProps<{ active?: boolean }>();
const emit = defineEmits<{
  (e: 'parsed', payload: QrParsed): void;
}>();

const message = useMessage();

const scanning = ref(false);
const qrVideo = ref<HTMLVideoElement | null>(null);
let qrScanner: QrScanner | null = null;
const qrFileInput = ref<HTMLInputElement | null>(null);

async function onQrDetected(res: { data: string } | string) {
  try {
    const data = typeof res === 'string' ? res : (res as any).data;
    if (!data) return;
    const parsed = parseQrPayload(data);
    emit('parsed', parsed);
    message.success('QR распознан — поля заполнены');
  } catch (e) {
    message.error('Не удалось распознать QR');
  } finally {
    await stopCameraScan();
  }
}

async function startCameraScan() {
  try {
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
  } catch (e) {
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
  try {
    const res = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    await onQrDetected(res as unknown as { data: string });
  } catch (e) {
    message.error('QR на изображении не найден');
  } finally {
    if (input) input.value = '';
  }
}

watch(
  () => props.active,
  async (v) => {
    if (!v) await stopCameraScan();
  },
);

onBeforeUnmount(async () => {
  await stopCameraScan();
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
</style>
