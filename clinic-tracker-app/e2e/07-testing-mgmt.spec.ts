import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Testing Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Testing Mgmt' }).click();
  });

  test('loads with tab navigation', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Testing/i })).toBeVisible();
    // Four tabs: DNA Log, Pending Tests, Pending Medicals, Random Generator
    await expect(page.getByRole('button', { name: 'DNA Log' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pending Tests' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pending Medicals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Random Generator' })).toBeVisible();
  });

  test('DNA tab loads', async ({ page }) => {
    await page.getByRole('button', { name: 'DNA Log' }).click();
    await page.waitForTimeout(500);
    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
  });

  test('Random Generator tab loads', async ({ page }) => {
    await page.getByRole('button', { name: 'Random Generator' }).click();
    await page.waitForTimeout(500);
    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
  });

  test('screenshot: testing management', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/testing-mgmt.png', fullPage: true });
  });
});
