/**
 * Admin, Config & Non-Negative Tests (≤ 3 min)
 *
 * Covers:
 *   A1  GET /api/admin/settings — requires admin auth
 *   A2  PUT /api/admin/settings/:key — update setting
 *   A3  GET /api/audit — audit log listing
 *   A4  GET /api/admin/audit-logs — admin audit log
 *   A5  ESO Cert Units CRUD
 *   A6  GET /api/nonnegative — non-negative list
 *   A7  GET /api/nonnegative/:id
 *   A8  PUT /api/nonnegative/:id — update status/notes
 *   A9  POST /api/nonnegative/:id/notes — add note
 *   A10 GET /api/admin/stats — system stats
 *   A11 GET /api/reports/dashboard — dashboard data
 *   A12 GET /api/pending — pending lab results list
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const TODAY = new Date().toISOString().split('T')[0];

const ADMIN_TOKEN = 'admin123'; // x-admin-token header value
const esoIds = [];
const testIds = [];

afterAll(async () => {
  for (const id of esoIds) {
    try { await api.delete(`/api/eso-cert-units/${id}`); } catch {}
  }
  for (const id of testIds) {
    try { await api.delete(`/api/tests/${id}`); } catch {}
  }
});

const withAdmin = (req) => req.set('x-admin-token', ADMIN_TOKEN);

// ── A1 Admin settings — auth required ────────────────────────────────────────
describe('A1: GET /api/admin/settings', () => {
  it('returns 401 without token', async () => {
    const res = await api.get('/api/admin/settings');
    expect(res.status).toBe(401);
  });

  it('returns 200 with x-admin-token', async () => {
    const res = await withAdmin(api.get('/api/admin/settings'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('settings include require_coc_uploads key', async () => {
    const res = await withAdmin(api.get('/api/admin/settings'));
    const map = Object.fromEntries(res.body.map(s => [s.ConfigKey, s.ConfigValue]));
    expect(map).toHaveProperty('require_coc_uploads');
  });
});

// ── A2 Update settings ────────────────────────────────────────────────────────
describe('A2: PUT /api/admin/settings/:key', () => {
  it('updates require_coc_uploads to true', async () => {
    const res = await withAdmin(api.put('/api/admin/settings/require_coc_uploads'))
      .send({ value: 'true' });
    expect(res.status).toBe(200);
  });

  it('GET confirms updated value', async () => {
    const res = await withAdmin(api.get('/api/admin/settings'));
    const map = Object.fromEntries(res.body.map(s => [s.ConfigKey, s.ConfigValue]));
    expect(map.require_coc_uploads).toBe('true');
  });

  it('resets require_coc_uploads to false', async () => {
    await withAdmin(api.put('/api/admin/settings/require_coc_uploads')).send({ value: 'false' });
  });
});

// ── A3 Audit log ──────────────────────────────────────────────────────────────
describe('A3: GET /api/audit', () => {
  it('returns 200 array', async () => {
    const res = await api.get('/api/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('entries have expected shape', async () => {
    const res = await api.get('/api/audit').query({ limit: 5 });
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('Action');
      expect(res.body[0]).toHaveProperty('RecordType');
    }
  });
});

// ── A4 Admin audit log ────────────────────────────────────────────────────────
describe('A4: GET /api/admin/audit-logs', () => {
  it('returns 401 without token', async () => {
    const res = await api.get('/api/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns 200 with x-admin-token', async () => {
    const res = await withAdmin(api.get('/api/admin/audit-logs'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });
});

// ── A5 ESO Cert Units CRUD ────────────────────────────────────────────────────
describe('A5: ESO Cert Units CRUD', () => {
  let esoId;

  it('GET /api/eso-cert-units returns seeded units', async () => {
    const res = await api.get('/api/eso-cert-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('POST creates a new unit', async () => {
    const res = await api.post('/api/eso-cert-units').send({
      code: 'TEST-ESO-001',
      name: '__Test ESO Unit__',
      hours: 8,
      category: 'Emergency Response',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    esoId = res.body.id;
    esoIds.push(esoId);
  });

  it('PUT updates the unit', async () => {
    const res = await api.put(`/api/eso-cert-units/${esoId}`).send({
      code: 'TEST-ESO-001',
      name: '__Test ESO Unit Updated__',
      hours: 16,
      category: 'Emergency Response',
      isActive: 1,
    });
    expect(res.status).toBe(200);
  });

  it('GET reflects update', async () => {
    const res = await api.get('/api/eso-cert-units');
    const unit = res.body.find(u => u.UnitID === esoId);
    expect(unit).toBeDefined();
    expect(unit.Name).toBe('__Test ESO Unit Updated__');
  });

  it('DELETE removes the unit', async () => {
    const res = await api.delete(`/api/eso-cert-units/${esoId}`);
    expect(res.status).toBe(200);
    esoIds.splice(esoIds.indexOf(esoId), 1);
  });
});

// ── A6 Non-negative list ──────────────────────────────────────────────────────
describe('A6: GET /api/nonnegative', () => {
  beforeAll(async () => {
    const res = await api.post('/api/tests').send({
      testDate: TODAY, testTime: '08:00',
      donorName: '__Admin NonNeg Worker__',
      testTypeId: 1,
      oralUndertaken: true, oralResult: 'Non-Negative', oralSubstances: ['THC'],
      bacUndertaken: false, urineUndertaken: false,
      sampleSentToLab: true,
    });
    if (res.body.id) testIds.push(res.body.id);
  });

  it('returns 200 array', async () => {
    const res = await api.get('/api/nonnegative');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('includes the non-negative test', async () => {
    const res = await api.get('/api/nonnegative');
    // API returns PersonName field
    expect(res.body.some(r => r.PersonName === '__Admin NonNeg Worker__')).toBe(true);
  });
});

// ── A7 & A8 Non-negative record update ───────────────────────────────────────
describe('A7/A8: GET + PUT /api/nonnegative/:id', () => {
  let nnId;

  beforeAll(async () => {
    const res = await api.get('/api/nonnegative');
    const record = res.body.find(r => r.PersonName === '__Admin NonNeg Worker__');
    nnId = record?.NNID || record?.NonNegativeID;
  });

  it('GET single non-negative record', async () => {
    if (!nnId) return;
    const res = await api.get(`/api/nonnegative/${nnId}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('NNID');
    }
  });

  it('PUT updates status to Under Review', async () => {
    if (!nnId) return;
    const res = await api.put(`/api/nonnegative/${nnId}`).send({
      status: 'Under Review',
      notes: 'Test status update',
    });
    expect(res.status).toBe(200);
  });
});

// ── A9 Add note to non-negative ───────────────────────────────────────────────
describe('A9: POST /api/nonnegative/:id/notes', () => {
  let nnId;

  beforeAll(async () => {
    const res = await api.get('/api/nonnegative');
    const record = res.body.find(r => r.PersonName === '__Admin NonNeg Worker__');
    nnId = record?.NNID || record?.NonNegativeID;
  });

  it('adds a note to the record', async () => {
    if (!nnId) return;
    const res = await api.post(`/api/nonnegative/${nnId}/notes`).send({
      noteText: 'Test note added by automated test',
    });
    expect([200, 201]).toContain(res.status);
  });
});

// ── A10 System stats ──────────────────────────────────────────────────────────
describe('A10: GET /api/admin/stats', () => {
  it('returns 200 with stats', async () => {
    const res = await withAdmin(api.get('/api/admin/stats'));
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

// ── A11 Dashboard ─────────────────────────────────────────────────────────────
describe('A11: GET /api/reports/dashboard', () => {
  it('returns 200 with dashboard data', async () => {
    const res = await api.get('/api/reports/dashboard');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('dashboard has expected sections', async () => {
    const res = await api.get('/api/reports/dashboard');
    // API returns: { today, weekTotal, weekNonNegative, pendingResults, ... }
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('weekTotal');
    expect(res.body).toHaveProperty('recentTests');
    expect(Array.isArray(res.body.recentTests)).toBe(true);
  });
});

// ── A12 Pending lab results ───────────────────────────────────────────────────
describe('A12: GET /api/pending', () => {
  it('returns 200 array of pending lab results', async () => {
    const res = await api.get('/api/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
