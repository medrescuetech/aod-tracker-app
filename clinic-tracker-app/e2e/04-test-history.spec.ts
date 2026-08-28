import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('AOD Test History', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'AOD History' }).click();
  });

  test('loads the test history page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /History|AOD/i })).toBeVisible();
  });

  test('table or empty state is displayed', async ({ page }) => {
    // Either a data table or an empty-state message
    const table = page.locator('table');
    const empty = page.getByText(/no tests|no records|no results|not found/i);
    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBeTruthy();
  });

  test('date filter controls are present', async ({ page }) => {
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test('can click into a test detail if rows exist', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      // Should navigate to detail page or open a detail view
      const heading = page.getByRole('heading').first();
      await expect(heading).toBeVisible();
    }
  });

  test('screenshot: test history', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/test-history.png', fullPage: true });
  });
});
