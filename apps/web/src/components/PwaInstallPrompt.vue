<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NModal } from 'naive-ui';
import { usePwaInstall } from '@/composables/usePwaInstall';

const { canPrompt, needsIosGuide, install, dismiss } = usePwaInstall();
const showIosGuide = ref(false);
const installing = ref(false);

async function onInstall() {
  if (needsIosGuide.value) {
    showIosGuide.value = true;
    return;
  }
  installing.value = true;
  try {
    await install();
  } finally {
    installing.value = false;
  }
}

function onDismiss() {
  dismiss();
  showIosGuide.value = false;
}
</script>

<template>
  <Transition name="pwa-slide">
    <div v-if="canPrompt" class="pwa-banner" role="dialog" aria-label="Установка приложения">
      <div class="pwa-banner__text">
        <div class="pwa-banner__title">Добавить splich на главный экран</div>
        <div class="pwa-banner__hint muted">Быстрый доступ как к обычному приложению</div>
      </div>
      <div class="pwa-banner__actions">
        <NButton size="small" quaternary @click="onDismiss">Не сейчас</NButton>
        <NButton type="primary" size="small" :loading="installing" @click="onInstall">
          Добавить
        </NButton>
      </div>
    </div>
  </Transition>

  <NModal
    v-model:show="showIosGuide"
    preset="card"
    title="Добавить на экран «Домой»"
    style="max-width: 360px"
    :bordered="false"
    class="glass"
  >
    <ol class="ios-steps">
      <li>Нажмите кнопку <strong>Поделиться</strong> внизу Safari (квадрат со стрелкой вверх).</li>
      <li>Пролистайте меню и выберите <strong>«На экран „Домой“»</strong>.</li>
      <li>Подтвердите — иконка splich появится среди приложений.</li>
    </ol>
    <template #footer>
      <div class="ios-footer">
        <NButton quaternary @click="onDismiss">Не сейчас</NButton>
        <NButton type="primary" @click="showIosGuide = false">Понятно</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.pwa-banner {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
}

.pwa-banner__text {
  flex: 1 1 180px;
  min-width: 0;
}

.pwa-banner__title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.pwa-banner__hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
}

.pwa-banner__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.ios-steps {
  margin: 0;
  padding-left: 1.2em;
  color: rgba(255, 255, 255, 0.86);
  font-size: 14px;
  line-height: 1.5;
}

.ios-steps li + li {
  margin-top: 10px;
}

.ios-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pwa-slide-enter-active,
.pwa-slide-leave-active {
  transition:
    transform 0.28s ease,
    opacity 0.28s ease;
}

.pwa-slide-enter-from,
.pwa-slide-leave-to {
  transform: translateY(120%);
  opacity: 0;
}
</style>
