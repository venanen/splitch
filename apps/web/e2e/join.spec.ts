import { test, expect } from '@playwright/test';
import { fillByLabel, SLUG } from './mocks';

test('вход в комнату по ссылке', async ({ page }) => {
  let joined = false;

  await page.route(
    (url) => url.pathname === '/api' || url.pathname.startsWith('/api/'),
    async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;
    const fulfill = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });

    if (method === 'GET' && path === `/api/trips/${SLUG}`) {
      await fulfill({
        trip: { id: 'trip-e2e-1', slug: SLUG, name: 'Карелия e2e', finishedAt: null },
        me: joined ? { participantId: 'p-bob', isAdmin: false } : null,
        participants: [
          {
            id: 'p-admin',
            name: 'Админ',
            phone: '79991112233',
            bank: 'Тинькофф',
            isAdmin: true,
          },
          ...(joined
            ? [
                {
                  id: 'p-bob',
                  name: 'Боб',
                  phone: '79990001122',
                  bank: 'Сбер',
                  isAdmin: false,
                },
              ]
            : []),
        ],
        receipts: [],
        lineItems: [],
      });
      return;
    }

    if (method === 'POST' && path === `/api/trips/${SLUG}/join`) {
      joined = true;
      await fulfill({
        tripId: 'trip-e2e-1',
        participantId: 'p-bob',
        sessionToken: 'token-bob',
      });
      return;
    }

    await fulfill({ error: `Unmocked ${method} ${path}` }, 500);
  });

  await page.goto(`/t/${SLUG}`);
  await expect(page.getByText('Вход в комнату')).toBeVisible();

  await fillByLabel(page, 'Имя', 'Боб');
  await fillByLabel(page, 'Пароль участника (личный)', 'bobpass1');
  await fillByLabel(page, 'Телефон', '9990001122');
  await fillByLabel(page, 'Банк', 'Сбер');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { name: 'Карелия e2e' })).toBeVisible();
  await expect(page.getByText('Участники')).toBeVisible();
});
