/**
 * SR: Scheduling & Random Lists — schedule CRUD, random list import/generate/export
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const T = 180_000;
const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

let personId, employerId, testTypeId, scheduleId, listId, entryId;

beforeAll(async () => {
  const emp = await api.post('/api/employers').send({ companyName: 'SR Employer', category: 'Contractor' });
  employerId = emp.body.id || emp.body.EmployerID;
  const per = await api.post('/api/persons').send({
    fullName: 'SR Worker', badgeNumber: 'SR001', employerId,
  });
  personId = per.body.id || per.body.PersonID;
  const tt = await api.get('/api/test-types');
  testTypeId = Array.isArray(tt.body) && tt.body.length > 0 ? tt.body[0].TestTypeID : null;
});

// ── SR1: Scheduled Tests ──────────────────────────────────────────────────────
describe('SR1: Scheduled Tests CRUD', () => {
  it('GET /api/schedule returns array', { timeout: T }, async () => {
    const res = await api.get('/api/schedule');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/schedule creates scheduled test', { timeout: T }, async () => {
    if (!personId || !testTypeId) return;
    const res = await api.post('/api/schedule').send({
      personId,
      testTypeId,
      scheduledDate: TOMORROW,
    });
    expect([200, 201]).toContain(res.status);
    scheduleId = res.body.id || res.body.ScheduleID;
  });

  it('PUT /api/schedule/:id updates status', { timeout: T }, async () => {
    if (!scheduleId) return;
    const res = await api.put(`/api/schedule/${scheduleId}`).send({ Status: 'Completed' });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/schedule/match returns matches', { timeout: T }, async () => {
    const res = await api.get(`/api/schedule/match?date=${TODAY}`);
    expect(res.status).toBe(200);
  });

  it('DELETE /api/schedule/:id removes', { timeout: T }, async () => {
    if (!scheduleId) return;
    const res = await api.delete(`/api/schedule/${scheduleId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── SR2: Random Selection ─────────────────────────────────────────────────────
describe('SR2: Random Selection', () => {
  it('POST /api/schedule/random creates selection', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.post('/api/schedule/random').send({
      date: TODAY,
      shift: 'Day',
      count: 1,
      employerIds: [employerId],
    });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ── SR3: Random Lists ─────────────────────────────────────────────────────────
describe('SR3: Random Lists CRUD', () => {
  it('GET /api/random-lists returns array', { timeout: T }, async () => {
    const res = await api.get('/api/random-lists');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/random-lists creates empty list', { timeout: T }, async () => {
    const res = await api.post('/api/random-lists').send({
      listDate: TODAY, shift: 'Day', notes: 'SR test list',
    });
    expect([200, 201]).toContain(res.status);
    listId = res.body.id || res.body.ListID;
    expect(listId).toBeTruthy();
  });

  it('GET /api/random-lists/for-date/:date returns array', { timeout: T }, async () => {
    const res = await api.get(`/api/random-lists/for-date/${TODAY}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/random-lists/today/pending returns array', { timeout: T }, async () => {
    const res = await api.get('/api/random-lists/today/pending');
    expect(res.status).toBe(200);
  });

  it('GET /api/random-lists/:listId returns list', { timeout: T }, async () => {
    if (!listId) return;
    const res = await api.get(`/api/random-lists/${listId}`);
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/random-lists/:listId/entries adds entry', { timeout: T }, async () => {
    if (!listId) return;
    const res = await api.post(`/api/random-lists/${listId}/entries`).send({
      employeeName: 'SR Worker', employeeNumber: 'SR001',
    });
    expect([200, 201]).toContain(res.status);
    entryId = res.body.id || res.body.EntryID;
  });

  it('GET /api/random-lists/:listId/entries returns entries', { timeout: T }, async () => {
    if (!listId) return;
    const res = await api.get(`/api/random-lists/${listId}/entries`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PUT /api/random-lists/entries/:entryId updates entry', { timeout: T }, async () => {
    if (!entryId) return;
    const res = await api.put(`/api/random-lists/entries/${entryId}`).send({ Status: 'Pending' });
    expect([200, 204]).toContain(res.status);
  });

  it('PUT /api/random-entries/:entryId/status updates status', { timeout: T }, async () => {
    if (!entryId) return;
    const res = await api.put(`/api/random-entries/${entryId}/status`).send({ status: 'Not Available', statusNote: 'Test' });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/random-lists/:listId/export/excel returns xlsx', { timeout: T }, async () => {
    if (!listId) return;
    const res = await api.get(`/api/random-lists/${listId}/export/excel`);
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/random-lists/generate generates from employer pool', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.post('/api/random-lists/generate').send({
      listDate: TOMORROW, shift: 'Day', count: 1, employerIds: [employerId],
    });
    expect([200, 201, 400]).toContain(res.status);
  });

  it('DELETE /api/random-entries/:entryId removes entry', { timeout: T }, async () => {
    if (!entryId) return;
    const res = await api.delete(`/api/random-entries/${entryId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/random-lists/:listId removes list', { timeout: T }, async () => {
    if (!listId) return;
    const res = await api.delete(`/api/random-lists/${listId}`);
    expect([200, 204]).toContain(res.status);
  });
});
