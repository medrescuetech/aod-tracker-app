import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Scheduling', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Scheduling' }).click();
  });

  test('loads scheduling page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Schedul/i })).toBeVisible();
  });

  test('screenshot: scheduling', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/scheduling.png', fullPage: true });
  });
});
