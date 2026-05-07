<script setup lang="ts">
import { ref } from 'vue';
import { NCard, NForm, NFormItem, NInput, NInputGroup, NInputGroupLabel, NButton } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { apiFetch, setSessionToken } from '@/api/client';

const props = defineProps<{ slug: string }>();
const emit = defineEmits<{ (e: 'joined'): void }>();

const message = useMessage();

const name = ref('');
const password = ref('');
const phone = ref('');
const bank = ref('');
const roomPass = ref('');

async function doJoin() {
  try {
    const res = await apiFetch<{ sessionToken: string }>(
      `/api/trips/${encodeURIComponent(props.slug)}/join`,
      {
        method: 'POST',
        json: {
          name: name.value,
          password: password.value,
          phone: phone.value,
          bank: bank.value,
          joinPassword: roomPass.value || undefined,
        },
      },
    );
    setSessionToken(res.sessionToken);
    message.success('Вы в комнате');
    emit('joined');
  } catch (e) {
    console.log(e)
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}
</script>

<template>
  <NCard title="Вход в комнату" class="glass">
    <NForm label-placement="top">
      <div class="form-container">
        <NFormItem label="Имя" :show-feedback="false">
          <NInput v-model:value="name" />
        </NFormItem>
        <NFormItem
          label="Пароль участника (личный)"
          :show-feedback="false"
          tooltip="Это ваш личный пароль в этой поездке. По телефону + этому паролю вы сможете войти с другого устройства."
        >
          <NInput v-model:value="password" type="password" show-password-on="click" />
        </NFormItem>
        <NFormItem label="Телефон" :show-feedback="false" tooltip="По телефону ищем вашу запись в этой комнате.">
          <NInputGroup>
            <NInputGroupLabel>+7</NInputGroupLabel>
            <NInput v-model:value="phone" />
          </NInputGroup>
        </NFormItem>
        <NFormItem label="Банк" :show-feedback="false" tooltip="Показывается в финале для переводов.">
          <NInput v-model:value="bank" />
        </NFormItem>
        <NFormItem
          label="Пароль комнаты (если задан)"
          :show-feedback="false"
          tooltip="Общий пароль поездки. Нужен только если админ поставил защиту."
        >
          <NInput v-model:value="roomPass" type="password" show-password-on="click" minlength="5" />
        </NFormItem>
        <NButton type="primary" @click="doJoin">Войти</NButton>
      </div>
    </NForm>
  </NCard>
</template>

<style scoped>
.form-container{
  display: flex;
  flex-direction: column;
  gap: 1.5em;
}
</style>
