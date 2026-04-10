<script setup lang="ts">
import { ref } from 'vue';
import { NForm, NFormItem, NInput, NButton, NModal } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { apiFetch } from '@/api/client';
import TripQrScanner from './TripQrScanner.vue';
import { deriveDateTimeFromT, type QrParsed } from '@/composables/useQrParser';

const props = defineProps<{
  slug: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'submitted'): void;
}>();

const message = useMessage();

const fn = ref('');
const fd = ref('');
const fp = ref('');
const total = ref('');
const date = ref('');
const time = ref('');

function onParsed(p: QrParsed) {
  if (p.fn) fn.value = p.fn.trim();
  if (p.fd) fd.value = p.fd.trim();
  if (p.fp) fp.value = p.fp.trim();
  if (p.s) {
    const num = Number(String(p.s).replace(',', '.'));
    if (!Number.isNaN(num)) total.value = num.toFixed(2);
  }
  const dt = deriveDateTimeFromT(p.t);
  if (dt.date) date.value = dt.date;
  if (dt.time) time.value = dt.time;
}

async function submit() {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(props.slug)}/receipts/scan`, {
      method: 'POST',
      json: {
        fn: fn.value,
        fd: fd.value,
        fp: fp.value,
        total: total.value,
        date: date.value,
        time: time.value,
      },
    });
    message.success('Чек добавлен');
    emit('update:show', false);
    emit('submitted');
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Не удалось проверить чек');
  }
}
</script>

<template>
  <NModal :show="show" preset="card" title="Данные из QR чека" @update:show="emit('update:show', $event)">
    <NForm label-placement="top">
      <TripQrScanner :active="show" @parsed="onParsed" />
      <NFormItem label="ФН">
        <NInput v-model:value="fn" />
      </NFormItem>
      <NFormItem label="ФД">
        <NInput v-model:value="fd" />
      </NFormItem>
      <NFormItem label="ФП">
        <NInput v-model:value="fp" />
      </NFormItem>
      <NFormItem label="Сумма (как в чеке)">
        <NInput v-model:value="total" placeholder="1250.00" />
      </NFormItem>
      <NFormItem label="Дата">
        <NInput v-model:value="date" placeholder="2025-03-03" />
      </NFormItem>
      <NFormItem label="Время">
        <NInput v-model:value="time" placeholder="13:00" />
      </NFormItem>
      <NButton type="primary" block @click="submit">Проверить и добавить</NButton>
    </NForm>
  </NModal>
</template>
