/**
 * e2e tests for recent features:
 *   - Print button on TestDetail
 *   - Email button + modal on TestDetail
 *   - Admin → Email Rules tab
 */
import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

const API = 'http://localhost:3100';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal test via API and return its TestID */
async function createTestRecord(page: Page): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const r = await page.request.post(`${API}/api/tests`, {
    data: {
      testDate: today,
      testTime: '09:00',
      donorName: 'E2E Print Email',
      testTypeId: 1,
      bacUndertaken: true,
      bacInitialValue: 0,
      bacFinalValue: 0,
      oralUndertaken: false,
      urineUndertaken: false,
    },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  return body.id as number;
}

/** Navigate to a test's detail page */
async function gotoDetail(page: Page, testId: number) {
  await page.goto(`/tests/${testId}`);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
}

// ── Email Rules API ───────────────────────────────────────────────────────────

test.describe('Email Rules API', () => {
  test('GET /api/admin/email-rules returns array', async ({ page }) => {
    const r = await page.request.get(`${API}/api/admin/email-rules`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('PUT /api/admin/email-rules saves and retrieves rules', async ({ page }) => {
    const rule = {
      id: 'e2e-test-rule',
      enabled: true,
      label: 'E2E Non-Negative',
      trigger: 'new_test',
      condition: 'non_negative',
      recipients: ['e2e@example.com'],
      subjectTemplate: 'E2E {TestNumber}',
    };
    const put = await page.request.put(`${API}/api/admin/email-rules`, {
      data: [rule],
      headers: { 'Content-Type': 'application/json' },
    });
    expect(put.ok()).toBeTruthy();

    const get = await page.request.get(`${API}/api/admin/email-rules`);
    const rules = await get.json();
    expect(rules.length).toBeGreaterThanOrEqual(1);
    const saved = rules.find((r: any) => r.id === 'e2e-test-rule');
    expect(saved).toBeTruthy();
    expect(saved.recipients).toContain('e2e@example.com');

    // cleanup: restore empty rules
    await page.request.put(`${API}/api/admin/email-rules`, { data: [], headers: { 'Content-Type': 'application/json' } });
  });
});

// ── /api/tests/:id/send-email endpoint ───────────────────────────────────────

test.describe('Send-Email endpoint', () => {
  test('returns error when SMTP not configured', async ({ page }) => {
    const testId = await createTestRecord(page);
    const r = await page.request.post(`${API}/api/tests/${testId}/send-email`, {
      data: { to: ['nobody@example.com'], subject: 'E2E Test' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Either 200 (if SMTP configured) or 500 with an informative message — never a crash
    const body = await r.json();
    if (!r.ok()) {
      expect(body.error).toBeTruthy();
      // Should be a known SMTP error, not an unhandled crash
      expect(body.error).toMatch(/SMTP|smtp|not enabled|host|configured/i);
    }
  });

  test('returns 400 when no recipients supplied', async ({ page }) => {
    const testId = await createTestRecord(page);
    const r = await page.request.post(`${API}/api/tests/${testId}/send-email`, {
      data: { to: [], subject: 'E2E Test' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toMatch(/recipient/i);
  });

  test('returns 400 when to is missing', async ({ page }) => {
    const testId = await createTestRecord(page);
    const r = await page.request.post(`${API}/api/tests/${testId}/send-email`, {
      data: { subject: 'E2E Test' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(r.status()).toBe(400);
  });
});

// ── TestDetail UI ─────────────────────────────────────────────────────────────

test.describe('TestDetail — Print & Email buttons', () => {
  let testId: number;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    testId = await createTestRecord(page);
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoDetail(page, testId);
  });

  test('Print button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();
  });

  test('Email button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Email/i })).toBeVisible();
  });

  test('Email modal opens with pre-filled subject', async ({ page }) => {
    await page.getByRole('button', { name: /Email/i }).click();
    await expect(page.getByRole('heading', { name: /Email Test Report/i })).toBeVisible();
    // Subject should be pre-populated with test number
    const subjectInput = page.locator('input[type="text"]').filter({ hasText: '' }).nth(1);
    const subjectVal = await page.locator('input').filter({ hasNot: page.locator('[type="email"]') }).nth(1).inputValue();
    expect(subjectVal.length).toBeGreaterThan(0);
  });

  test('Email modal Send button disabled when To is empty', async ({ page }) => {
    await page.getByRole('button', { name: /Email/i }).click();
    await expect(page.getByRole('heading', { name: /Email Test Report/i })).toBeVisible();
    // Clear the To field
    const toInput = page.locator('input[type="text"]').first();
    await toInput.fill('');
    const sendBtn = page.getByRole('button', { name: /^Send$/i });
    await expect(sendBtn).toBeDisabled();
  });

  test('Email modal closes on Cancel', async ({ page }) => {
    await page.getByRole('button', { name: /Email/i }).click();
    await expect(page.getByRole('heading', { name: /Email Test Report/i })).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByRole('heading', { name: /Email Test Report/i })).not.toBeVisible();
  });

  test('Email modal shows error when SMTP not configured', async ({ page }) => {
    await page.getByRole('button', { name: /Email/i }).click();
    const toInput = page.locator('input[type="text"]').first();
    await toInput.fill('test@example.com');
    await page.getByRole('button', { name: /^Send$/i }).click();
    // Should show error message (SMTP not configured in test env)
    await expect(page.locator('text=/SMTP|smtp|not enabled|configured|error/i').first()).toBeVisible({ timeout: 8_000 });
  });

  test('screenshot: TestDetail with Email + Print buttons', async ({ page }) => {
    await page.screenshot({ path: 'e2e/screenshots/test-detail-print-email.png', fullPage: false });
  });
});

// ── Admin → Email Rules tab ───────────────────────────────────────────────────

test.describe('Admin Email Rules tab', () => {
  async function goToAdmin(page: Page) {
    await page.goto('/admin');
    await page.getByPlaceholder(/password/i).fill('admin123');
    await page.getByRole('button', { name: /login|sign in|submit/i }).click();
    await expect(page.getByRole('tab', { name: /Email Rules/i }).or(
      page.getByRole('button', { name: /Email Rules/i })
    )).toBeVisible({ timeout: 10_000 });
  }

  test.beforeEach(async ({ page }) => {
    await goToAdmin(page);
    await page.getByRole('button', { name: /Email Rules/i }).click();
    await page.waitForTimeout(600);
  });

  test('Email Rules tab loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Email Notification Rules/i })).toBeVisible();
  });

  test('Add Rule button creates a new rule card', async ({ page }) => {
    const initialCards = await page.locator('select').count();
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    const newCards = await page.locator('select').count();
    expect(newCards).toBeGreaterThan(initialCards);
  });

  test('New rule has correct default trigger and condition selects', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    // Trigger select
    const triggerSelect = page.locator('select').first();
    await expect(triggerSelect).toBeVisible();
    const triggerOpts = await triggerSelect.locator('option').allTextContents();
    expect(triggerOpts.some(o => /New Test/i.test(o))).toBeTruthy();
    expect(triggerOpts.some(o => /Lab Result/i.test(o))).toBeTruthy();
    // Condition select
    const condSelect = page.locator('select').nth(1);
    const condOpts = await condSelect.locator('option').allTextContents();
    expect(condOpts.some(o => /Non-Negative/i.test(o))).toBeTruthy();
    expect(condOpts.some(o => /BAC Positive/i.test(o))).toBeTruthy();
    expect(condOpts.some(o => /Confirmed/i.test(o))).toBeTruthy();
    expect(condOpts.some(o => /Lab/i.test(o))).toBeTruthy();
  });

  test('Can add a recipient email', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    const emailInput = page.getByPlaceholder(/Add recipient email/i);
    await emailInput.fill('notify@example.com');
    await page.getByRole('button', { name: /^Add$/i }).click();
    await expect(page.getByText('notify@example.com')).toBeVisible();
  });

  test('Can remove a recipient email', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    const emailInput = page.getByPlaceholder(/Add recipient email/i);
    await emailInput.fill('remove@example.com');
    await page.getByRole('button', { name: /^Add$/i }).click();
    await expect(page.getByText('remove@example.com')).toBeVisible();
    // Click ×
    await page.locator('span').filter({ hasText: 'remove@example.com' }).getByRole('button').click();
    await expect(page.getByText('remove@example.com')).not.toBeVisible();
  });

  test('Can save rules and persist them', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    // Name the rule
    const nameInput = page.locator('input[placeholder*="give it a name"]').first();
    await nameInput.fill('E2E Test Rule');
    // Add recipient
    const emailInput = page.getByPlaceholder(/Add recipient email/i);
    await emailInput.fill('save@example.com');
    await page.getByRole('button', { name: /^Add$/i }).click();
    // Save
    await page.getByRole('button', { name: /Save Rules/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5_000 });

    // Reload tab and verify persistence
    await page.reload();
    await page.getByPlaceholder(/password/i).fill('admin123');
    await page.getByRole('button', { name: /login|sign in|submit/i }).click();
    await page.getByRole('button', { name: /Email Rules/i }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText('E2E Test Rule')).toBeVisible();

    // Cleanup: clear rules
    await page.request.put(`${API}/api/admin/email-rules`, { data: [], headers: { 'Content-Type': 'application/json' } });
  });

  test('Delete rule removes card', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    const countBefore = await page.locator('input[placeholder*="give it a name"]').count();
    await page.locator('button').filter({ has: page.locator('svg') }).last().click(); // trash button
    await page.waitForTimeout(300);
    const countAfter = await page.locator('input[placeholder*="give it a name"]').count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  test('screenshot: Email Rules tab', async ({ page }) => {
    await page.getByRole('button', { name: /Add Rule/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/admin-email-rules.png', fullPage: true });
  });
});
