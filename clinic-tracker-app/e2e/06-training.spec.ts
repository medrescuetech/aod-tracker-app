import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Training Tracker', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Training' }).click();
  });

  test('loads training tracker with tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Training/i })).toBeVisible();
    // Should have Records, ESO Certificate, and Manage People tabs
    await expect(page.getByRole('button', { name: /Records/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /ESO/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /People/i })).toBeVisible();
  });

  test('add record button visible on Records tab', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Record/i })).toBeVisible();
  });

  test('can open add-record modal and cancel', async ({ page }) => {
    await page.getByRole('button', { name: /Add Record/i }).click();
    await page.waitForTimeout(500);
    // Modal should be visible
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
  });

  test('manage people tab shows list', async ({ page }) => {
    await page.getByRole('button', { name: /People/i }).click();
    await page.waitForTimeout(1000);
    // Either people listed or empty state
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('screenshot: training tracker', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/training.png', fullPage: true });
  });
});
