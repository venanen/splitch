import { cookie as elysiaCookie } from '@elysiajs/cookie';
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { trips } from '../db/schema.js';
import { apiRoutes } from '../routes/api.js';

export const testApp = new Elysia().use(elysiaCookie()).use(apiRoutes);

export type ApiResult<T = unknown> = {
  status: number;
  json: T;
};

export async function api<T = unknown>(
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown },
): Promise<ApiResult<T>> {
  const headers = new Headers();
  if (opts?.token !== undefined) {
    headers.set('x-session-token', opts.token);
  }
  if (opts?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await testApp.handle(
    new Request(`http://local.test${path}`, {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

export async function deleteTripBySlug(slug: string): Promise<void> {
  await db.delete(trips).where(eq(trips.slug, slug));
}

export const adminBody = {
  tripName: 'Тестовая поездка',
  name: 'Админ',
  password: 'pass1234',
  phone: '79991112233',
  bank: 'Тинькофф',
};

export async function createTrip(
  overrides?: Partial<typeof adminBody> & { joinPassword?: string },
) {
  const body = { ...adminBody, ...overrides };
  const res = await api<{
    slug: string;
    tripId: string;
    participantId: string;
    sessionToken: string;
    error?: string;
  }>('POST', '/api/trips', { body });
  return res;
}
