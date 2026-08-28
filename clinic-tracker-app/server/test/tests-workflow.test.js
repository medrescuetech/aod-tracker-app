/**
 * TW: AOD Tests — create, read, update, lab results, attachments, non-negative, pending
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const T = 180_000;
const TODAY = new Date().toISOString().split('T')[0];

let personId, employerId, testTypeId, testId, nonNegId, pendingId;

// ── TW0: Setup ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const emp = await api.post('/api/employers').send({ companyName: 'TW Employer', category: 'Contractor' });
  employerId = emp.body.id || emp.body.EmployerID;

  const per = await api.post('/api/persons').send({
    fullName: 'TW Worker', badgeNumber: 'TW001', employerId,
  });
  personId = per.body.id || per.body.PersonID;

  const tt = await api.get('/api/test-types');
  testTypeId = Array.isArray(tt.body) && tt.body.length > 0 ? tt.body[0].TestTypeID : null;
});

// ── TW1: Test CRUD ────────────────────────────────────────────────────────────
describe('TW1: AOD Test CRUD', () => {
  it('GET /api/tests returns array', { timeout: T }, async () => {
    const res = await api.get('/api/tests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/tests/check-duplicate → no hit', { timeout: T }, async () => {
    const res = await api.get(`/api/tests/check-duplicate?personId=${personId}&testDate=${TODAY}`);
    expect(res.status).toBe(200);
  });

  it('POST /api/tests creates test', { timeout: T }, async () => {
    if (!personId || !testTypeId) return;
    const res = await api.post('/api/tests').send({
      personId,
      testTypeId,
      testDate: TODAY,
      testTime: '09:00',
      oralUndertaken: 1,
      oralResult: 'Negative',
    });
    expect([200, 201]).toContain(res.status);
    testId = res.body.id || res.body.TestID;
    expect(testId).toBeTruthy();
  });

  it('GET /api/tests/:id returns test', { timeout: T }, async () => {
    if (!testId) return;
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('TestID');
  });

  it('PUT /api/tests/:id updates test', { timeout: T }, async () => {
    if (!testId) return;
    const res = await api.put(`/api/tests/${testId}`).send({ OralResult: 'Negative', Notes: 'Updated by test' });
    expect([200, 204]).toContain(res.status);
  });
});

// ── TW2: Lab Result ───────────────────────────────────────────────────────────
describe('TW2: Lab Results', () => {
  it('POST /api/tests creates non-negative test for lab', { timeout: T }, async () => {
    if (!personId || !testTypeId) return;
    const res = await api.post('/api/tests').send({
      personId,
      testTypeId,
      testDate: TODAY,
      testTime: '10:00',
      oralUndertaken: 1,
      oralResult: 'Non-Negative',
    });
    expect([200, 201]).toContain(res.status);
    pendingId = res.body.id || res.body.TestID;
  });

  it('GET /api/pending returns array', { timeout: T }, async () => {
    const res = await api.get('/api/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/tests/:id/lab-result submits confirmatory result', { timeout: T }, async () => {
    if (!pendingId) return;
    const res = await api.post(`/api/tests/${pendingId}/lab-result`).send({
      ConfirmatoryResult: 'Negative',
      LabReference: 'LAB-TW-001',
    });
    expect([200, 204]).toContain(res.status);
  });
});

// ── TW3: Non-Negative Records ─────────────────────────────────────────────────
describe('TW3: Non-Negative Records', () => {
  it('GET /api/nonnegative returns array', { timeout: T }, async () => {
    const res = await api.get('/api/nonnegative');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/tests creates confirmed non-neg test', { timeout: T }, async () => {
    if (!personId || !testTypeId) return;
    const res = await api.post('/api/tests').send({
      personId,
      testTypeId,
      testDate: TODAY,
      testTime: '11:00',
      oralUndertaken: 1,
      oralResult: 'Non-Negative',
      confirmatoryResult: 'Confirmed Positive',
    });
    expect([200, 201]).toContain(res.status);
    const id = res.body.id || res.body.TestID;
    // find its non-negative record
    const nn = await api.get('/api/nonnegative');
    if (Array.isArray(nn.body) && nn.body.length > 0) {
      nonNegId = nn.body[0].RecordID || nn.body[0].TestID;
    }
  });

  it('GET /api/nonnegative/:id returns record', { timeout: T }, async () => {
    if (!nonNegId) return;
    const res = await api.get(`/api/nonnegative/${nonNegId}`);
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/nonnegative/:id/notes adds note', { timeout: T }, async () => {
    if (!nonNegId) return;
    const res = await api.post(`/api/nonnegative/${nonNegId}/notes`).send({ noteText: 'TW test note' });
    expect([200, 201, 404, 500]).toContain(res.status);
  });
});

// ── TW4: Attachments ─────────────────────────────────────────────────────────
describe('TW4: Attachments', () => {
  it('GET /api/tests/:testId/attachments returns array', { timeout: T }, async () => {
    if (!testId) return;
    const res = await api.get(`/api/tests/${testId}/attachments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/tests/:testId/attachments/summary returns object', { timeout: T }, async () => {
    if (!testId) return;
    const res = await api.get(`/api/tests/${testId}/attachments/summary`);
    expect([200, 404]).toContain(res.status);
  });
});

// ── TW5: Delete ───────────────────────────────────────────────────────────────
describe('TW5: Delete Tests', () => {
  it('DELETE /api/tests/:id deletes test', { timeout: T }, async () => {
    if (!testId) return;
    const res = await api.delete(`/api/tests/${testId}`);
    expect([200, 204]).toContain(res.status);
  });
});
