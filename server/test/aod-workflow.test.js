/**
 * AOD Workflow Tests — Full outcome scenarios (≤ 3 min)
 *
 * Covers every branch of the BAC + Drug decision tree:
 *   W1  BAC negative (initial 0.000)
 *   W2  BAC positive (final > 0)
 *   W3  Drug negative (oral)
 *   W4  Drug non-negative → lab negative (false positive)
 *   W5  Drug non-negative → lab confirmed → Inconsistent
 *   W6  Drug non-negative → lab confirmed → Consistent (declared meds)
 *   W7  Drug non-negative → lab confirmed → no review (HSE Management Review)
 *   W8  BAC positive + drug non-negative (combined)
 *   W9  Refused result
 *   W10 Urine non-negative workflow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const TODAY = new Date().toISOString().split('T')[0];

// IDs to clean up
const testIds = [];

const createTest = (overrides = {}) =>
  api.post('/api/tests').send({
    testDate: TODAY,
    testTime: '08:00',
    donorName: `__WF Test ${Date.now()}__`,
    testTypeId: 1,
    bacUndertaken: false,
    oralUndertaken: false,
    urineUndertaken: false,
    ...overrides,
  });

afterAll(async () => {
  for (const id of testIds) {
    try { await api.delete(`/api/tests/${id}`); } catch {}
  }
});

// ── W1 BAC Negative ─────────────────────────────────────────────────────────
describe('W1: BAC Negative (initial 0.000)', () => {
  let testId;

  it('creates test with BAC 0.000 → FinalBACOutcome Negative, status Closed', async () => {
    const res = await createTest({
      bacUndertaken: true,
      bacInitialValue: 0,
      bacInitialTime: '08:00',
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET test confirms BAC outcome and OverallAODResult', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.FinalBACOutcome).toBe('Negative');
    expect(res.body.TestStatus).toBe('Closed');
    expect(res.body.OverallAODResult).toBe('Negative');
  });
});

// ── W2 BAC Positive ──────────────────────────────────────────────────────────
describe('W2: BAC Positive (final > 0)', () => {
  let testId;

  it('creates test with BAC final 0.085 → FinalBACOutcome Positive, Action Required', async () => {
    const res = await createTest({
      bacUndertaken: true,
      bacInitialValue: 0.092,
      bacInitialTime: '08:00',
      bacFinalValue: 0.085,
      bacFinalTime: '08:22',
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET test confirms Positive BAC outcome', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.FinalBACOutcome).toBe('Positive');
    expect(res.body.TestStatus).toBe('Action Required');
    expect(res.body.OverallAODResult).toBe('Alcohol Positive');
  });
});

// ── W3 Drug Negative ─────────────────────────────────────────────────────────
describe('W3: Drug Negative (oral)', () => {
  let testId;

  it('creates test with oral Negative → closed', async () => {
    const res = await createTest({
      oralUndertaken: true,
      oralResult: 'Negative',
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET confirms drug Negative, status Closed', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.FinalDrugOutcome).toBe('Negative');
    expect(res.body.TestStatus).toBe('Closed');
    expect(res.body.OverallAODResult).toBe('Negative');
  });
});

// ── W4 Non-Negative → Lab Negative (false positive) ─────────────────────────
describe('W4: Drug Non-Negative → Lab Negative (false positive)', () => {
  let testId;

  it('creates non-negative oral test → Pending Lab', async () => {
    const res = await createTest({
      oralUndertaken: true,
      oralResult: 'Non-Negative',
      oralSubstances: ['THC'],
      sampleSentToLab: true,
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
    expect(res.body).toHaveProperty('testNumber');
  });

  it('GET confirms Pending Confirmation, Pending Lab status', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.FinalDrugOutcome).toBe('Pending Confirmation');
    expect(res.body.TestStatus).toBe('Pending Lab');
    expect(res.body.IsPending).toBe(1);
  });

  it('POST lab-result with Negative clears to Confirmed Negative / Closed', async () => {
    const res = await api.post(`/api/tests/${testId}/lab-result`).send({
      confirmatoryResult: 'Negative',
      confirmatoryResultDate: TODAY,
    });
    expect(res.status).toBe(200);
    expect(res.body.finalDrugOutcome).toBe('Confirmed Negative');
    expect(res.body.testStatus).toBe('Closed');
  });

  it('GET confirms Confirmed Negative, OverallAODResult Negative', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.FinalDrugOutcome).toBe('Confirmed Negative');
    expect(res.body.OverallAODResult).toBe('Negative');
    expect(res.body.TestStatus).toBe('Closed');
  });
});

// ── W5 Non-Negative → Confirmed Inconsistent ────────────────────────────────
describe('W5: Drug Confirmed → Inconsistent (no valid prescription)', () => {
  let testId;

  beforeAll(async () => {
    const res = await createTest({
      oralUndertaken: true, oralResult: 'Non-Negative', oralSubstances: ['Opiates'], sampleSentToLab: true,
    });
    testId = res.body.id;
    testIds.push(testId);
  });

  it('lab-result Substance Confirmed + Inconsistent → Action Required', async () => {
    const res = await api.post(`/api/tests/${testId}/lab-result`).send({
      confirmatoryResult: 'Substance Confirmed',
      detectedSubstances: 'Opiates/Morphine',
      medicationReviewStatus: 'Inconsistent',
      medicationReviewNotes: 'No valid prescription found',
    });
    expect(res.status).toBe(200);
    expect(res.body.finalDrugOutcome).toBe('Confirmed - Inconsistent');
    expect(res.body.testStatus).toBe('Action Required');
  });

  it('GET confirms Drug Confirmed - Inconsistent outcome', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.FinalDrugOutcome).toBe('Confirmed - Inconsistent');
    expect(res.body.OverallAODResult).toBe('Drug Confirmed - Inconsistent');
  });
});

// ── W6 Non-Negative → Confirmed Consistent ──────────────────────────────────
describe('W6: Drug Confirmed → Consistent with declared medications', () => {
  let testId;

  beforeAll(async () => {
    const res = await createTest({
      oralUndertaken: true, oralResult: 'Non-Negative', oralSubstances: ['Opiates'],
      sampleSentToLab: true, declaredMedications: 'Codeine 30mg',
    });
    testId = res.body.id;
    testIds.push(testId);
  });

  it('lab-result Consistent → Closed, Confirmed - Consistent with Declaration', async () => {
    const res = await api.post(`/api/tests/${testId}/lab-result`).send({
      confirmatoryResult: 'Substance Confirmed',
      detectedSubstances: 'Opiates/Codeine',
      medicationReviewStatus: 'Consistent',
      medicationReviewNotes: 'Consistent with declared Codeine',
    });
    expect(res.status).toBe(200);
    expect(res.body.finalDrugOutcome).toBe('Confirmed - Consistent with Declaration');
    expect(res.body.testStatus).toBe('Closed');
  });

  it('GET confirms Drug Confirmed - Consistent', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.OverallAODResult).toBe('Drug Confirmed - Consistent');
  });
});

// ── W7 Non-Negative → Confirmed, Pending HSE Management Review ──────────────
describe('W7: Drug Confirmed → Pending HSE Management Review', () => {
  let testId;

  beforeAll(async () => {
    const res = await createTest({
      oralUndertaken: true, oralResult: 'Non-Negative', oralSubstances: ['Amphetamines'], sampleSentToLab: true,
    });
    testId = res.body.id;
    testIds.push(testId);
  });

  it('lab-result Substance Confirmed + no review → HSE Management Review', async () => {
    const res = await api.post(`/api/tests/${testId}/lab-result`).send({
      confirmatoryResult: 'Substance Confirmed',
      detectedSubstances: 'Amphetamines',
    });
    expect(res.status).toBe(200);
    expect(res.body.finalDrugOutcome).toBe('Confirmed - Pending HSE Management Review');
    expect(res.body.testStatus).toBe('Review Required');
  });

  it('GET confirms Review Required OverallAODResult', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.OverallAODResult).toBe('Review Required');
  });
});

// ── W8 BAC Positive + Drug Non-Negative ──────────────────────────────────────
describe('W8: BAC Positive + Drug Non-Negative (combined)', () => {
  let testId;

  it('creates combined test → Pending Lab (drug takes priority over BAC status)', async () => {
    const res = await createTest({
      bacUndertaken: true,
      bacInitialValue: 0.055,
      bacInitialTime: '09:00',
      bacFinalValue: 0.050,
      bacFinalTime: '09:22',
      oralUndertaken: true,
      oralResult: 'Non-Negative',
      oralSubstances: ['THC'],
      sampleSentToLab: true,
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET confirms IsPending=1 and Alcohol Positive pending lab', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.IsPending).toBe(1);
    expect(res.body.FinalBACOutcome).toBe('Positive');
    expect(res.body.FinalDrugOutcome).toBe('Pending Confirmation');
  });
});

// ── W9 Refused Result ────────────────────────────────────────────────────────
describe('W9: Refused result', () => {
  let testId;

  it('creates test with oral Refused', async () => {
    const res = await createTest({ oralUndertaken: true, oralResult: 'Refused' });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET confirms Refused outcome', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.FinalDrugOutcome).toBe('Refused');
  });
});

// ── W10 Urine Non-Negative ───────────────────────────────────────────────────
describe('W10: Urine Non-Negative workflow', () => {
  let testId;

  it('creates urine non-negative test', async () => {
    const res = await createTest({
      urineUndertaken: true,
      urineResult: 'Non-Negative',
      urineSubstances: ['Benzodiazepines'],
      sampleSentToLab: true,
    });
    expect(res.status).toBe(200);
    testId = res.body.id;
    testIds.push(testId);
  });

  it('GET confirms Pending Confirmation, RFT=1', async () => {
    const res = await api.get(`/api/tests/${testId}`);
    expect(res.body.FinalDrugOutcome).toBe('Pending Confirmation');
    expect(res.body.RFT).toBe(1);
    expect(res.body.TestStatus).toBe('Pending Lab');
  });
});
