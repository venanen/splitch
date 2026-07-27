import type { Page, Route } from '@playwright/test';

export const SLUG = 'e2e-trip';
export const TRIP_ID = 'trip-e2e-1';
export const ADMIN_ID = 'p-admin';
export const BOB_ID = 'p-bob';
export const LINE_ID = 'line-1';
export const RECEIPT_ID = 'rec-1';
export const ADMIN_TOKEN = 'token-admin';
export const BOB_TOKEN = 'token-bob';

/** 300 ₽ → 30000 коп; двое отметили → по 150 ₽ */
export const EXPECTED_DEBT_KOPECKS = 150_00;

export type TripState = {
  trip: {
    id: string;
    slug: string;
    name: string;
    finishedAt: string | null;
  };
  me: { participantId: string; isAdmin: boolean } | null;
  participants: {
    id: string;
    name: string;
    phone: string;
    bank: string;
    isAdmin: boolean;
  }[];
  receipts: {
    id: string;
    institution: string;
    officialTotalKopecks: number;
    payerId: string;
    payerName: string;
    isManual: boolean;
  }[];
  lineItems: {
    id: string;
    receiptId: string;
    name: string;
    unit: string | null;
    quantity: number;
    priceKopecks: number;
    forcedForAll: boolean;
    selectedCount: number;
    mySelected: boolean;
  }[];
};

export function emptyTrip(meAdmin = true): TripState {
  return {
    trip: {
      id: TRIP_ID,
      slug: SLUG,
      name: 'Карелия e2e',
      finishedAt: null,
    },
    me: meAdmin
      ? { participantId: ADMIN_ID, isAdmin: true }
      : null,
    participants: [
      {
        id: ADMIN_ID,
        name: 'Админ',
        phone: '79991112233',
        bank: 'Тинькофф',
        isAdmin: true,
      },
    ],
    receipts: [],
    lineItems: [],
  };
}

export function settlementMatrix(selectedBob = true) {
  // participants sorted: ADMIN_ID, BOB_ID alphabetically? 'p-admin' < 'p-bob'
  const participantIds = [ADMIN_ID, BOB_ID];
  const kopecks = [
    [0, 0],
    [selectedBob ? EXPECTED_DEBT_KOPECKS : 0, 0],
  ];
  return {
    participantIds,
    names: {
      [ADMIN_ID]: { name: 'Админ', bank: 'Тинькофф', phone: '79991112233' },
      [BOB_ID]: { name: 'Боб', bank: 'Сбер', phone: '79990001122' },
    },
    kopecks,
  };
}

/** Ожидаемая строка formatRub(15000) в браузере ru-RU */
export function expectedRub(kopecks: number): string {
  return (kopecks / 100).toLocaleString('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function fillByLabel(page: Page, label: string, value: string) {
  const item = page.locator('.n-form-item').filter({ hasText: label }).first();
  await item.locator('input.n-input__input-el, input').first().fill(value);
}

export async function fillByPlaceholder(page: Page, placeholder: string, value: string) {
  await page.getByPlaceholder(placeholder).fill(value);
}

/**
 * Моки /api/* с изменяемым состоянием поездки.
 * Важно: не ловить `/src/api/...` модули Vite — только pathname `/api/...`.
 * WebSocket не мокаем — соединение упадёт тихо, UI опирается на HTTP reload.
 */
export async function installTripApiMocks(page: Page, opts?: { startWithMe?: boolean }) {
  const state = emptyTrip(opts?.startWithMe !== false);
  let bobJoined = false;
  let settlement = settlementMatrix(false);

  const ensureBob = () => {
    if (bobJoined) return;
    bobJoined = true;
    state.participants.push({
      id: BOB_ID,
      name: 'Боб',
      phone: '79990001122',
      bank: 'Сбер',
      isAdmin: false,
    });
  };

  const isApi = (url: URL) =>
    url.pathname === '/api' || url.pathname.startsWith('/api/');

  await page.route(isApi, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    };

    if (method === 'POST' && path === '/api/trips') {
      await json({
        slug: SLUG,
        tripId: TRIP_ID,
        participantId: ADMIN_ID,
        sessionToken: ADMIN_TOKEN,
      });
      return;
    }

    if (method === 'POST' && path === `/api/trips/${SLUG}/join`) {
      ensureBob();
      await json({
        tripId: TRIP_ID,
        participantId: BOB_ID,
        sessionToken: BOB_TOKEN,
      });
      return;
    }

    if (method === 'GET' && path === `/api/trips/${SLUG}`) {
      await json(state);
      return;
    }

    if (method === 'POST' && path === `/api/trips/${SLUG}/receipts/manual`) {
      const body = req.postDataJSON() as { name: string; priceRub: number };
      const priceKopecks = Math.round(body.priceRub * 100);
      state.receipts = [
        {
          id: RECEIPT_ID,
          institution: body.name,
          officialTotalKopecks: priceKopecks,
          payerId: ADMIN_ID,
          payerName: 'Админ',
          isManual: true,
        },
      ];
      state.lineItems = [
        {
          id: LINE_ID,
          receiptId: RECEIPT_ID,
          name: body.name,
          unit: null,
          quantity: 1,
          priceKopecks,
          forcedForAll: false,
          selectedCount: 0,
          mySelected: false,
        },
      ];
      await json({ receiptId: RECEIPT_ID });
      return;
    }

    if (method === 'POST' && path === `/api/trips/${SLUG}/line-items/${LINE_ID}/toggle`) {
      const li = state.lineItems[0];
      if (li) {
        li.mySelected = !li.mySelected;
        li.selectedCount = Math.max(0, li.selectedCount + (li.mySelected ? 1 : -1));
      }
      ensureBob();
      settlement = settlementMatrix(true);
      if (li) {
        li.selectedCount = 2;
        li.mySelected = true;
      }
      await json({ ok: true });
      return;
    }

    if (method === 'GET' && path === `/api/trips/${SLUG}/settlement`) {
      ensureBob();
      await json(settlement);
      return;
    }

    if (method === 'POST' && path === `/api/trips/${SLUG}/finish`) {
      state.trip.finishedAt = new Date().toISOString();
      await json({ ok: true });
      return;
    }

    await json({ error: `Unmocked ${method} ${path}` }, 500);
  });

  return { state, getSettlement: () => settlement };
}
