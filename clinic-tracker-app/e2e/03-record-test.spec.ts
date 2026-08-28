import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Record AOD Test', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Record Test' }).click();
    await expect(page.getByRole('heading', { name: /Record|New.*Test/ })).toBeVisible();
  });

  test('form loads with required fields', async ({ page }) => {
    // Date / time should be pre-populated
    await expect(page.locator('input[type="date"]').first()).not.toHaveValue('');
    // Test type dropdown present
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('can fill and submit a basic AOD test', async ({ page }) => {
    // Fill donor name
    const nameInput = page.getByPlaceholder(/name|donor/i).first();
    await nameInput.fill('E2E Test Person');

    // Pick first test type if dropdown exists
    const testTypeSelect = page.locator('select').first();
    const options = await testTypeSelect.locator('option').allTextContents();
    if (options.length > 1) {
      await testTypeSelect.selectOption({ index: 1 });
    }

    // Enable BAC section and set initial BAC = 0
    const bacCheckbox = page.getByText(/BAC|Alcohol/i).first();
    if (await bacCheckbox.isVisible()) {
      await bacCheckbox.click();
      const bacInput = page.locator('input[placeholder*="0.000"], input[type="number"]').first();
      if (await bacInput.isVisible()) {
        await bacInput.fill('0.000');
      }
    }

    // Submit
    const submitBtn = page.getByRole('button', { name: /create test|save|submit/i });
    await submitBtn.click();

    // Should navigate away or show success (no stuck error)
    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('.bg-red-50, [role="alert"]').isVisible();
    // If there's a merge/duplicate modal, that's also acceptable
    const modalVisible = await page.locator('[class*="fixed"][class*="inset"]').isVisible();
    expect(errorVisible === false || modalVisible === true).toBeTruthy();
  });

  test('screenshot: new test form', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/new-test-form.png', fullPage: true });
  });
});
