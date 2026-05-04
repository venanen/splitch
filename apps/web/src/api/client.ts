/** Базовый URL: в dev через Vite proxy достаточно ''. */
const BASE = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'splich_session';

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getSessionToken();
  // Always send header to override HttpOnly cookie on the server. Empty value = no session.
  headers.set('x-session-token', token ?? '');
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}
