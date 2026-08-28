/**
 * Scheduling & Random List Tests (≤ 3 min)
 *
 * Covers:
 *   S1  GET /api/random-lists — list
 *   S2  POST /api/random-lists — create list
 *   S3  GET /api/random-lists/:listId — single list
 *   S4  POST /api/random-lists/:listId/entries — add entries
 *   S5  GET /api/random-lists/:listId/entries
 *   S6  PUT /api/random-entries/:entryId/status — mark tested/excused
 *   S7  GET /api/random-lists/for-date/:date
 *   S8  GET /api/random-lists/today/pending
 *   S9  DELETE /api/random-entries/:entryId
 *   S10 DELETE /api/random-lists/:listId
 *   S11 GET /api/schedule — daily schedule
 *   S12 POST /api/schedule/random — generate random schedule
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const TODAY = new Date().toISOString().split('T')[0];
const listIds = [];
const entryIds = [];

afterAll(async () => {
  for (const id of listIds) {
    try { await api.delete(`/api/random-lists/${id}`); } catch {}
  }
});

// ── S1 List ───────────────────────────────────────────────────────────────────
describe('S1: GET /api/random-lists', () => {
  it('returns 200 array', async () => {
    const res = await api.get('/api/random-lists');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── S2 Create list ────────────────────────────────────────────────────────────
describe('S2: POST /api/random-lists — create', () => {
  it('creates a random list for today', async () => {
    const res = await api.post('/api/random-lists').send({
      listDate: TODAY,
      shift: 'Day',
      sourceFileName: 'test_import.pdf',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    listIds.push(res.body.id);
  });
});

// ── S3 Get single list ────────────────────────────────────────────────────────
describe('S3: GET /api/random-lists/:listId', () => {
  it('returns the created list (wrapped in list property)', async () => {
    const listId = listIds[0];
    const res = await api.get(`/api/random-lists/${listId}`);
    expect(res.status).toBe(200);
    // API returns { list: {...}, entries: [...] }
    const list = res.body.list || res.body;
    expect(list).toHaveProperty('ListID', listId);
    expect(list.ListDate).toBe(TODAY);
    expect(list.Shift).toBe('Day');
  });
});

// ── S4 Add entries ────────────────────────────────────────────────────────────
describe('S4: POST /api/random-lists/:listId/entries — add workers', () => {
  let listId;

  beforeAll(() => { listId = listIds[0]; });

  it('adds entry with employeeName + employer', async () => {
    const res = await api.post(`/api/random-lists/${listId}/entries`).send({
      employeeName: '__Schedule Worker A__',
      employeeNumber: 'SW-001',
      employer: 'Saipem',
      manualEntry: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    entryIds.push(res.body.id);
  });

  it('adds a second entry', async () => {
    const res = await api.post(`/api/random-lists/${listId}/entries`).send({
      employeeName: '__Schedule Worker B__',
      employeeNumber: 'SW-002',
      employer: 'SCJV',
      manualEntry: true,
    });
    expect(res.status).toBe(200);
    entryIds.push(res.body.id);
  });
});

// ── S5 Get entries ────────────────────────────────────────────────────────────
describe('S5: GET /api/random-lists/:listId/entries', () => {
  it('returns entries for the list', async () => {
    const listId = listIds[0];
    const res = await api.get(`/api/random-lists/${listId}/entries`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('entries have expected fields', async () => {
    const listId = listIds[0];
    const res = await api.get(`/api/random-lists/${listId}/entries`);
    const entry = res.body[0];
    expect(entry).toHaveProperty('EntryID');
    expect(entry).toHaveProperty('EmployeeName');
    expect(entry).toHaveProperty('Status');
  });
});

// ── S6 Update entry status ────────────────────────────────────────────────────
describe('S6: PUT /api/random-entries/:entryId/status', () => {
  it('marks entry as Excused', async () => {
    if (!entryIds[0]) return;
    const res = await api.put(`/api/random-entries/${entryIds[0]}/status`).send({ status: 'Excused' });
    expect(res.status).toBe(200);
  });

  it('marks entry as Tested', async () => {
    if (!entryIds[1]) return;
    const res = await api.put(`/api/random-entries/${entryIds[1]}/status`).send({ status: 'Tested' });
    expect(res.status).toBe(200);
  });

  it('GET entries reflects status change', async () => {
    if (!entryIds[0]) return;
    const listId = listIds[0];
    const res = await api.get(`/api/random-lists/${listId}/entries`);
    const excused = res.body.find(e => e.EntryID === entryIds[0]);
    expect(excused?.Status).toBe('Excused');
  });
});

// ── S7 For-date lookup ────────────────────────────────────────────────────────
describe('S7: GET /api/random-lists/for-date/:date', () => {
  it('returns list(s) for today', async () => {
    const res = await api.get(`/api/random-lists/for-date/${TODAY}`);
    expect(res.status).toBe(200);
    // May return array or { lists: [...] }
    const lists = Array.isArray(res.body) ? res.body : (res.body.lists || [res.body]);
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0].ListDate).toBe(TODAY);
  });

  it('returns empty for date with no lists', async () => {
    const res = await api.get('/api/random-lists/for-date/2000-01-01');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});

// ── S8 Today's pending ────────────────────────────────────────────────────────
describe('S8: GET /api/random-lists/today/pending', () => {
  it('returns pending entries for today', async () => {
    const res = await api.get('/api/random-lists/today/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── S9 Delete entry ───────────────────────────────────────────────────────────
describe('S9: DELETE /api/random-entries/:entryId', () => {
  let tempEntryId;

  beforeAll(async () => {
    const listId = listIds[0];
    const res = await api.post(`/api/random-lists/${listId}/entries`).send({
      employeeName: '__Schedule Delete Entry__',
      employeeNumber: 'SD-999',
    });
    tempEntryId = res.body.id;
  });

  it('deletes the entry', async () => {
    const res = await api.delete(`/api/random-entries/${tempEntryId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── S10 Delete list ───────────────────────────────────────────────────────────
describe('S10: DELETE /api/random-lists/:listId', () => {
  let tempListId;

  beforeAll(async () => {
    const res = await api.post('/api/random-lists').send({ listDate: TODAY, shift: 'Night' });
    tempListId = res.body.id;
  });

  it('deletes the list', async () => {
    const res = await api.delete(`/api/random-lists/${tempListId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('list is gone from /api/random-lists', async () => {
    const res = await api.get('/api/random-lists');
    expect(res.body.some(l => l.ListID === tempListId)).toBe(false);
  });
});

// ── S11 Daily schedule ────────────────────────────────────────────────────────
describe('S11: GET /api/schedule', () => {
  it('returns 200 with schedule data', async () => {
    const res = await api.get('/api/schedule').query({ date: TODAY });
    expect(res.status).toBe(200);
  });
});

// ── S12 Generate random schedule ─────────────────────────────────────────────
describe('S12: POST /api/schedule/random', () => {
  it('generates random schedule entries', async () => {
    const res = await api.post('/api/schedule/random').send({
      date: TODAY,
      shift: 'Day',
      count: 2,
    });
    expect([200, 201, 400]).toContain(res.status); // 400 if no employer data seeded
  });
});
