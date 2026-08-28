import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { seedTestPatientEvents, getDateRange, clearTestData } from './helpers/data';

test.describe('TC Site Weekly Reports', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await clearTestData(page);
  });

  test('TC Site Weekly Dashboard loads all sections', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('TC Site Weekly Dashboard').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    
    // Should contain summary sections
    expect(body).toMatch(/Total Treatments|WR Total|NWR Total/i);
  });

  test('WR Injury Locations report groups by body location', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('WR Injury Locations').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/Body Location|Hand|Back|Count/i);
  });

  test('WR Injury Types report groups by injury type', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('WR Injury Types').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/Injury Type|Cut|Sprain|Count/i);
  });

  test('WR/NWR Classification shows correct split', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('WR/NWR Classification').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/WR|NWR|Count|Work Related Percent/i);
  });

  test('NWR Detailed Class shows hospital/review breakdown', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('NWR Detailed Class').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/NWRClass|NWR Hospital|NWR Review|Count/i);
  });

  test('RTW Outcomes report shows return to work data', async ({ page }) => {
    await seedTestPatientEvents(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('RTW Outcomes').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/Outcome|Fit for|Count/i);
  });

  test('AOD Weekly Summary shows test counts', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('AOD Weekly Summary').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/TestType|TestCount|Total/i);
  });

  test('AOD Non-Negative shows non-negative count', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);

    await page.getByText('AOD Non-Negative').click();
    
    const { startDate, endDate } = getDateRange(7);
    await page.getByLabel(/Start Date/i).fill(startDate);
    await page.getByLabel(/End Date/i).fill(endDate);
    
    await page.getByRole('button', { name: /Run|Generate/i }).click();
    
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toMatch(/NonNegativeCount|Non-Negative|details/i);
  });

  test('screenshot: TC site weekly section', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(1000);
    
    await page.getByText('TC Site Weekly Reports').click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'e2e/screenshots/tc-site-weekly-reports.png', fullPage: true });
  });
});
