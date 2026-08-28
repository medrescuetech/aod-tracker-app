import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
  });

  test('loads settings page with tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /General/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Training/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Patient/i })).toBeVisible();
  });

  test('general tab shows clinicians and test types', async ({ page }) => {
    await page.waitForTimeout(1000);
    // Clinicians section
    await expect(page.getByText(/Clinician/i).first()).toBeVisible();
    // Test Types section with edit capability
    await expect(page.getByText(/Test Types/i).first()).toBeVisible();
    // Add Type button should exist
    await expect(page.getByRole('button', { name: /Add Type/i })).toBeVisible();
  });

  test('can open and close the Add Test Type modal', async ({ page }) => {
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Add Type/i }).click();
    await expect(page.getByRole('heading', { name: /Add Test Type/i })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Random')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. RND')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByRole('heading', { name: /Add Test Type/i })).not.toBeVisible();
  });

  test('training lists tab loads', async ({ page }) => {
    await page.getByRole('button', { name: /Training/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Competency Units/i)).toBeVisible();
  });

  test('patient lists tab loads referral options', async ({ page }) => {
    await page.getByRole('button', { name: /Patient/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Referral/i).first()).toBeVisible();
  });

  test('screenshot: settings', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/settings.png', fullPage: true });
  });
});
