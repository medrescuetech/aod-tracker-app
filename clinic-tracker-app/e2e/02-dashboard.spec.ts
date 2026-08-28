import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders dashboard heading and summary cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Should have at least one summary stat card
    const cards = page.locator('.bg-white.rounded-xl');
    await expect(cards.first()).toBeVisible();
  });

  test('sidebar navigation links work', async ({ page }) => {
    // Click through each major nav link and verify no error
    const links = [
      { name: 'AOD History', heading: /History|AOD/ },
      { name: 'Record Test', heading: /Record|New|Test/ },
      { name: 'Settings', heading: /Settings/ },
    ];

    for (const { name, heading } of links) {
      await page.getByRole('link', { name }).click();
      await expect(page.getByRole('heading').first()).toBeVisible();
      // Verify no crash – page loaded
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });

  test('screenshot: dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: true });
  });
});
