<script setup lang="ts">
import { ref } from 'vue';
import { NForm, NFormItem, NInput, NButton, NModal } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { apiFetch } from '@/api/client';

const props = defineProps<{
  slug: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'submitted'): void;
}>();

const message = useMessage();

const name = ref('');
const price = ref('');

async function submit() {
  const pr = Number(String(price.value).replace(',', '.'));
  if (Number.isNaN(pr)) return;
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(props.slug)}/receipts/manual`, {
      method: 'POST',
      json: { name: name.value, priceRub: pr },
    });
    message.success('Позиция добавлена');
    emit('update:show', false);
    emit('submitted');
    name.value = '';
    price.value = '';
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}
</script>

<template>
  <NModal :show="show" preset="card" title="Ручная позиция" @update:show="emit('update:show', $event)">
    <NForm label-placement="top">
      <NFormItem label="Название">
        <NInput v-model:value="name" placeholder="Бензин" />
      </NFormItem>
      <NFormItem label="Цена, ₽">
        <NInput v-model:value="price" placeholder="500" />
      </NFormItem>
      <NButton type="primary" block @click="submit">Добавить</NButton>
    </NForm>
  </NModal>
</template>
