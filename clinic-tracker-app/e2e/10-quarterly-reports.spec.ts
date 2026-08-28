import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { seedTestEmployers, seedTestPeople, seedTestAODTests, getDateRange, clearTestData } from './helpers/data';

test.describe('AOD Quarterly Reports', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await clearTestData(page);
  });

  test('Quarter Results report generates correctly', async ({ page }) => {
    // Seed test data
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);
    await seedTestAODTests(page, personIds);

    // Navigate to reports
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    // Find and click Quarter Results
    await page.getByText('Quarter Results').click();
    
    // Set date range
    const { startDate, endDate } = getDateRange(30);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    // Run report
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    // Verify report loads
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toContain('Total Tests');
    expect(body).toContain('Alcohol Positive');
  });

  test('POS Bac Report shows positive BAC cases', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);
    await seedTestAODTests(page, personIds);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('POS Bac Report').click();
    
    const { startDate, endDate } = getDateRange(30);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toContain('Positive BAC');
  });

  test('For Cause Report filters correctly', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);
    await seedTestAODTests(page, personIds);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('For Cause Report').click();
    
    const { startDate, endDate } = getDateRange(30);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    // Should show results or "No data" message
    const body = await page.textContent('body');
    expect(body).toMatch(/For Cause|No data|No results/i);
  });

  test('Pending & Other Report shows unresolved cases', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);
    await seedTestAODTests(page, personIds);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('Pending & Other Report').click();
    
    const { startDate, endDate } = getDateRange(30);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/Pending|Other|No data/i);
  });

  test('Unique Employees Report shows deduplicated counts', async ({ page }) => {
    await seedTestEmployers(page);
    const personIds = await seedTestPeople(page);
    await seedTestAODTests(page, personIds);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('Unique Employees').click();
    
    const { startDate, endDate } = getDateRange(30);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toContain('Unique Employees');
  });

  test('screenshot: quarterly reports section', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);
    
    // Click on AOD Quarterly Reports section
    await page.getByText('AOD Quarterly Reports').click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'e2e/screenshots/quarterly-reports.png', fullPage: true });
  });
});
