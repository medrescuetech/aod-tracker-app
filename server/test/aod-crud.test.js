/**
 * AOD Test CRUD Tests (≤ 3 min)
 *
 * Covers:
 *   C1  Create test (minimal fields)
 *   C2  Create test (full fields)
 *   C3  GET /api/tests list + filters
 *   C4  GET /api/tests/:id
 *   C5  PUT /api/tests/:id (edit)
 *   C6  Duplicate detection (check-duplicate endpoint)
 *   C7  Validation — missing required fields
 *   C8  DELETE /api/tests/:id (soft or hard)
 *   C9  GET /api/tests/:id 404 for unknown
 *   C10 Test number uniqueness within a day
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const TODAY = new Date().toISOString().split('T')[0];
const testIds = [];

const makeTest = (overrides = {}) => ({
  testDate: TODAY,
  testTime: '07:30',
  donorName: `__CRUD Worker ${Date.now()}__`,
  donorEmployer: null,
  testTypeId: 1,
  bacUndertaken: true,
  bacInitialValue: 0,
  bacInitialTime: '07:30',
  oralUndertaken: false,
  urineUndertaken: false,
  ...overrides,
});

afterAll(async () => {
  for (const id of testIds) {
    try { await api.delete(`/api/tests/${id}`); } catch {}
  }
});

// ── C1 Minimal creation ───────────────────────────────────────────────────────
describe('C1: Create test — minimal fields', () => {
  it('POST /api/tests returns 200 with id and testNumber', async () => {
    const res = await api.post('/api/tests').send(makeTest());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('testNumber');
    expect(res.body.testNumber).toMatch(/^AOD-\d{8}-\d{3}$/);
    testIds.push(res.body.id);
  });
});

// ── C2 Full-field creation ────────────────────────────────────────────────────
describe('C2: Create test — all fields', () => {
  let testId;

  it('POST with all screening fields returns 200', async () => {
    const res = await api.post('/api/tests').send(makeTest({
      donorName: '__CRUD Full Worker__',
      donorDOB: '1990-05-15',
      donorBadge: 'TW-999',
      bacUndertaken: true,
      bacInitialValue: 0.000,
      bacInitialTime: '07:30',
      bacFinalValue: 0.000,
      bacFinalTime: '07:52',
      oralUndertaken: true,
      oralResult: 'Negative',
      oralControlLines: 'Present',
      notes: 'Pre-shift random test',
      sampleSentToLab: false,
    }));
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET returns all fields correctly populated', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.BACUndertaken).toBe(1);
    expect(res.body.OralUndertaken).toBe(1);
    expect(res.body.OralResult).toBe('Negative');
    expect(res.body.Notes).toBe('Pre-shift random test');
  });
});

// ── C3 List + filters ────────────────────────────────────────────────────────
describe('C3: GET /api/tests — list and filters', () => {
  it('returns an array', async () => {
    const res = await api.get('/api/tests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('date range filter returns subset', async () => {
    const res = await api.get('/api/tests').query({ dateFrom: TODAY, dateTo: TODAY });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(t => expect(t.TestDate).toBe(TODAY));
  });

  it('limit param restricts results', async () => {
    const res = await api.get('/api/tests').query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(2);
  });

  it('isPending filter returns only pending tests', async () => {
    const res = await api.get('/api/tests').query({ isPending: 'true' });
    expect(res.status).toBe(200);
    res.body.forEach(t => expect(t.IsPending).toBe(1));
  });
});

// ── C4 GET single test ───────────────────────────────────────────────────────
describe('C4: GET /api/tests/:id', () => {
  let testId;

  beforeAll(async () => {
    const res = await api.post('/api/tests').send(makeTest({ donorName: '__CRUD Get Test__' }));
    testId = res.body.id;
    testIds.push(testId);
  });

  it('returns the test record with joined fields', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('TestID', testId);
    expect(res.body).toHaveProperty('TestNumber');
    expect(res.body).toHaveProperty('PersonName');
  });

  it('404 for non-existent id', async () => {
    const res = await api.get('/api/tests/999999');
    expect(res.status).toBe(404);
  });
});

// ── C5 Edit (PUT) ────────────────────────────────────────────────────────────
describe('C5: PUT /api/tests/:id — edit test', () => {
  let testId, originalNumber;

  beforeAll(async () => {
    const res = await api.post('/api/tests').send(makeTest({ donorName: '__CRUD Edit Test__' }));
    testId = res.body.id;
    originalNumber = res.body.testNumber;
    testIds.push(testId);
  });

  it('updates notes field', async () => {
    const getRes = await api.get(`/api/tests/${testId}`);
    const t = getRes.body;
    const res = await api.put(`/api/tests/${testId}`).send({
      testDate: t.TestDate,
      testTime: t.TestTime,
      testTypeId: t.TestTypeID || 1,
      bacUndertaken: t.BACUndertaken,
      bacInitialValue: t.BACInitialValue,
      bacInitialTime: t.BACInitialTime,
      oralUndertaken: t.OralUndertaken,
      urineUndertaken: t.UrineUndertaken,
      notes: 'Updated note from test',
    });
    expect(res.status).toBe(200);
  });

  it('GET reflects updated note', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.Notes).toBe('Updated note from test');
    expect(res.body.TestNumber).toBe(originalNumber);
  });
});

// ── C6 Duplicate detection ───────────────────────────────────────────────────
describe('C6: Duplicate detection — check-duplicate endpoint', () => {
  let donorName;

  beforeAll(async () => {
    donorName = `__CRUD Dup Worker ${Date.now()}__`;
    const res = await api.post('/api/tests').send(makeTest({ donorName }));
    testIds.push(res.body.id);
  });

  it('check-duplicate finds existing test by name + date', async () => {
    const res = await api.get('/api/tests/check-duplicate').query({
      testDate: TODAY,
      donorName,
    });
    expect(res.status).toBe(200);
    expect(res.body.hasDuplicate).toBe(true);
    expect(res.body.existingTest).toHaveProperty('TestNumber');
    expect(res.body.existingTest.FullName).toBe(donorName);
  });

  it('check-duplicate returns false for unknown name', async () => {
    const res = await api.get('/api/tests/check-duplicate').query({
      testDate: TODAY,
      donorName: '__Definitely Not Existing Person XYZ__',
    });
    expect(res.status).toBe(200);
    expect(res.body.hasDuplicate).toBe(false);
  });

  it('check-duplicate returns false for different date', async () => {
    const res = await api.get('/api/tests/check-duplicate').query({
      testDate: '2000-01-01',
      donorName,
    });
    expect(res.body.hasDuplicate).toBe(false);
  });
});

// ── C7 Validation ────────────────────────────────────────────────────────────
describe('C7: Validation — missing required fields', () => {
  it('POST without donorName or personId → 400', async () => {
    const res = await api.post('/api/tests').send({
      testDate: TODAY,
      testTypeId: 1,
      bacUndertaken: false,
      oralUndertaken: false,
      urineUndertaken: false,
    });
    expect(res.status).toBe(400);
  });
});

// ── C8 Delete ────────────────────────────────────────────────────────────────
describe('C8: DELETE /api/tests/:id', () => {
  let testId;

  beforeAll(async () => {
    const res = await api.post('/api/tests').send(makeTest({ donorName: '__CRUD Delete Test__' }));
    testId = res.body.id;
  });

  it('deletes the test record', async () => {
    const res = await api.delete(`/api/tests/${testId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('GET returns 404 after deletion', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(404);
  });
});

// ── C11 BAC = 0 round-trip (regression: empty string must not corrupt REAL column) ──
describe('C11: BAC = 0 round-trip through PUT', () => {
  let testId;

  beforeAll(async () => {
    const res = await api.post('/api/tests').send(makeTest({
      donorName: '__BAC Zero Regression__',
      bacUndertaken: true,
      bacInitialValue: 0,
      bacInitialTime: '07:00',
    }));
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET after create: BACInitialValue = 0, BACFinalValue = null, FinalBACOutcome = Negative', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.BACInitialValue).toBe(0);
    expect(res.body.BACFinalValue).toBeNull();
    expect(res.body.FinalBACOutcome).toBe('Negative');
  });

  it('PUT with bacFinalValue="" (frontend empty field) still stores null, not "" string', async () => {
    const getRes = await api.get(`/api/tests/${testId}`);
    const t = getRes.body;
    const res = await api.put(`/api/tests/${testId}`).send({
      testDate: t.TestDate, testTime: t.TestTime, testTypeId: t.TestTypeID || 1,
      bacUndertaken: 1, bacInitialValue: 0, bacInitialTime: t.BACInitialTime,
      bacFinalValue: '', bacFinalTime: '',
      oralUndertaken: t.OralUndertaken, urineUndertaken: t.UrineUndertaken,
      notes: 'regression: BAC=0 PUT test',
    });
    expect(res.status).toBe(200);
  });

  it('GET after PUT: BACInitialValue still 0, BACFinalValue still null, not empty string', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.BACInitialValue).toBe(0);
    expect(res.body.BACFinalValue).toBeNull();         // NOT '' (the regression)
    expect(res.body.FinalBACOutcome).toBe('Negative');
    expect(res.body.TestStatus).toBe('Closed');
  });

  it('PUT with bacInitialValue="0.000" string (after formatBAC) is parsed to numeric 0', async () => {
    const getRes = await api.get(`/api/tests/${testId}`);
    const t = getRes.body;
    const res = await api.put(`/api/tests/${testId}`).send({
      testDate: t.TestDate, testTime: t.TestTime, testTypeId: t.TestTypeID || 1,
      bacUndertaken: 1, bacInitialValue: '0.000', bacInitialTime: t.BACInitialTime,
      bacFinalValue: '', bacFinalTime: '',
      oralUndertaken: t.OralUndertaken, urineUndertaken: t.UrineUndertaken,
      notes: t.Notes,
    });
    expect(res.status).toBe(200);
    const getRes2 = await api.get(`/api/tests/${testId}`);
    expect(getRes2.body.BACInitialValue).toBe(0);      // string "0.000" → numeric 0
    expect(getRes2.body.FinalBACOutcome).toBe('Negative');
  });
});

// ── C10 Test number uniqueness ────────────────────────────────────────────────
describe('C10: Test number uniqueness', () => {
  it('two tests on the same day have different sequential numbers', async () => {
    const r1 = await api.post('/api/tests').send(makeTest({ donorName: '__SeqA__' }));
    const r2 = await api.post('/api/tests').send(makeTest({ donorName: '__SeqB__' }));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    testIds.push(r1.body.id, r2.body.id);
    expect(r1.body.testNumber).not.toBe(r2.body.testNumber);
    const n1 = parseInt(r1.body.testNumber.split('-').pop());
    const n2 = parseInt(r2.body.testNumber.split('-').pop());
    expect(n2).toBe(n1 + 1);
  });
});
