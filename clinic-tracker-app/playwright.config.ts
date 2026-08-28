import { defineConfig, devices } from '@playwright/test';

const TEST_PORT = 3100;
const BASE_URL = process.env.BASE_URL || `http://localhost:${TEST_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,           // sequential – tests share a live DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 
   * NOTE: Start server manually before running tests:
   *   set PORT=3100 && set NODE_ENV=test && set SERVE_FRONTEND=1 && node server/index.js
   * Or use: npm run server:test (if configured)
   */
  // webServer: {
  //   command: `node server/index.js`,
  //   url: `http://localhost:${TEST_PORT}/api/health`,
  //   reuseExistingServer: true,
  //   env: {
  //     SERVE_FRONTEND: '1',
  //     PORT: String(TEST_PORT),
  //     NODE_ENV: 'test',
  //     DB_PATH: './server/database/e2e_test.db',
  //   },
  //   timeout: 60_000,
  // },
});
