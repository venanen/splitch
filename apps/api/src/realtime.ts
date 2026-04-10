/** Простая шина: подписки по tripId для push в WebSocket. */

type Ws = { send: (data: string) => void; readyState: number };

const OPEN = 1;
const rooms = new Map<string, Set<Ws>>();

export function subscribeTrip(tripId: string, ws: Ws): () => void {
  let set = rooms.get(tripId);
  if (!set) {
    set = new Set();
    rooms.set(tripId, set);
  }
  set.add(ws);
  return () => {
    set?.delete(ws);
    if (set && set.size === 0) rooms.delete(tripId);
  };
}

export function broadcastTrip(tripId: string, payload: unknown): void {
  const set = rooms.get(tripId);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === OPEN) ws.send(raw);
  }
}
