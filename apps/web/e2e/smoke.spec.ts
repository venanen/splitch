import { test, expect } from '@playwright/test';

/** Дымовой тест сборки; точность расчётов — в @splitch/calc (Vitest). */
test('главная: заголовок и форма создания комнаты', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('splich', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать комнату' })).toBeVisible();
});
