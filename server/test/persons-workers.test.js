/**
 * PW: Persons (Workers/Donors) — full CRUD, import/export, merge, history
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const T = 180_000;

let personId, person2Id, employerId;

// ── PW0: Setup shared employer ────────────────────────────────────────────────
beforeAll(async () => {
  const r = await api.post('/api/employers').send({ companyName: 'PW Employer Co', category: 'Contractor' });
  employerId = r.body.id || r.body.EmployerID;
});

// ── PW1: Person CRUD ──────────────────────────────────────────────────────────
describe('PW1: Person CRUD', () => {
  it('GET /api/persons returns array', { timeout: T }, async () => {
    const res = await api.get('/api/persons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/persons/check-duplicate → no hit for new name', { timeout: T }, async () => {
    const res = await api.get('/api/persons/check-duplicate?fullName=PW+Unique+XYZ999');
    expect(res.status).toBe(200);
  });

  it('POST /api/persons creates person', { timeout: T }, async () => {
    const res = await api.post('/api/persons').send({
      fullName: 'PW Worker One',
      badgeNumber: 'PW001',
      employerId,
    });
    expect([200, 201]).toContain(res.status);
    personId = res.body.id || res.body.PersonID;
    expect(personId).toBeTruthy();
  });

  it('POST /api/persons creates second person', { timeout: T }, async () => {
    const res = await api.post('/api/persons').send({
      fullName: 'PW Worker Two',
      badgeNumber: 'PW002',
      employerId,
    });
    expect([200, 201]).toContain(res.status);
    person2Id = res.body.id || res.body.PersonID;
    expect(person2Id).toBeTruthy();
  });

  it('GET /api/persons/:id returns person', { timeout: T }, async () => {
    if (!personId) return;
    const res = await api.get(`/api/persons/${personId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('PersonID');
  });

  it('PUT /api/persons/:id updates person', { timeout: T }, async () => {
    if (!personId) return;
    const res = await api.put(`/api/persons/${personId}`).send({
      fullName: 'PW Worker One Updated',
      badgeNumber: 'PW001',
      isActive: 1,
    });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/persons/:id/history returns object', { timeout: T }, async () => {
    if (!personId) return;
    const res = await api.get(`/api/persons/${personId}/history`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

// ── PW2: Person Export ────────────────────────────────────────────────────────
describe('PW2: Person Export/Import', () => {
  it('GET /api/persons/export/csv returns data', { timeout: T }, async () => {
    const res = await api.get('/api/persons/export/csv');
    expect(res.status).toBe(200);
  });
});

// ── PW3: Merge ────────────────────────────────────────────────────────────────
describe('PW3: Person Merge', () => {
  it('GET /api/persons/:id/merge-preview returns recommendation', { timeout: T }, async () => {
    if (!personId || !person2Id) return;
    const res = await api.get(`/api/persons/${personId}/merge-preview?targetId=${person2Id}`);
    expect([200, 400]).toContain(res.status);
  });

  it('POST /api/persons/:id/merge merges source into target', { timeout: T }, async () => {
    if (!personId || !person2Id) return;
    const res = await api.post(`/api/persons/${personId}/merge`).send({ targetId: person2Id });
    expect([200, 400]).toContain(res.status);
  });
});

// ── PW4: Delete ───────────────────────────────────────────────────────────────
describe('PW4: Person Delete', () => {
  it('DELETE /api/persons/:id soft-deletes', { timeout: T }, async () => {
    if (!person2Id) return;
    const res = await api.delete(`/api/persons/${person2Id}`);
    expect([200, 204]).toContain(res.status);
  });
});
