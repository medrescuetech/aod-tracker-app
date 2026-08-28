import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Visual regression tests — compare screenshots against baselines.
 * On first run these create the baseline images.
 * On subsequent runs they flag pixel differences.
 *
 * Update baselines:  npx playwright test --update-snapshots
 */

const PAGES = [
  { nav: null,               name: 'dashboard' },
  { nav: 'Record Test',      name: 'new-test' },
  { nav: 'AOD History',      name: 'test-history' },
  { nav: 'Patient Tracker',  name: 'patient-tracker' },
  { nav: 'Scheduling',       name: 'scheduling' },
  { nav: 'Training',         name: 'training' },
  { nav: 'Testing Mgmt',     name: 'testing-mgmt' },
  { nav: 'Reports',          name: 'reports-hub' },
  { nav: 'Settings',         name: 'settings' },
] as const;

for (const { nav, name } of PAGES) {
  test(`visual: ${name}`, async ({ page }) => {
    await login(page);
    if (nav) {
      await page.getByRole('link', { name: nav }).click();
      await page.waitForTimeout(1500); // allow data to load
    }
    await expect(page).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });
}
