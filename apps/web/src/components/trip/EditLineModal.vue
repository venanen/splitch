<script setup lang="ts">
import { ref, watch } from 'vue';
import { NForm, NFormItem, NInput, NButton, NModal, NSpace } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { apiFetch } from '@/api/client';

const props = defineProps<{
  slug: string;
  show: boolean;
  lineId: string | null;
  receiptInstitution?: string | null;
  payerName?: string | null;
  canEdit: boolean;
  initialName: string;
  initialPriceRub: number;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'changed'): void;
}>();

const message = useMessage();

const name = ref('');
const priceRub = ref('');

watch(
  () => props.show,
  (v) => {
    if (v) {
      name.value = props.initialName ?? '';
      priceRub.value = (props.initialPriceRub ?? 0).toFixed(2);
    }
  },
  { immediate: true },
);

async function save() {
  if (!props.lineId) return;
  const pr = Number(String(priceRub.value).replace(',', '.'));
  if (Number.isNaN(pr)) return;
  const priceKopecks = Math.round(pr * 100);
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(props.slug)}/line-items/${props.lineId}`, {
      method: 'PATCH',
      json: { name: name.value, priceKopecks },
    });
    message.success('Сохранено');
    emit('update:show', false);
    emit('changed');
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

async function removeLine() {
  if (!props.lineId) return;
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(props.slug)}/line-items/${props.lineId}`, {
      method: 'DELETE',
    });
    message.success('Удалено');
    emit('update:show', false);
    emit('changed');
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}
</script>

<template>
  <NModal :show="show" preset="card" title="Редактирование позиции" @update:show="emit('update:show', $event)">
    <template v-if="canEdit">
      <div class="muted small" style="margin-bottom: 8px">
        Чек: {{ receiptInstitution }} · плательщик: {{ payerName }}
      </div>
      <NForm label-placement="top">
        <NFormItem label="Название">
          <NInput v-model:value="name" />
        </NFormItem>
        <NFormItem label="Цена, ₽">
          <NInput v-model:value="priceRub" placeholder="100.00" />
        </NFormItem>
        <NSpace justify="space-between">
          <NButton type="error" ghost @click="removeLine">Удалить</NButton>
          <NButton type="primary" @click="save">Сохранить</NButton>
        </NSpace>
      </NForm>
    </template>
    <template v-else>
      <p class="muted">Нет прав на редактирование этой позиции.</p>
    </template>
  </NModal>
</template>
