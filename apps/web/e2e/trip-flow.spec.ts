import { test, expect, type Page } from '@playwright/test';
import {
  ADMIN_TOKEN,
  EXPECTED_DEBT_KOPECKS,
  expectedRub,
  fillByLabel,
  installTripApiMocks,
  SLUG,
} from './mocks';

async function openTab(page: Page, name: string) {
  await page.locator('.n-tabs-tab').filter({ hasText: name }).click();
}

test('флоу: ручная позиция → отметка → финал с суммой → завершение', async ({
  page,
}) => {
  await installTripApiMocks(page);

  await page.addInitScript((token) => {
    localStorage.setItem('splich_session', token);
    localStorage.setItem('splich_last_trip', 'e2e-trip');
  }, ADMIN_TOKEN);

  await page.goto(`/t/${SLUG}`);
  await expect(page.getByRole('heading', { name: 'Карелия e2e' })).toBeVisible();

  await openTab(page, 'Чеки');
  await page.getByRole('button', { name: 'Вручную' }).click();
  await fillByLabel(page, 'Название', 'Бензин');
  await fillByLabel(page, 'Цена, ₽', '300');
  await page.getByRole('button', { name: 'Добавить' }).click();

  await expect(page.getByText('Бензин').first()).toBeVisible();

  await openTab(page, 'Продукты');
  await expect(page.locator('.prod-row').filter({ hasText: 'Бензин' })).toBeVisible();
  await page.locator('.prod-row').filter({ hasText: 'Бензин' }).locator('.n-tag').click();

  await openTab(page, 'Финал');
  await page.getByRole('button', { name: 'Обновить матрицу' }).click();

  const rub = expectedRub(EXPECTED_DEBT_KOPECKS);
  await expect(page.locator('.matrix')).toContainText(rub);
  await expect(page.locator('.matrix')).toContainText('Админ');
  await expect(page.locator('.matrix')).toContainText('Боб');

  await openTab(page, 'Админ');
  await page.getByRole('button', { name: 'Завершить поездку' }).click();
  await expect(page.getByText('Поездка закрыта')).toBeVisible({ timeout: 5000 });

  await openTab(page, 'Финал');
  await expect(page.getByText('Поездка еще не закрыта')).toHaveCount(0);
});
