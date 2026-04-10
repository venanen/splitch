import { onUnmounted, ref, watch } from 'vue';
import { getSessionToken } from '@/api/client';

/** Подписка на обновления поездки через WebSocket (тот же хост, что и Vite proxy). */
export function useTripSocket(tripId: () => string | undefined, onMessage: () => void) {
  const connected = ref(false);
  let ws: WebSocket | null = null;

  function connect() {
    const id = tripId();
    const token = getSessionToken();
    if (!id || !token) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(token)}&tripId=${encodeURIComponent(id)}`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected.value = true;
    };
    ws.onclose = () => {
      connected.value = false;
    };
    ws.onmessage = () => {
      onMessage();
    };
  }

  function disconnect() {
    ws?.close();
    ws = null;
    connected.value = false;
  }

  watch(
    () => [tripId(), getSessionToken()] as const,
    () => {
      disconnect();
      connect();
    },
    { immediate: true },
  );

  onUnmounted(disconnect);

  return { connected };
}
