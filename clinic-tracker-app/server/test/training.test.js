/**
 * Training Tracker Tests
 *
 * Covers:
 *   TR1  GET /api/trainers              — list trainers
 *   TR2  POST /api/trainers             — create trainer
 *   TR3  PUT /api/trainers/:id          — update trainer
 *   TR4  DELETE /api/trainers/:id       — delete trainer
 *   TR5  GET /api/training-units        — list training units
 *   TR6  POST /api/training-units       — create training unit
 *   TR7  GET /api/cpd-types             — list CPD types
 *   TR8  POST /api/training             — create training record (with attendees)
 *   TR9  GET /api/training              — list training records + filter by trainer
 *   TR10 PUT /api/training/:id          — update record (replace attendees)
 *   TR11 GET /api/training/:id/attendees — fetch attendees
 *   TR12 DELETE /api/training/:id       — delete record + cascades attendees
 *   TR13 GET /api/training/summary      — summary endpoint
 *   TR14 Validation — missing required fields
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);

const ids = {
  trainer1: null, trainer2: null,
  unit: null, cpdType: null,
  record1: null, record2: null,
};

// ── TR1–TR4  Trainer CRUD ─────────────────────────────────────────────────────

describe('Trainers', () => {
  it('TR1 GET /api/trainers → 200 array', async () => {
    const res = await api.get('/api/trainers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TR2 POST /api/trainers → 200 creates trainer', async () => {
    const res = await api
      .post('/api/trainers')
      .send({ name: '__Test Trainer One__', qualifications: 'Cert IV TAE', email: 't1@test.local' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    ids.trainer1 = res.body.id;
  });

  it('TR2b POST /api/trainers → creates second trainer (attendee)', async () => {
    const res = await api
      .post('/api/trainers')
      .send({ name: '__Test Attendee One__', qualifications: null });
    expect(res.status).toBe(200);
    ids.trainer2 = res.body.id;
  });

  it('TR2 POST /api/trainers → 400 without name', async () => {
    const res = await api.post('/api/trainers').send({ qualifications: 'something' });
    expect(res.status).toBe(400);
  });

  it('TR3 PUT /api/trainers/:id → 200 updates trainer', async () => {
    const res = await api
      .put(`/api/trainers/${ids.trainer1}`)
      .send({ name: '__Test Trainer One Updated__', isActive: 1 });
    expect(res.status).toBe(200);
    const list = await api.get('/api/trainers');
    const found = list.body.find(t => t.TrainerID === ids.trainer1);
    expect(found?.Name).toBe('__Test Trainer One Updated__');
  });

  it('TR4 DELETE /api/trainers/:id → 200', async () => {
    const tmp = await api.post('/api/trainers').send({ name: '__Temp Trainer__' });
    const res = await api.delete(`/api/trainers/${tmp.body.id}`);
    expect(res.status).toBe(200);
  });
});

// ── TR5–TR6  Training Units ───────────────────────────────────────────────────

describe('Training Units', () => {
  it('TR5 GET /api/training-units → 200 array', async () => {
    const res = await api.get('/api/training-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TR6 POST /api/training-units → 200 creates unit', async () => {
    const res = await api.post('/api/training-units').send({
      code: '__TST01__', name: 'Test Training Unit', trainingPackage: 'HLT',
    });
    expect(res.status).toBe(200);
    ids.unit = res.body.id;
  });

  it('TR6 POST /api/training-units → 400 without required fields', async () => {
    const res = await api.post('/api/training-units').send({ code: 'X' }); // missing name + trainingPackage
    expect(res.status).toBe(400);
  });
});

// ── TR7  CPD Types ────────────────────────────────────────────────────────────

describe('CPD Types', () => {
  it('TR7 GET /api/cpd-types → 200 array', async () => {
    const res = await api.get('/api/cpd-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── TR8–TR12  Training Record CRUD + Attendees ────────────────────────────────

describe('Training Records', () => {
  const TODAY = new Date().toISOString().split('T')[0];

  it('TR8 POST /api/training → 200 creates record with attendees', async () => {
    const res = await api.post('/api/training').send({
      trainingDate: TODAY,
      trainingType: 'General',
      trainerId: ids.trainer1,
      hours: 2,
      notes: '__created by test__',
      attendeeIds: [ids.trainer2],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    ids.record1 = res.body.id;
  });

  it('TR8 POST /api/training → 400 without trainingDate', async () => {
    const res = await api.post('/api/training').send({ trainerId: ids.trainer1, hours: 1 });
    expect(res.status).toBe(400);
  });

  it('TR9 GET /api/training → 200 includes created record', async () => {
    const res = await api.get('/api/training');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(r => r.TrainingID === ids.record1);
    expect(found).toBeTruthy();
  });

  it('TR9 GET /api/training?trainerId=X → filters by trainer', async () => {
    const res = await api.get(`/api/training?trainerId=${ids.trainer1}`);
    expect(res.status).toBe(200);
    for (const r of res.body) {
      const isTrainer    = r.TrainerID === ids.trainer1;
      const isAttendee   = r.AttendeeIDs
        ? String(r.AttendeeIDs).split(',').map(Number).includes(ids.trainer1)
        : false;
      expect(isTrainer || isAttendee).toBe(true);
    }
  });

  it('TR11 GET /api/training/:id/attendees → returns attendees', async () => {
    const res = await api.get(`/api/training/${ids.record1}/attendees`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(a => a.TrainerID === ids.trainer2)).toBe(true);
  });

  it('TR10 PUT /api/training/:id → 200 updates record + replaces attendees', async () => {
    const res = await api.put(`/api/training/${ids.record1}`).send({
      trainingDate: TODAY,
      trainingType: 'General',
      trainerId: ids.trainer1,
      hours: 3,
      notes: '__updated by test__',
      attendeeIds: [],
    });
    expect(res.status).toBe(200);

    const atts = await api.get(`/api/training/${ids.record1}/attendees`);
    expect(atts.body.length).toBe(0);
  });

  it('TR12 DELETE /api/training/:id → 200 + cascades attendees', async () => {
    const create = await api.post('/api/training').send({
      trainingDate: TODAY,
      trainingType: 'General',
      trainerId: ids.trainer1,
      hours: 1,
      attendeeIds: [ids.trainer2],
    });
    const delRes = await api.delete(`/api/training/${create.body.id}`);
    expect(delRes.status).toBe(200);

    const atts = await api.get(`/api/training/${create.body.id}/attendees`);
    expect(atts.body.length).toBe(0);
  });

  it('TR13 GET /api/training/summary → 200 with expected keys', async () => {
    const res = await api.get('/api/training/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCPDHours');
    expect(res.body).toHaveProperty('expiringSoon');
    expect(res.body).toHaveProperty('overdue');
    expect(res.body).toHaveProperty('byType');
    expect(Array.isArray(res.body.expiringSoon)).toBe(true);
    expect(Array.isArray(res.body.overdue)).toBe(true);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (ids.record1) {
    try { await api.delete(`/api/training/${ids.record1}`); } catch {}
  }
  for (const tid of [ids.trainer1, ids.trainer2]) {
    if (tid) try { await api.delete(`/api/trainers/${tid}`); } catch {}
  }
  if (ids.unit) {
    try { await api.delete(`/api/training-units/${ids.unit}`); } catch {}
  }
});
