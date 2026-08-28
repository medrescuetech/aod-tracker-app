import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Authentication', () => {
  test('shows login page with username and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Clinic Tracker' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your username').fill('wrong');
    await page.getByPlaceholder('Enter your password').fill('wrong');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.bg-red-50')).toContainText('Invalid credentials');
  });

  test('logs in with admin/admin123 and sees dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Sidebar navigation visible
    await expect(page.getByRole('link', { name: 'AOD History' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('persists session on page reload', async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
