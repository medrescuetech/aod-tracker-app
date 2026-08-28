import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Reports Hub', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Reports' }).click();
  });

  test('loads reports hub with tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Reports/i })).toBeVisible();
    // Three tabs: Reports, Custom Builder, Saved Templates
    await expect(page.getByRole('button', { name: /Reports/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Custom/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Template/i })).toBeVisible();
  });

  test('report categories are listed', async ({ page }) => {
    await page.waitForTimeout(1000);
    // At least one report category visible
    const categories = page.locator('text=/AOD|Compliance|Executive|Training/i');
    await expect(categories.first()).toBeVisible();
  });

  test('custom builder tab loads', async ({ page }) => {
    await page.getByRole('button', { name: /Custom/i }).click();
    await page.waitForTimeout(500);
    // Should see dataset selector or group-by controls
    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
  });

  test('screenshot: reports hub', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/reports-hub.png', fullPage: true });
  });
});
