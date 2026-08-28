import { afterAll, beforeAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = process.env.DB_PATH;

afterAll(() => {
  if (TEST_DB && existsSync(TEST_DB)) {
    try { unlinkSync(TEST_DB); } catch {}
  }
});
