<script setup lang="ts">
import { NModal, NImage } from 'naive-ui';
import { useQRCode } from '@vueuse/integrations/useQRCode';

const props = defineProps<{
  show: boolean;
  url: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
}>();

const qrcode = useQRCode(() => props.url, {
  errorCorrectionLevel: 'H',
  margin: 3,
});
</script>

<template>
  <NModal :show="show" @update:show="emit('update:show', $event)">
    <NImage width="300" :src="qrcode" />
  </NModal>
</template>
