import { defineConfig } from 'vitest/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DB_PATH: join(__dirname, 'database', 'test_aod_tracker.db'),
    },
    setupFiles: ['./test/setup.js'],
    testTimeout: 180_000,   // 3 minutes per test; if it hangs → marked failed
    hookTimeout: 30_000,    // 30s for beforeAll/afterAll
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },  // one process at a time → no DB file lock contention
    },
    // Run files sequentially so they share one DB without race conditions
    sequence: { concurrent: false },
    include: [
      // Original test suite
      'test/api.test.js',
      'test/aod-workflow.test.js',
      'test/aod-crud.test.js',
      'test/patients.test.js',
      'test/scheduling.test.js',
      'test/admin.test.js',
      'test/training.test.js',
      'test/referral-options.test.js',
      'test/testing-management.test.js',
      // Comprehensive new test suite (all routes / forms / DB objects)
      'test/core-lookups.test.js',
      'test/persons-workers.test.js',
      'test/tests-workflow.test.js',
      'test/patient-events.test.js',
      'test/scheduling-random.test.js',
      'test/reports-all.test.js',
      'test/admin-documents.test.js',
    ],
    reporters: ['verbose'],
  },
});
