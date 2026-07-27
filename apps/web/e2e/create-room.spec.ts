import { test, expect } from '@playwright/test';
import { fillByLabel, fillByPlaceholder, installTripApiMocks, SLUG } from './mocks';

test('создание комнаты → редирект в поездку', async ({ page }) => {
  await installTripApiMocks(page);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Создать комнату' })).toBeVisible();

  await fillByPlaceholder(page, 'Например, Карелия май 2026', 'Карелия e2e');
  await fillByPlaceholder(page, 'Как к вам обращаться', 'Админ');
  await fillByLabel(page, 'Пароль участника (личный)', 'pass1234');
  await fillByLabel(page, 'Телефон', '9991112233');
  await fillByPlaceholder(page, 'Тинькофф, по номеру телефона …', 'Тинькофф');

  await page.getByRole('button', { name: 'Создать комнату' }).click();

  await expect(page).toHaveURL(new RegExp(`/t/${SLUG}`));
  await expect(page.getByRole('heading', { name: 'Карелия e2e' })).toBeVisible();
  await expect(page.getByText('Участники')).toBeVisible();
});
