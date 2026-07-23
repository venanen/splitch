import { computed, onMounted, onUnmounted, ref } from 'vue';

const DISMISS_KEY = 'splich-pwa-install-dismissed';

/** Событие beforeinstallprompt (не во всех браузерах в lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)');
  if (mq.matches) return true;
  // iOS Safari после «На экран Домой»
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ может маскироваться под Mac
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

/**
 * Логика предложения установить PWA:
 * Android/Chrome — beforeinstallprompt; iOS — инструкция через Share.
 */
export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
  const dismissed = ref(false);
  const standalone = ref(false);
  const ios = ref(false);
  const mobile = ref(false);

  function readDismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  function refreshFlags() {
    standalone.value = isStandaloneDisplay();
    ios.value = isIosDevice();
    mobile.value = isMobileViewport();
    dismissed.value = readDismissed();
  }

  function onBeforeInstallPrompt(e: Event) {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
  }

  function onAppInstalled() {
    deferredPrompt.value = null;
    standalone.value = true;
  }

  onMounted(() => {
    refreshFlags();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
  });

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  });

  /** Можно показать баннер: не установлено, не dismissed, и есть BIP или iOS на мобильном. */
  const canPrompt = computed(() => {
    if (standalone.value || dismissed.value) return false;
    if (deferredPrompt.value) return true;
    // На iOS BIP нет — показываем инструкцию только на узком экране
    return ios.value && mobile.value;
  });

  const needsIosGuide = computed(() => ios.value && !deferredPrompt.value);

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable' | 'ios'> {
    if (needsIosGuide.value) return 'ios';
    const event = deferredPrompt.value;
    if (!event) return 'unavailable';
    await event.prompt();
    const choice = await event.userChoice;
    deferredPrompt.value = null;
    if (choice.outcome === 'accepted') {
      standalone.value = true;
    }
    return choice.outcome;
  }

  function dismiss() {
    dismissed.value = true;
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  return {
    canPrompt,
    needsIosGuide,
    install,
    dismiss,
  };
}
