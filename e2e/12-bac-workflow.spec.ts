import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { seedTestEmployers, seedTestPeople, getDateRange, clearTestData } from './helpers/data';

test.describe('BAC Workflow - Workplace Safety', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await clearTestData(page);
  });

  test('creating test with BAC=0 shows Negative outcome', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    // Navigate to new test
    await page.getByRole('link', { name: /AOD Test/i }).click();
    await page.getByRole('button', { name: /New Test/i }).click();

    // Fill test details
    await page.getByLabel(/Person/i).click();
    await page.getByText('John Smith').click();
    
    await page.getByLabel(/Test Type/i).selectOption('Random');
    
    // Enable BAC
    await page.getByLabel(/BAC Testing/i).check();
    
    // Enter BAC = 0
    await page.getByLabel(/Initial BAC/i).fill('0.000');
    
    // Should show Negative result
    await page.waitForTimeout(500);
    const resultText = await page.textContent('[data-testid="bac-result"]');
    expect(resultText).toContain('NEGATIVE');
  });

  test('creating test with BAC>0 shows Positive outcome and warning', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    await page.getByRole('link', { name: /AOD Test/i }).click();
    await page.getByRole('button', { name: /New Test/i }).click();

    await page.getByLabel(/Person/i).click();
    await page.getByText('Jane Doe').click();
    
    await page.getByLabel(/Test Type/i).selectOption('Random');
    
    await page.getByLabel(/BAC Testing/i).check();
    
    // Enter BAC > 0
    await page.getByLabel(/Initial BAC/i).fill('0.023');
    
    // Should show workplace violation warning
    await page.waitForTimeout(500);
    const body = await page.textContent('body');
    expect(body).toContain('WORKPLACE VIOLATION');
    expect(body).toContain('Any BAC > 0 is prohibited');
    
    // Should show Positive result
    expect(body).toContain('POSITIVE');
    
    // Should require Final BAC
    expect(body).toContain('Final BAC');
  });

  test('test detail page shows BAC warnings for positive cases', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    // Create a positive BAC test via API
    const today = new Date().toISOString().split('T')[0];
    await page.request.post('/api/aod-tests', {
      data: {
        testDate: today,
        testTime: '10:00',
        personId: personIds[0],
        testTypeId: 1,
        bacUndertaken: true,
        bacInitialValue: 0.025,
        bacFinalValue: 0.022,
        oralUndertaken: false,
        urineUndertaken: false
      }
    });

    // Navigate to test history
    await page.getByRole('link', { name: /AOD Test/i }).click();
    
    // Click on the test to view detail
    await page.getByText('0.022').first().click();
    
    await page.waitForTimeout(1000);
    
    // Should show warning
    const body = await page.textContent('body');
    expect(body).toContain('Non-zero reading');
    expect(body).toContain('Workplace: Any BAC > 0 is prohibited');
  });

  test('non-negative page shows BAC workplace warning', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    // Create a positive BAC test
    const today = new Date().toISOString().split('T')[0];
    await page.request.post('/api/aod-tests', {
      data: {
        testDate: today,
        testTime: '10:00',
        personId: personIds[0],
        testTypeId: 1,
        bacUndertaken: true,
        bacInitialValue: 0.025,
        oralUndertaken: false,
        urineUndertaken: false
      }
    });

    // Navigate to non-negative records
    await page.getByRole('link', { name: /Non-Negative/i }).click();
    await page.waitForTimeout(1000);
    
    // Click on the record
    await page.getByText('View').first().click();
    
    await page.waitForTimeout(1000);
    
    // Should show workplace warning
    const body = await page.textContent('body');
    expect(body).toContain('Workplace Violation');
  });

  test('reports show Positive BAC count correctly', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    // Create positive BAC test
    const today = new Date().toISOString().split('T')[0];
    await page.request.post('/api/aod-tests', {
      data: {
        testDate: today,
        testTime: '10:00',
        personId: personIds[0],
        testTypeId: 1,
        bacUndertaken: true,
        bacInitialValue: 0.025,
        oralUndertaken: true,
        oralResult: 'Negative',
        urineUndertaken: false
      }
    });

    // Navigate to reports
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.getByText('Daily AOD Activity').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    
    // Should show Positive BAC count
    expect(body).toMatch(/Positive BAC|Alcohol Positive/i);
  });

  test('screenshot: BAC positive warning', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);

    await page.getByRole('link', { name: /AOD Test/i }).click();
    await page.getByRole('button', { name: /New Test/i }).click();

    await page.getByLabel(/Person/i).click();
    await page.getByText('Jane Doe').click();
    
    await page.getByLabel(/Test Type/i).selectOption('Random');
    await page.getByLabel(/BAC Testing/i).check();
    await page.getByLabel(/Initial BAC/i).fill('0.023');
    
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'e2e/screenshots/bac-positive-warning.png', fullPage: true });
  });
});
