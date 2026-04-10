<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  useMessage,
  NSpace,
} from 'naive-ui';
import { apiFetch, setSessionToken } from '@/api/client';

const router = useRouter();
const message = useMessage();

const tripName = ref('');
const joinPassword = ref('');
const name = ref('');
const password = ref('');
const phone = ref('');
const bank = ref('');
const loading = ref(false);

async function createTrip() {
  loading.value = true;
  try {
    const res = await apiFetch<{
      slug: string;
      sessionToken: string;
    }>('/api/trips', {
      method: 'POST',
      json: {
        tripName: tripName.value,
        joinPassword: joinPassword.value || undefined,
        name: name.value,
        password: password.value,
        phone: phone.value,
        bank: bank.value,
      },
    });
    setSessionToken(res.sessionToken);
    message.success('Комната создана');
    await router.push({ name: 'trip', params: { slug: res.slug } });
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <div class="brand">
        <div class="logo">splich</div>
        <div class="tag muted">Разделение чеков в поездках — без таблиц и боли.</div>
      </div>
    </div>

    <NCard title="Создать комнату" class="card glass">
      <p class="muted" style="margin-top: 0">
        Комната живёт в рамках поездки: телефон + пароль участника нужны только чтобы зайти с другого устройства.
      </p>
      <NForm label-placement="top">
        <NFormItem label="Название поездки" :show-feedback="false">
          <NInput v-model:value="tripName" placeholder="Например, Карелия май 2026" />
        </NFormItem>
        <NFormItem
          label="Пароль комнаты (необязательно)"
          :show-feedback="false"
          tooltip="Общий пароль поездки: защищает ссылку. Если задан — его попросят при входе."
        >
          <NInput v-model:value="joinPassword" type="password" show-password-on="click" />
        </NFormItem>
        <NFormItem label="Ваше имя" :show-feedback="false">
          <NInput v-model:value="name" placeholder="Как к вам обращаться" />
        </NFormItem>
        <NFormItem
          label="Пароль участника (личный)"
          :show-feedback="false"
          tooltip="Ваш личный пароль в этой поездке: нужен для входа с другого устройства по телефону."
        >
          <NInput v-model:value="password" type="password" show-password-on="click" />
        </NFormItem>
        <NFormItem label="Телефон" :show-feedback="false" tooltip="Нормализуется до формата 7XXXXXXXXXX">
          <NInput v-model:value="phone" placeholder="+7 …" />
        </NFormItem>
        <NFormItem label="Банк для перевода" :show-feedback="false">
          <NInput v-model:value="bank" placeholder="Тинькофф, по номеру телефона …" />
        </NFormItem>
        <div class="actions">
          <NButton type="primary" size="large" :loading="loading" @click="createTrip">
            Создать комнату
          </NButton>
          <div class="hint muted">После создания откроется страница комнаты — там будет ссылка для друзей.</div>
        </div>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 16px;
}
.brand {
  padding: 12px 4px;
}
.logo {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.tag {
  margin-top: 6px;
  font-size: 14px;
}
.card :deep(.n-card-header) {
  padding-bottom: 4px;
}
.actions {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.hint {
  font-size: 12px;
}
</style>
