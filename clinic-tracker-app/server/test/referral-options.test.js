/**
 * Referral Options Tests
 *
 * Covers:
 *   RO1  GET /api/referral-options       — list defaults seeded at startup
 *   RO2  POST /api/referral-options      — create custom option
 *   RO3  PUT /api/referral-options/:id   — rename option
 *   RO4  DELETE /api/referral-options/:id — delete option
 *   RO5  Validation — missing name returns 400
 *   RO6  Default seed values present
 *   RO7  Patient event uses referral value from dynamic list
 */

import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const created = { optionId: null, eventId: null };
const TODAY = new Date().toISOString().split('T')[0];

// ── RO1  List defaults ────────────────────────────────────────────────────────

describe('Referral Options — defaults', () => {
  it('RO1 GET /api/referral-options → 200 array', async () => {
    const res = await api.get('/api/referral-options');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('RO6 Default seed values are present', async () => {
    const res = await api.get('/api/referral-options');
    const names = res.body.map(o => o.Name);
    for (const expected of ['Return to work', 'Camp', 'Physio', 'Medmate', 'GP', 'ED']) {
      expect(names).toContain(expected);
    }
  });

  it('RO1 Each option has OptionID and Name', async () => {
    const res = await api.get('/api/referral-options');
    for (const opt of res.body) {
      expect(opt).toHaveProperty('OptionID');
      expect(opt).toHaveProperty('Name');
      expect(typeof opt.Name).toBe('string');
    }
  });
});

// ── RO2  Create ───────────────────────────────────────────────────────────────

describe('Referral Options — CRUD', () => {
  it('RO2 POST /api/referral-options → 200 creates option', async () => {
    const res = await api
      .post('/api/referral-options')
      .send({ name: '__Test Referral Option__', sortOrder: 99 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.optionId = res.body.id;
  });

  it('RO5 POST /api/referral-options → 400 without name', async () => {
    const res = await api.post('/api/referral-options').send({ sortOrder: 1 });
    expect(res.status).toBe(400);
  });

  it('RO2 Created option appears in GET list', async () => {
    const res = await api.get('/api/referral-options');
    const found = res.body.find(o => o.OptionID === created.optionId);
    expect(found).toBeTruthy();
    expect(found.Name).toBe('__Test Referral Option__');
  });

  it('RO3 PUT /api/referral-options/:id → 200 renames option', async () => {
    const res = await api
      .put(`/api/referral-options/${created.optionId}`)
      .send({ name: '__Test Referral Option Renamed__', sortOrder: 99 });
    expect(res.status).toBe(200);

    const list = await api.get('/api/referral-options');
    const found = list.body.find(o => o.OptionID === created.optionId);
    expect(found?.Name).toBe('__Test Referral Option Renamed__');
  });

  it('RO3 PUT /api/referral-options/:id → 400 without name', async () => {
    const res = await api
      .put(`/api/referral-options/${created.optionId}`)
      .send({ sortOrder: 1 });
    expect(res.status).toBe(400);
  });

  it('RO4 DELETE /api/referral-options/:id → 200 removes option', async () => {
    const res = await api.delete(`/api/referral-options/${created.optionId}`);
    expect(res.status).toBe(200);

    const list = await api.get('/api/referral-options');
    const found = list.body.find(o => o.OptionID === created.optionId);
    expect(found).toBeFalsy();
    created.optionId = null;
  });
});

// ── RO7  Patient event referral integration ───────────────────────────────────

describe('Referral Options — patient event integration', () => {
  it('RO7 Patient event can use a dynamic referral value', async () => {
    const optsRes = await api.get('/api/referral-options');
    const referralName = optsRes.body[0]?.Name;
    expect(referralName).toBeTruthy();

    const createRes = await api.post('/api/patient-events').send({
      eventDate:   TODAY,
      eventTime:   '09:00',
      wrNwr:       'WR',
      patientName: '__RO7 Test Patient__',
      referral:    referralName,
    });
    expect(createRes.status).toBe(200);
    created.eventId = createRes.body.id;

    const listRes = await api.get('/api/patient-events');
    const evt = listRes.body.find(e => e.EventID === created.eventId);
    expect(evt?.Referral).toBe(referralName);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (created.optionId) {
    try { await api.delete(`/api/referral-options/${created.optionId}`); } catch {}
  }
  if (created.eventId) {
    try { await api.delete(`/api/patient-events/${created.eventId}`); } catch {}
  }
});
