/**
 * Integration-тесты API против реального Postgres.
 * Требуют: docker compose up postgres -d && npm run db:push
 * DATABASE_URL берётся из setup-env (локальный 127.0.0.1:5432).
 */
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { computeDebtMatrix } from '../../../../packages/calc/src/settlement.js';
import { db } from '../db/client.js';
import { lineItems, participants, receipts } from '../db/schema.js';
import { setChequeRequestOverride } from '../lib/request-for-check.js';
import { buildSettlementInput } from '../services/settlement-from-db.js';
import {
  api,
  createTrip,
  deleteTripBySlug,
  adminBody,
} from '../test/http.js';

const slugsToClean: string[] = [];

function track(slug: string) {
  slugsToClean.push(slug);
}

beforeAll(async () => {
  await db.select().from(participants).limit(1);
});

afterEach(async () => {
  setChequeRequestOverride(null);
  while (slugsToClean.length) {
    const slug = slugsToClean.pop();
    if (slug) await deleteTripBySlug(slug);
  }
});

const sampleScanHtml = `<div><h3>ТЕСТ МАГАЗИН</h3>Адрес<br>ИНН 1 <br>--------------------------------<br>2025-03-03T13:00:00<br>Чек № 1<br>Смена № 1<br>Кассир: X<br>--------------------------------<br><h4>ПРИХОД</h4><table><tr><th>№</th><th>Название</th><th>Цена</th><th>Кол.</th><th>Сумма</th></tr><tr><td>1</td><td>Шашлык</td><td>100.00</td><td>3</td><td>300.00</td></tr></table>--------------------------------<br><p>ИТОГО: 300.00</p><p>Наличные: 0.00</p><p>Карта: 300.00</p><p>НДС 18%: 0.00</p><p>НДС 10%: 0.00</p>--------------------------------<br><p>ВИД НАЛОГООБЛОЖЕНИЯ: 1</p><p>Рег. номер ККТ: 1</p><p>ФН: 7384440800215290</p><p>ФД: 2271</p><p>ФПД#: 1305261358</p>--------------------------------<br></div>`;

describe('API integration: create / join', () => {
  it('создаёт поездку, админа и sessionToken', async () => {
    const res = await createTrip();
    expect(res.status).toBe(200);
    expect(res.json.slug).toBeTruthy();
    expect(res.json.sessionToken).toBeTruthy();
    track(res.json.slug!);

    const state = await api<{
      me: { isAdmin: boolean } | null;
      participants: { isAdmin: boolean }[];
    }>('GET', `/api/trips/${res.json.slug}`, {
      token: res.json.sessionToken,
    });
    expect(state.json.me?.isAdmin).toBe(true);
    expect(state.json.participants.some((p) => p.isAdmin)).toBe(true);
  });

  it('отклоняет некорректный телефон', async () => {
    // проходит minLength схемы, но normalizePhoneRu даёт < 11 цифр
    const res = await createTrip({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/телефон/i);
  });

  it('валидация короткого имени — 422', async () => {
    const res = await api('POST', '/api/trips', {
      body: { ...adminBody, tripName: 'ab', name: 'Админ' },
    });
    expect(res.status).toBe(422);
  });

  it('join: новый участник, re-login, ошибки паролей', async () => {
    const created = await createTrip({ joinPassword: 'room-secret' });
    track(created.json.slug!);
    const slug = created.json.slug!;

    const noPass = await api('POST', `/api/trips/${slug}/join`, {
      body: {
        name: 'Боб',
        password: 'bobpass1',
        phone: '79990001122',
        bank: 'Сбер',
      },
    });
    expect(noPass.status).toBe(403);

    const badRoom = await api('POST', `/api/trips/${slug}/join`, {
      body: {
        name: 'Боб',
        password: 'bobpass1',
        phone: '79990001122',
        bank: 'Сбер',
        joinPassword: 'wrong',
      },
    });
    expect(badRoom.status).toBe(403);

    const join = await api<{
      participantId: string;
      sessionToken: string;
    }>('POST', `/api/trips/${slug}/join`, {
      body: {
        name: 'Боб',
        password: 'bobpass1',
        phone: '8 (999) 000-11-22',
        bank: 'Сбер',
        joinPassword: 'room-secret',
      },
    });
    expect(join.status).toBe(200);
    const bobId = join.json.participantId;

    const badPass = await api('POST', `/api/trips/${slug}/join`, {
      body: {
        name: 'Боб',
        password: 'wrongpass',
        phone: '79990001122',
        bank: 'Сбер',
        joinPassword: 'room-secret',
      },
    });
    expect(badPass.status).toBe(403);

    const relogin = await api<{ participantId: string }>('POST', `/api/trips/${slug}/join`, {
      body: {
        name: 'Боб Другое Имя',
        password: 'bobpass1',
        phone: '79990001122',
        bank: 'Сбер',
        joinPassword: 'room-secret',
      },
    });
    expect(relogin.status).toBe(200);
    expect(relogin.json.participantId).toBe(bobId);

    const missing = await api('POST', '/api/trips/no-such-slug/join', {
      body: {
        name: 'X',
        password: 'pass1234',
        phone: '79990001122',
        bank: 'Сбер',
      },
    });
    expect(missing.status).toBe(404);
  });

  it('GET trip: me null без сессии', async () => {
    const created = await createTrip();
    track(created.json.slug!);
    const anon = await api<{ me: unknown }>('GET', `/api/trips/${created.json.slug}`);
    expect(anon.status).toBe(200);
    expect(anon.json.me).toBeNull();
  });
});

describe('API integration: receipts / toggle / admin / settlement', () => {
  it('manual, toggle, settlement совпадает с calc; finish блокирует мутации', async () => {
    const admin = await createTrip();
    track(admin.json.slug!);
    const slug = admin.json.slug!;
    const adminToken = admin.json.sessionToken!;

    const bob = await api<{ sessionToken: string; participantId: string }>(
      'POST',
      `/api/trips/${slug}/join`,
      {
        body: {
          name: 'Боб',
          password: 'bobpass1',
          phone: '79990001122',
          bank: 'Сбер',
        },
      },
    );
    expect(bob.status).toBe(200);

    const unauth = await api('POST', `/api/trips/${slug}/receipts/manual`, {
      body: { name: 'Бензин', priceRub: 300 },
    });
    expect(unauth.status).toBe(401);

    const manual = await api<{ receiptId: string }>(
      'POST',
      `/api/trips/${slug}/receipts/manual`,
      {
        token: adminToken,
        body: { name: 'Бензин', priceRub: 300 },
      },
    );
    expect(manual.status).toBe(200);

    const state = await api<{
      lineItems: { id: string; priceKopecks: number }[];
      trip: { id: string };
    }>('GET', `/api/trips/${slug}`, { token: adminToken });
    const lineId = state.json.lineItems[0]!.id;

    await api('POST', `/api/trips/${slug}/line-items/${lineId}/toggle`, {
      token: adminToken,
    });
    await api('POST', `/api/trips/${slug}/line-items/${lineId}/toggle`, {
      token: bob.json.sessionToken,
    });

    const settlement = await api<{
      participantIds: string[];
      kopecks: number[][];
    }>('GET', `/api/trips/${slug}/settlement`, { token: adminToken });
    expect(settlement.status).toBe(200);

    const input = await buildSettlementInput(state.json.trip.id);
    const expected = computeDebtMatrix(input);
    expect(settlement.json.participantIds).toEqual(expected.participantIds);
    expect(settlement.json.kopecks).toEqual(expected.kopecks);

    const bobIdx = settlement.json.participantIds.indexOf(bob.json.participantId);
    const adminIdx = settlement.json.participantIds.indexOf(admin.json.participantId!);
    expect(settlement.json.kopecks[bobIdx]![adminIdx]).toBe(150_00);

    const finish = await api('POST', `/api/trips/${slug}/finish`, {
      token: adminToken,
    });
    expect(finish.status).toBe(200);

    const afterFinish = await api('POST', `/api/trips/${slug}/receipts/manual`, {
      token: adminToken,
      body: { name: 'Ещё', priceRub: 10 },
    });
    expect(afterFinish.status).toBe(400);
  });

  it('edit/delete line: права; forcedForAll блокирует toggle; админ-операции', async () => {
    const admin = await createTrip();
    track(admin.json.slug!);
    const slug = admin.json.slug!;
    const adminToken = admin.json.sessionToken!;

    const bob = await api<{ sessionToken: string; participantId: string }>(
      'POST',
      `/api/trips/${slug}/join`,
      {
        body: {
          name: 'Боб',
          password: 'bobpass1',
          phone: '79990001122',
          bank: 'Сбер',
        },
      },
    );

    const carol = await api<{ sessionToken: string; participantId: string }>(
      'POST',
      `/api/trips/${slug}/join`,
      {
        body: {
          name: 'Кэрол',
          password: 'carolpass',
          phone: '79990003344',
          bank: 'Альфа',
        },
      },
    );

    const manual = await api<{ receiptId: string }>(
      'POST',
      `/api/trips/${slug}/receipts/manual`,
      {
        token: bob.json.sessionToken,
        body: { name: 'Кофе', priceRub: 200 },
      },
    );
    expect(manual.status).toBe(200);

    const state = await api<{
      lineItems: { id: string }[];
      receipts: { id: string; payerId: string }[];
    }>('GET', `/api/trips/${slug}`, { token: adminToken });
    const lineId = state.json.lineItems[0]!.id;
    const receiptId = state.json.receipts[0]!.id;

    const forbidden = await api('PATCH', `/api/trips/${slug}/line-items/${lineId}`, {
      token: carol.json.sessionToken,
      body: { name: 'Хаки' },
    });
    expect(forbidden.status).toBe(403);

    const editOk = await api('PATCH', `/api/trips/${slug}/line-items/${lineId}`, {
      token: bob.json.sessionToken,
      body: { name: 'Кофе латте', priceKopecks: 250_00 },
    });
    expect(editOk.status).toBe(200);

    const forceForbidden = await api(
      'PATCH',
      `/api/trips/${slug}/line-items/${lineId}`,
      {
        token: bob.json.sessionToken,
        body: { forcedForAll: true },
      },
    );
    expect(forceForbidden.status).toBe(403);

    const forceOk = await api('PATCH', `/api/trips/${slug}/line-items/${lineId}`, {
      token: adminToken,
      body: { forcedForAll: true },
    });
    expect(forceOk.status).toBe(200);

    const toggleForced = await api(
      'POST',
      `/api/trips/${slug}/line-items/${lineId}/toggle`,
      { token: carol.json.sessionToken },
    );
    expect(toggleForced.status).toBe(400);

    const rename = await api('PATCH', `/api/trips/${slug}`, {
      token: adminToken,
      body: { name: 'Новое имя' },
    });
    expect(rename.status).toBe(200);

    const changePayer = await api(
      'PATCH',
      `/api/trips/${slug}/receipts/${receiptId}`,
      {
        token: adminToken,
        body: { payerId: carol.json.participantId },
      },
    );
    expect(changePayer.status).toBe(200);

    const [rec] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.id, receiptId))
      .limit(1);
    expect(rec?.payerId).toBe(carol.json.participantId);

    const selfDel = await api(
      'DELETE',
      `/api/trips/${slug}/participants/${admin.json.participantId}`,
      { token: adminToken },
    );
    expect(selfDel.status).toBe(400);

    const removeBob = await api(
      'DELETE',
      `/api/trips/${slug}/participants/${bob.json.participantId}`,
      { token: adminToken },
    );
    expect(removeBob.status).toBe(200);

    const delLine = await api('DELETE', `/api/trips/${slug}/line-items/${lineId}`, {
      token: carol.json.sessionToken,
    });
    expect(delLine.status).toBe(200);

    const left = await db.select().from(lineItems).where(eq(lineItems.id, lineId));
    expect(left).toHaveLength(0);
    const recs = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    expect(recs).toHaveLength(0);
  });

  it('scan: mock HTML с expand qty; mock error → 502', async () => {
    const admin = await createTrip();
    track(admin.json.slug!);
    const slug = admin.json.slug!;
    const token = admin.json.sessionToken!;

    setChequeRequestOverride(async () => ({
      status: 'ok',
      data: sampleScanHtml,
    }));

    const scan = await api<{ receiptId: string }>(
      'POST',
      `/api/trips/${slug}/receipts/scan`,
      {
        token,
        body: {
          fn: '7384440800215290',
          fd: '2271',
          fp: '1305261358',
          total: '300.00',
          date: '2025-03-03',
          time: '13:00',
        },
      },
    );
    expect(scan.status).toBe(200);

    const state = await api<{ lineItems: { name: string; priceKopecks: number }[] }>(
      'GET',
      `/api/trips/${slug}`,
      { token },
    );
    expect(state.json.lineItems).toHaveLength(3);
    expect(state.json.lineItems.every((l) => l.priceKopecks === 100_00)).toBe(true);

    setChequeRequestOverride(async () => ({
      status: 'error',
      error: 'down',
    }));

    const fail = await api('POST', `/api/trips/${slug}/receipts/scan`, {
      token,
      body: {
        fn: '1',
        fd: '2',
        fp: '3',
        total: '10',
        date: '2025-01-01',
        time: '12:00',
      },
    });
    expect(fail.status).toBe(502);
  });
});
