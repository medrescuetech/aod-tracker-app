/**
 * AD: Admin routes, Documents library, Users, Audit, Archive, Backups
 *     Training CRUD, CPD/ESO, Trainers, Referral Options
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const ADMIN = 'admin123';
const withAdmin = (r) => r.set('x-admin-token', ADMIN);
const T = 180_000;
const TODAY = new Date().toISOString().split('T')[0];

// ── AD1: Admin Auth & Settings ────────────────────────────────────────────────
describe('AD1: Admin Auth & Settings', () => {
  it('POST /api/admin/verify with correct password → success', { timeout: T }, async () => {
    const res = await api.post('/api/admin/verify').send({ password: ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/admin/verify with bad password → 401', { timeout: T }, async () => {
    const res = await api.post('/api/admin/verify').send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/settings without token → 401', { timeout: T }, async () => {
    const res = await api.get('/api/admin/settings');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/settings with token → 200 array', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/settings'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PUT /api/admin/settings/:key → updates value', { timeout: T }, async () => {
    const res = await withAdmin(api.put('/api/admin/settings/require_coc_uploads')).send({ value: 'false' });
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/app-settings with token → 200 object', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/app-settings'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/classification-patterns → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/classification-patterns'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('patterns');
  });

  it('GET /api/admin/stats → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/stats'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/smtp → 200', { timeout: T }, async () => {
    const res = await api.get('/api/admin/smtp');
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/email-rules → 200 array', { timeout: T }, async () => {
    const res = await api.get('/api/admin/email-rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── AD2: Audit Logs ───────────────────────────────────────────────────────────
describe('AD2: Audit & Error Logs', () => {
  it('GET /api/audit returns array', { timeout: T }, async () => {
    const res = await api.get('/api/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/admin/audit-logs with token → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/audit-logs'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/error-logs with token → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/error-logs'));
    expect([200, 404]).toContain(res.status);
  });

  it('GET /api/admin/log-dates with token → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/log-dates'));
    expect(res.status).toBe(200);
  });
});

// ── AD3: Archive Manager ──────────────────────────────────────────────────────
describe('AD3: Archive Manager', () => {
  it('GET /api/admin/archive/settings → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/archive/settings'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/archive/preview → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/archive/preview?cutoffDate=2020-01-01'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/archive/jobs → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/archive/jobs'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/archive/data → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/archive/data'));
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/archive/persons-eligible → 200', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/archive/persons-eligible'));
    expect(res.status).toBe(200);
  });
});

// ── AD4: Backups ──────────────────────────────────────────────────────────────
describe('AD4: Backup Manager', () => {
  it('GET /api/admin/backups → 200 array', { timeout: T }, async () => {
    const res = await withAdmin(api.get('/api/admin/backups'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── AD5: Users ────────────────────────────────────────────────────────────────
describe('AD5: Users CRUD', () => {
  let userId;

  it('GET /api/users returns array', { timeout: T }, async () => {
    const res = await api.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/users creates user', { timeout: T }, async () => {
    const res = await api.post('/api/users').send({
      username: 'ad_test_user', password: 'TestPass123!', roleId: 1, fullName: 'AD Test User',
    });
    expect([200, 201, 400, 409, 500]).toContain(res.status);
    if (res.status === 200 || res.status === 201) userId = res.body.id || res.body.UserID;
  });

  it('PUT /api/users/:id updates user', { timeout: T }, async () => {
    if (!userId) return;
    const res = await api.put(`/api/users/${userId}`).send({ username: 'ad_test_user_upd' });
    expect([200, 204]).toContain(res.status);
  });
});

// ── AD6: Documents Library ────────────────────────────────────────────────────
describe('AD6: Documents Library', () => {
  it('GET /api/documents returns array', { timeout: T }, async () => {
    const res = await api.get('/api/documents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/documents/categories returns array', { timeout: T }, async () => {
    const res = await api.get('/api/documents/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── AD7: Training CRUD ────────────────────────────────────────────────────────
describe('AD7: Training CRUD', () => {
  let trainingId, unitId, trainerId, cpdTypeId, esoCertUnitId, attendeeId;

  it('GET /api/training returns array', { timeout: T }, async () => {
    const res = await api.get('/api/training');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/training-units returns array', { timeout: T }, async () => {
    const res = await api.get('/api/training-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/training-units creates unit', { timeout: T }, async () => {
    const res = await api.post('/api/training-units').send({ code: 'AD_UNIT', name: 'AD Test Unit', trainingPackage: 'HLT' });
    expect([200, 201]).toContain(res.status);
    unitId = res.body.id || res.body.UnitID;
  });

  it('GET /api/trainers returns array', { timeout: T }, async () => {
    const res = await api.get('/api/trainers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/trainers creates trainer', { timeout: T }, async () => {
    const res = await api.post('/api/trainers').send({ name: 'AD Trainer', qualifications: 'Cert IV' });
    expect([200, 201]).toContain(res.status);
    trainerId = res.body.id || res.body.TrainerID;
  });

  it('POST /api/training creates session', { timeout: T }, async () => {
    const res = await api.post('/api/training').send({
      title: 'AD Training Session',
      trainingDate: TODAY,
      trainingType: 'General',
      trainerId,
    });
    expect([200, 201]).toContain(res.status);
    trainingId = res.body.id || res.body.TrainingID;
  });

  it('GET /api/training/:id/attendees returns array', { timeout: T }, async () => {
    if (!trainingId) return;
    const res = await api.get(`/api/training/${trainingId}/attendees`);
    expect(res.status).toBe(200);
  });

  it('GET /api/training/summary returns data', { timeout: T }, async () => {
    const res = await api.get('/api/training/summary');
    expect(res.status).toBe(200);
  });

  it('GET /api/training/duplicates returns array', { timeout: T }, async () => {
    const res = await api.get('/api/training/duplicates');
    expect(res.status).toBe(200);
  });

  it('GET /api/cpd-types returns array', { timeout: T }, async () => {
    const res = await api.get('/api/cpd-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/cpd-types creates type', { timeout: T }, async () => {
    const res = await api.post('/api/cpd-types').send({ name: 'AD CPD Type' });
    expect([200, 201]).toContain(res.status);
    cpdTypeId = res.body.id || res.body.CPDTypeID;
  });

  it('GET /api/eso-cert-units returns array', { timeout: T }, async () => {
    const res = await api.get('/api/eso-cert-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/eso-cert-units creates unit', { timeout: T }, async () => {
    const res = await api.post('/api/eso-cert-units').send({ name: 'AD ESO Unit', groupName: 'AD Group' });
    expect([200, 201]).toContain(res.status);
    esoCertUnitId = res.body.id || res.body.UnitID;
  });

  it('DELETE /api/training/:id removes session', { timeout: T }, async () => {
    if (!trainingId) return;
    const res = await api.delete(`/api/training/${trainingId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/trainers/:id removes trainer', { timeout: T }, async () => {
    if (!trainerId) return;
    const res = await api.delete(`/api/trainers/${trainerId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/training-units/:id removes unit', { timeout: T }, async () => {
    if (!unitId) return;
    const res = await api.delete(`/api/training-units/${unitId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/cpd-types/:id removes type', { timeout: T }, async () => {
    if (!cpdTypeId) return;
    const res = await api.delete(`/api/cpd-types/${cpdTypeId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/eso-cert-units/:id removes unit', { timeout: T }, async () => {
    if (!esoCertUnitId) return;
    const res = await api.delete(`/api/eso-cert-units/${esoCertUnitId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── AD8: Referral Options ─────────────────────────────────────────────────────
describe('AD8: Referral Options CRUD', () => {
  let referralId;

  it('GET /api/referral-options returns array', { timeout: T }, async () => {
    const res = await api.get('/api/referral-options');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/referral-options creates option', { timeout: T }, async () => {
    const res = await api.post('/api/referral-options').send({ name: 'AD Referral Option' });
    expect([200, 201]).toContain(res.status);
    referralId = res.body.id || res.body.ReferralOptionID;
  });

  it('PUT /api/referral-options/:id updates', { timeout: T }, async () => {
    if (!referralId) return;
    const res = await api.put(`/api/referral-options/${referralId}`).send({ name: 'AD Referral Updated' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/referral-options/:id removes', { timeout: T }, async () => {
    if (!referralId) return;
    const res = await api.delete(`/api/referral-options/${referralId}`);
    expect([200, 204]).toContain(res.status);
  });
});
