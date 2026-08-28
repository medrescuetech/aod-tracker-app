import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'fs';
import app from '../index.js';

// ── helpers ────────────────────────────────────────────────────────────────

const binaryParser = (res, cb) => {
  res.setEncoding('binary');
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
};

const api = request(app);

// IDs created during tests (cleaned up in afterAll where possible)
const created = { clinicianId: null, personId: null, trainingId: null, unitId: null, trainerId: null, cpdTypeId: null, employerId: null };

// ── 1. AUTH ────────────────────────────────────────────────────────────────

describe('Authentication', () => {
  it('POST /api/auth/login → 401 for bad credentials', async () => {
    const res = await api.post('/api/auth/login').send({ username: 'nobody', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/auth/login → 200 + token for admin', async () => {
    const res = await api.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('username', 'admin');
  });

  it('GET /api/auth/me → 401 with no token', async () => {
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me → 200 with valid token', async () => {
    const loginRes = await api.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.token;
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('Username', 'admin');
  });
});

// ── 2. LOOKUPS ─────────────────────────────────────────────────────────────

describe('Lookups', () => {
  it('GET /api/lookups → 200 with expected keys', async () => {
    const res = await api.get('/api/lookups');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sexes');
    expect(res.body).toHaveProperty('workerTypes');
    expect(res.body).toHaveProperty('testTypes');
    expect(res.body).toHaveProperty('resultClassifications');
    expect(res.body).toHaveProperty('roles');
    expect(Array.isArray(res.body.testTypes)).toBe(true);
  });
});

// ── 3. EMPLOYERS ───────────────────────────────────────────────────────────

describe('Employers', () => {
  it('GET /api/employers → 200 array', async () => {
    const res = await api.get('/api/employers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/employers → creates record', async () => {
    const res = await api.post('/api/employers').send({
      companyName: '__Test Employer__',
      category: 'Contractor',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.employerId = res.body.id;
  });

  it('PUT /api/employers/:id → updates record', async () => {
    const res = await api.put(`/api/employers/${created.employerId}`).send({
      companyName: '__Test Employer Updated__',
      category: 'Contractor',
      isActive: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});

// ── 4. CLINICIANS ──────────────────────────────────────────────────────────

describe('Clinicians', () => {
  it('GET /api/clinicians → 200 array', async () => {
    const res = await api.get('/api/clinicians');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/clinicians → 400 without name', async () => {
    const res = await api.post('/api/clinicians').send({ credentials: 'RN' });
    expect(res.status).toBe(400);
  });

  it('POST /api/clinicians → 200 creates clinician', async () => {
    const res = await api.post('/api/clinicians').send({
      name: '__Test Clinician__',
      credentials: 'RN',
      email: 'test.clinician@test.com',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.clinicianId = res.body.id;
  });

  it('GET /api/clinicians/:id → 200 returns clinician', async () => {
    const res = await api.get(`/api/clinicians/${created.clinicianId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('FullName', '__Test Clinician__');
  });

  it('PUT /api/clinicians/:id → updates clinician', async () => {
    const res = await api.put(`/api/clinicians/${created.clinicianId}`).send({
      name: '__Test Clinician Updated__',
      credentials: 'RN, NP',
      isActive: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /api/clinicians/:id → 200 reflects update', async () => {
    const res = await api.get(`/api/clinicians/${created.clinicianId}`);
    expect(res.status).toBe(200);
    expect(res.body.FullName).toBe('__Test Clinician Updated__');
  });

  it('DELETE /api/clinicians/:id → deactivates clinician', async () => {
    const res = await api.delete(`/api/clinicians/${created.clinicianId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/clinicians/:id → 404 for non-existent', async () => {
    const res = await api.get('/api/clinicians/999999');
    expect(res.status).toBe(404);
  });
});

// ── 5. PERSONS (WORKERS) ───────────────────────────────────────────────────

describe('Persons', () => {
  it('GET /api/persons → 200 array', async () => {
    const res = await api.get('/api/persons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/persons → creates person', async () => {
    const res = await api.post('/api/persons').send({
      fullName: '__Test Worker__',
      employeeNumber: 'TW001',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.personId = res.body.id;
  });

  it('GET /api/persons/:id → 200 returns person', async () => {
    const res = await api.get(`/api/persons/${created.personId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('FullName', '__Test Worker__');
  });

  it('PUT /api/persons/:id → updates person', async () => {
    const res = await api.put(`/api/persons/${created.personId}`).send({
      fullName: '__Test Worker Updated__',
      isActive: 1,
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/persons → search filter works', async () => {
    const res = await api.get('/api/persons').query({ search: '__Test Worker' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(p => p.FullName.includes('__Test Worker'))).toBe(true);
  });
});

// ── 6. TRAINING UNITS ─────────────────────────────────────────────────────

describe('Training Units', () => {
  it('GET /api/training-units → 200 array with seed data', async () => {
    const res = await api.get('/api/training-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('TrainingUnitID');
    expect(res.body[0]).toHaveProperty('Name');
    expect(res.body[0]).toHaveProperty('TrainingPackage');
  });

  it('POST /api/training-units → 400 without name', async () => {
    const res = await api.post('/api/training-units').send({ trainingPackage: 'HLT' });
    expect(res.status).toBe(400);
  });

  it('POST /api/training-units → 400 without trainingPackage', async () => {
    const res = await api.post('/api/training-units').send({ name: 'Test Unit' });
    expect(res.status).toBe(400);
  });

  it('POST /api/training-units → 200 creates unit', async () => {
    const res = await api.post('/api/training-units').send({
      code: 'TEST001',
      name: '__Test Training Unit__',
      trainingPackage: 'HLT',
      category: 'MEDICAL',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.unitId = res.body.id;
  });

  it('GET /api/training-units → new unit is present', async () => {
    const res = await api.get('/api/training-units');
    expect(res.body.some(u => u.TrainingUnitID === created.unitId)).toBe(true);
  });

  it('PUT /api/training-units/:id → updates unit', async () => {
    const res = await api.put(`/api/training-units/${created.unitId}`).send({
      code: 'TEST001',
      name: '__Test Training Unit Updated__',
      trainingPackage: 'PUA',
      isActive: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /api/training-units → reflects updated package', async () => {
    const res = await api.get('/api/training-units');
    const unit = res.body.find(u => u.TrainingUnitID === created.unitId);
    expect(unit).toBeDefined();
    expect(unit.TrainingPackage).toBe('PUA');
    expect(unit.Name).toBe('__Test Training Unit Updated__');
  });

  it('DELETE /api/training-units/:id → 200 deletes unit', async () => {
    const res = await api.delete(`/api/training-units/${created.unitId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/training-units → deleted unit is gone', async () => {
    const res = await api.get('/api/training-units');
    expect(res.body.some(u => u.TrainingUnitID === created.unitId)).toBe(false);
  });
});

// ── 7. TRAINERS ───────────────────────────────────────────────────────────

describe('Trainers', () => {
  it('GET /api/trainers → 200 array', async () => {
    const res = await api.get('/api/trainers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/trainers → 400 without name', async () => {
    const res = await api.post('/api/trainers').send({ qualifications: 'RN' });
    expect(res.status).toBe(400);
  });

  it('POST /api/trainers → 200 creates trainer', async () => {
    const res = await api.post('/api/trainers').send({
      name: '__Test Trainer__',
      qualifications: 'RN, CERT IV TAE',
      email: 'trainer@test.com',
      phone: '0400000000',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.trainerId = res.body.id;
  });

  it('GET /api/trainers → new trainer present', async () => {
    const res = await api.get('/api/trainers');
    expect(res.body.some(t => t.TrainerID === created.trainerId)).toBe(true);
  });

  it('PUT /api/trainers/:id → updates trainer', async () => {
    const res = await api.put(`/api/trainers/${created.trainerId}`).send({
      name: '__Test Trainer Updated__',
      qualifications: 'PARA',
      email: 'updated@test.com',
      phone: '0411111111',
      isActive: 1,
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/trainers → reflects update', async () => {
    const res = await api.get('/api/trainers');
    const trainer = res.body.find(t => t.TrainerID === created.trainerId);
    expect(trainer.Name).toBe('__Test Trainer Updated__');
  });

  it('DELETE /api/trainers/:id → 200', async () => {
    const res = await api.delete(`/api/trainers/${created.trainerId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/trainers → deleted trainer gone', async () => {
    const res = await api.get('/api/trainers');
    expect(res.body.some(t => t.TrainerID === created.trainerId)).toBe(false);
  });
});

// ── 8. CPD TYPES ──────────────────────────────────────────────────────────

describe('CPD Types', () => {
  it('GET /api/cpd-types → 200 array with seed data', async () => {
    const res = await api.get('/api/cpd-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('CPDTypeID');
    expect(res.body[0]).toHaveProperty('Name');
  });

  it('POST /api/cpd-types → 400 without name', async () => {
    const res = await api.post('/api/cpd-types').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/cpd-types → 200 creates type', async () => {
    const res = await api.post('/api/cpd-types').send({ name: '__Test CPD Type__' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.cpdTypeId = res.body.id;
  });

  it('GET /api/cpd-types → new type present', async () => {
    const res = await api.get('/api/cpd-types');
    expect(res.body.some(t => t.CPDTypeID === created.cpdTypeId)).toBe(true);
  });

  it('PUT /api/cpd-types/:id → updates type', async () => {
    const res = await api.put(`/api/cpd-types/${created.cpdTypeId}`).send({
      name: '__Test CPD Type Updated__',
      isActive: 1,
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/cpd-types → reflects update', async () => {
    const res = await api.get('/api/cpd-types');
    const type = res.body.find(t => t.CPDTypeID === created.cpdTypeId);
    expect(type.Name).toBe('__Test CPD Type Updated__');
  });

  it('DELETE /api/cpd-types/:id → 200', async () => {
    const res = await api.delete(`/api/cpd-types/${created.cpdTypeId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/cpd-types → deleted type gone', async () => {
    const res = await api.get('/api/cpd-types');
    expect(res.body.some(t => t.CPDTypeID === created.cpdTypeId)).toBe(false);
  });
});

// ── 9. TRAINING RECORDS ───────────────────────────────────────────────────

describe('Training Records', () => {
  it('GET /api/training → 200 array', async () => {
    const res = await api.get('/api/training');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/training → creates record', async () => {
    const res = await api.post('/api/training').send({
      trainingDate: '2026-04-01',
      trainingType: 'CPD',
      title: '__Test Training Record__',
      category: 'MEDICAL',
      competencyUnit: 'HLTAID011 Provide first aid',
      trainingPackage: 'HLT',
      cpdType: 'Educational activity',
      hours: 2,
      interactive: 'Yes',
      clinicalVsNonClinical: 'Clinical',
      passed: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    created.trainingId = res.body.id;
  });

  it('GET /api/training → new record present', async () => {
    const res = await api.get('/api/training');
    expect(res.body.some(r => r.TrainingID === created.trainingId)).toBe(true);
  });

  it('GET /api/training → filter by type works', async () => {
    const res = await api.get('/api/training').query({ type: 'CPD' });
    expect(res.status).toBe(200);
    expect(res.body.every(r => r.TrainingType === 'CPD')).toBe(true);
  });

  it('GET /api/training → filter by date range works', async () => {
    const res = await api.get('/api/training').query({ startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PUT /api/training/:id → updates record', async () => {
    const res = await api.put(`/api/training/${created.trainingId}`).send({
      trainingDate: '2026-04-01',
      trainingType: 'Competency',
      title: '__Test Training Updated__',
      category: 'RESCUE',
      competencyUnit: 'PUAFIR204 Respond to Wildfire',
      trainingPackage: 'PUA',
      hours: 4,
      interactive: 'No',
      clinicalVsNonClinical: 'Non-Clinical',
      passed: true,
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/training → reflects update', async () => {
    const res = await api.get('/api/training');
    const rec = res.body.find(r => r.TrainingID === created.trainingId);
    expect(rec).toBeDefined();
    expect(rec.TrainingType).toBe('Competency');
    expect(rec.Category).toBe('RESCUE');
    expect(rec.Hours).toBe(4);
  });

  it('GET /api/training/summary → 200 correct shape', async () => {
    const res = await api.get('/api/training/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCPDHours');
    expect(res.body).toHaveProperty('expiringSoon');
    expect(res.body).toHaveProperty('overdue');
    expect(Array.isArray(res.body.expiringSoon)).toBe(true);
    expect(Array.isArray(res.body.overdue)).toBe(true);
  });

  it('DELETE /api/training/:id → 200', async () => {
    const res = await api.delete(`/api/training/${created.trainingId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/training → deleted record gone', async () => {
    const res = await api.get('/api/training');
    expect(res.body.some(r => r.TrainingID === created.trainingId)).toBe(false);
  });
});

// ── 10. TRAINING RECORD WITH TRAINER ──────────────────────────────────────

describe('Training Records with Trainer link', () => {
  let linkTrainerId, linkTrainingId;

  beforeAll(async () => {
    const tr = await api.post('/api/trainers').send({ name: '__Link Trainer__', qualifications: 'TAE' });
    linkTrainerId = tr.body.id;
  });

  afterAll(async () => {
    if (linkTrainingId) await api.delete(`/api/training/${linkTrainingId}`);
    if (linkTrainerId) await api.delete(`/api/trainers/${linkTrainerId}`);
  });

  it('POST /api/training with trainerId links trainer', async () => {
    const res = await api.post('/api/training').send({
      trainingDate: '2026-04-05',
      trainingType: 'Drill',
      title: '__Linked Training__',
      category: 'RESCUE',
      hours: 1,
      trainerId: linkTrainerId,
      passed: true,
    });
    expect(res.status).toBe(200);
    linkTrainingId = res.body.id;
  });

  it('GET /api/training → linked record has TrainerName', async () => {
    const res = await api.get('/api/training');
    const rec = res.body.find(r => r.TrainingID === linkTrainingId);
    expect(rec).toBeDefined();
    expect(rec.TrainerName).toBe('__Link Trainer__');
    expect(rec.TrainerID).toBe(linkTrainerId);
  });
});

// ── 11. AOD TESTS ─────────────────────────────────────────────────────────

describe('AOD Tests', () => {
  it('GET /api/tests → 200 array', async () => {
    const res = await api.get('/api/tests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/tests → date filter works', async () => {
    const res = await api.get('/api/tests').query({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/tests/:id → 404 for non-existent', async () => {
    const res = await api.get('/api/tests/999999');
    expect(res.status).toBe(404);
  });
});

// ── 12. REPORTS ───────────────────────────────────────────────────────────

describe('Reports', () => {
  it('GET /api/reports/weekly.xlsx → 200 xlsx attachment', async () => {
    const res = await api
      .get('/api/reports/weekly.xlsx')
      .query({ startDate: '2026-04-01', endDate: '2026-04-06' })
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toMatch(/attachment/i);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.byteLength).toBeGreaterThan(100);
  });

  it('GET /api/reports/quarterly.xlsx → 200 xlsx attachment', async () => {
    const res = await api
      .get('/api/reports/quarterly.xlsx')
      .query({ year: 2026, quarter: 2 })
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.byteLength).toBeGreaterThan(100);
  });

  it('GET /api/reports/quarterly.template.xlsx → skipped if template missing', async () => {
    const templatePath = 'C:/Users/agill/OneDrive/AOD tracker/AOD Quaterly Contractors Report v2.xlsx';
    if (!existsSync(templatePath)) return;
    const res = await api
      .get('/api/reports/quarterly.template.xlsx')
      .query({ year: 2026, quarter: 1, category: 'Contractor' })
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.body.byteLength).toBeGreaterThan(1000);
  });
});

// ── 13. SEED DATA INTEGRITY ───────────────────────────────────────────────

describe('Seed data integrity', () => {
  it('Training units contain all HLT package seeds', async () => {
    const res = await api.get('/api/training-units');
    const hlt = res.body.filter(u => u.TrainingPackage === 'HLT');
    expect(hlt.some(u => u.Name.includes('HLTAID011'))).toBe(true);
    expect(hlt.some(u => u.Name.includes('HLTAID014'))).toBe(true);
  });

  it('Training units contain PUA package seeds', async () => {
    const res = await api.get('/api/training-units');
    const pua = res.body.filter(u => u.TrainingPackage === 'PUA');
    expect(pua.length).toBeGreaterThanOrEqual(5);
  });

  it('Training units contain RII package seeds', async () => {
    const res = await api.get('/api/training-units');
    const rii = res.body.filter(u => u.TrainingPackage === 'RII');
    expect(rii.length).toBeGreaterThanOrEqual(5);
  });

  it('CPD types contain all 6 standard seeds', async () => {
    const res = await api.get('/api/cpd-types');
    const names = res.body.map(t => t.Name);
    expect(names).toContain('Educational activity');
    expect(names).toContain('Team training');
    expect(names).toContain('Self-directed learning');
    expect(names).toContain('Professional issues');
  });

  it('Lookups include at least 1 test type', async () => {
    const res = await api.get('/api/lookups');
    expect(res.body.testTypes.length).toBeGreaterThan(0);
  });
});

// ── 14. INPUT VALIDATION ──────────────────────────────────────────────────

describe('Input validation', () => {
  it('POST /api/clinicians with empty name → 400', async () => {
    const res = await api.post('/api/clinicians').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/training-units with missing fields → 400', async () => {
    const res = await api.post('/api/training-units').send({ code: 'X' });
    expect(res.status).toBe(400);
  });

  it('POST /api/trainers with no body → 400', async () => {
    const res = await api.post('/api/trainers').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/cpd-types with no name → 400', async () => {
    const res = await api.post('/api/cpd-types').send({});
    expect(res.status).toBe(400);
  });

  it('GET /api/clinicians/:id with unknown id → 404', async () => {
    const res = await api.get('/api/clinicians/999999');
    expect(res.status).toBe(404);
  });

  it('PUT /api/clinicians/:id with unknown id → 404', async () => {
    const res = await api.put('/api/clinicians/999999').send({ name: 'X', isActive: 1 });
    expect(res.status).toBe(404);
  });
});
