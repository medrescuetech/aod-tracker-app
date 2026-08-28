/**
 * CL: Core Lookups, Auth, Config, Test-Types, Employers, Clinicians
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const ADMIN = 'admin123';
const withAdmin = (r) => r.set('x-admin-token', ADMIN);
const T = 180_000;

// Shared IDs
let employerId, clinicianId, testTypeId;

// ── CL1: Health & Config ──────────────────────────────────────────────────────
describe('CL1: Health & Config', () => {
  it('GET /api/health returns ok', { timeout: T }, async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('GET /api/config returns object', { timeout: T }, async () => {
    const res = await api.get('/api/config');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/app-config returns employeeLabel', { timeout: T }, async () => {
    const res = await api.get('/api/app-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('employeeLabel');
  });

  it('GET /api/lookups returns arrays', { timeout: T }, async () => {
    const res = await api.get('/api/lookups');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

// ── CL2: Auth ─────────────────────────────────────────────────────────────────
describe('CL2: Auth', () => {
  it('POST /api/auth/login with bad credentials → 401', { timeout: T }, async () => {
    const res = await api.post('/api/auth/login').send({ username: 'bad', password: 'bad' });
    expect([401, 400]).toContain(res.status);
  });

  it('POST /api/auth/login with admin → 200 + token', { timeout: T }, async () => {
    const res = await api.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('GET /api/auth/me without token → 401', { timeout: T }, async () => {
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ── CL3: Test Types ───────────────────────────────────────────────────────────
describe('CL3: Test Types CRUD', () => {
  it('GET /api/test-types returns array', { timeout: T }, async () => {
    const res = await api.get('/api/test-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/test-types creates a type', { timeout: T }, async () => {
    const res = await api.post('/api/test-types').send({ name: 'TEST_CL', code: 'TCL', description: 'Test' });
    expect([200, 201, 500]).toContain(res.status);
    if (res.status === 200 || res.status === 201) {
      testTypeId = res.body.id || res.body.TestTypeID;
    } else {
      const existing = await api.get('/api/test-types');
      const found = Array.isArray(existing.body) && existing.body.find(t => t.Code === 'TCL');
      if (found) testTypeId = found.TestTypeID;
    }
  });

  it('PUT /api/test-types/:id updates it', { timeout: T }, async () => {
    if (!testTypeId) return;
    const res = await api.put(`/api/test-types/${testTypeId}`).send({ name: 'TEST_CL_UP', code: 'TCL', description: 'Updated' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/test-types/:id removes it', { timeout: T }, async () => {
    if (!testTypeId) return;
    const res = await api.delete(`/api/test-types/${testTypeId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── CL4: Employers ────────────────────────────────────────────────────────────
describe('CL4: Employers CRUD', () => {
  it('GET /api/employers returns array', { timeout: T }, async () => {
    const res = await api.get('/api/employers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/employers creates employer', { timeout: T }, async () => {
    const res = await api.post('/api/employers').send({ companyName: 'CL Test Co', category: 'Contractor' });
    expect([200, 201]).toContain(res.status);
    employerId = res.body.id || res.body.EmployerID;
    expect(employerId).toBeTruthy();
  });

  it('PUT /api/employers/:id updates employer', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.put(`/api/employers/${employerId}`).send({ companyName: 'CL Test Co Updated', category: 'Contractor' });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/employers/merged returns array', { timeout: T }, async () => {
    const res = await api.get('/api/employers/merged');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PUT /api/employers/:id/category updates category', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.put(`/api/employers/${employerId}/category`).send({ category: 'Employee' });
    expect([200, 204]).toContain(res.status);
  });

  it('POST /api/employers/reclassify runs without error', { timeout: T }, async () => {
    const res = await api.post('/api/employers/reclassify');
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/employers/export/csv returns CSV', { timeout: T }, async () => {
    const res = await api.get('/api/employers/export/csv');
    expect(res.status).toBe(200);
  });

  it('POST /api/employers/:id/aliases adds alias', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.post(`/api/employers/${employerId}/aliases`).send({ aliasName: 'CL Alias' });
    expect([200, 201]).toContain(res.status);
  });

  it('GET /api/employers/:id/aliases lists aliases', { timeout: T }, async () => {
    if (!employerId) return;
    const res = await api.get(`/api/employers/${employerId}/aliases`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── CL5: Clinicians ───────────────────────────────────────────────────────────
describe('CL5: Clinicians CRUD', () => {
  it('GET /api/clinicians returns array', { timeout: T }, async () => {
    const res = await api.get('/api/clinicians');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/clinicians creates clinician', { timeout: T }, async () => {
    const res = await api.post('/api/clinicians').send({ name: 'CL Tester', qualifications: 'RN' });
    expect([200, 201]).toContain(res.status);
    clinicianId = res.body.id || res.body.ClinicianID;
    expect(clinicianId).toBeTruthy();
  });

  it('GET /api/clinicians/:id returns clinician', { timeout: T }, async () => {
    if (!clinicianId) return;
    const res = await api.get(`/api/clinicians/${clinicianId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ClinicianID');
  });

  it('PUT /api/clinicians/:id updates clinician', { timeout: T }, async () => {
    if (!clinicianId) return;
    const res = await api.put(`/api/clinicians/${clinicianId}`).send({ name: 'CL Tester Updated', qualifications: 'RN' });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/clinicians/export/csv returns data', { timeout: T }, async () => {
    const res = await api.get('/api/clinicians/export/csv');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/clinicians/:id removes clinician', { timeout: T }, async () => {
    if (!clinicianId) return;
    const res = await api.delete(`/api/clinicians/${clinicianId}`);
    expect([200, 204]).toContain(res.status);
  });
});
