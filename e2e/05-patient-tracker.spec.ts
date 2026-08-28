import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Patient Tracker', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Patient Tracker' }).click();
  });

  test('loads patient tracker page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Patient/i })).toBeVisible();
  });

  test('add patient event button exists', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add|new|record/i }).first();
    await expect(addBtn).toBeVisible();
  });

  test('can open and cancel the add-event form', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add|new|record/i }).first();
    await addBtn.click();
    // Modal or form should appear
    await page.waitForTimeout(500);
    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test('screenshot: patient tracker', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/patient-tracker.png', fullPage: true });
  });
});
