<script setup lang="ts">
import { NConfigProvider, NMessageProvider, ruRU, dateRuRU, darkTheme } from 'naive-ui';
import PwaInstallPrompt from '@/components/PwaInstallPrompt.vue';

const themeOverrides = {
  common: {
    bodyColor: 'transparent',
    cardColor: 'rgba(255,255,255,0.06)',
    modalColor: 'rgba(20, 24, 40, 0.92)',
    popoverColor: 'rgba(20, 24, 40, 0.92)',
    borderColor: 'rgba(255,255,255,0.12)',
    textColorBase: 'rgba(255,255,255,0.92)',
    textColor1: 'rgba(255,255,255,0.92)',
    textColor2: 'rgba(255,255,255,0.78)',
    textColor3: 'rgba(255,255,255,0.66)',
    primaryColor: '#7c3aed',
    primaryColorHover: '#8b5cf6',
    primaryColorPressed: '#6d28d9',
    primaryColorSuppl: '#8b5cf6',
    checkMarkColor: 'rgb(0 216 255)',
  },
  Input: {
    color: 'rgba(255,255,255,0.06)',
    colorFocus: 'rgba(255,255,255,0.08)',
    textColor: 'rgba(255,255,255,0.92)',
    placeholderColor: 'rgba(255,255,255,0.50)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderFocus: '1px solid rgba(139,92,246,0.85)',
    boxShadowFocus: '0 0 0 2px rgba(139,92,246,0.25)',
    caretColor: 'rgba(255,255,255,0.92)',
  },
  Card: {
    color: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    titleTextColor: 'rgba(255,255,255,0.92)',
  },
  Tabs: {
    tabTextColorLine: 'rgba(255,255,255,0.78)',
    tabTextColorActiveLine: 'rgba(255,255,255,0.92)',
    barColor: '#8b5cf6',
  },
};
</script>

<template>
  <NConfigProvider
    :locale="ruRU"
    :date-locale="dateRuRU"
    :theme="darkTheme"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider>
      <router-view />
      <PwaInstallPrompt />
    </NMessageProvider>
  </NConfigProvider>
</template>
