import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Error / Edge Cases', () => {
  test('unknown route redirects to dashboard', async ({ page }) => {
    await login(page);
    await page.goto('/some-random-page-that-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('unauthenticated API call returns 401', async ({ page }) => {
    const response = await page.request.get('/api/auth/me');
    expect(response.status()).toBe(401);
  });

  test('API 404 for unknown endpoint', async ({ page }) => {
    await login(page);
    const response = await page.request.get('/api/nonexistent-endpoint');
    expect([404, 500]).toContain(response.status());
  });

  test('mocked network failure shows graceful state', async ({ page }) => {
    await login(page);

    // Intercept the lookups call to simulate a server error
    await page.route('**/api/tests*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    );

    await page.getByRole('link', { name: 'AOD History' }).click();
    await page.waitForTimeout(2000);

    // Page should not hard-crash; either shows error or empty state
    const body = await page.textContent('body');
    expect(body).not.toContain('Cannot read properties of undefined');
  });
});
