import { Page, expect } from '@playwright/test';

/**
 * Log in through the UI and wait for the dashboard to load.
 */
export async function login(
  page: Page,
  username = 'admin',
  password = 'admin123',
) {
  await page.goto('/login');
  await page.getByPlaceholder('Enter your username').fill(username);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait for redirect to dashboard
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
}
