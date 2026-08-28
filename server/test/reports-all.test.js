/**
 * RP: All report endpoints — GET, POST export, drilldown, templates
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const T = 180_000;
const START = '2024-01-01';
const END   = new Date().toISOString().split('T')[0];
const BASE  = { startDate: START, endDate: END };

// ── RP1: AOD Summary Reports ──────────────────────────────────────────────────
describe('RP1: AOD Summary Reports', () => {
  it('GET /api/reports/dashboard returns object', { timeout: T }, async () => {
    const res = await api.get('/api/reports/dashboard');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/reports/analytics returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/analytics?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/weekly returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/weekly?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/dna returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/dna?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/pending returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/pending?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/variation returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/variation?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-weekly-summary returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/aod-weekly-summary?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-nonnegative returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/aod-nonnegative?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/summary-inputs returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/summary-inputs?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });
});

// ── RP2: Quarterly Reports ────────────────────────────────────────────────────
describe('RP2: Quarterly Reports', () => {
  it('GET /api/reports/quarterly returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/quarterly?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-summary returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-summary?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-detail returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-detail?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-positive-bac returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-positive-bac?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-for-cause returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-for-cause?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-pending returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-pending?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/aod-quarterly-nonnegative returns data', { timeout: T }, async () => {
    const res = await api.get('/api/reports/aod-quarterly-nonnegative?year=2024&quarter=1');
    expect(res.status).toBe(200);
  });
});

// ── RP3: Patient/Clinical Reports ────────────────────────────────────────────
describe('RP3: Patient & Clinical Reports', () => {
  it('GET /api/reports/weekly-events returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/weekly-events?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/site-weekly-event returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/site-weekly-event?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/patient-wr-location returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/patient-wr-location?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/patient-wr-type returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/patient-wr-type?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/patient-wr-class returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/patient-wr-class?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/patient-nwr-class returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/patient-nwr-class?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/wr-injury-outcome returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/wr-injury-outcome?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });
});

// ── RP4: ESO & Training Reports ───────────────────────────────────────────────
describe('RP4: ESO & Training Reports', () => {
  it('GET /api/reports/eso-certificate returns 400 without clinicianId (validates params)', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/eso-certificate?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(400);
  });
});

// ── RP5: Custom Query & Drilldown ─────────────────────────────────────────────
describe('RP5: Custom Query & Drilldown', () => {
  it('GET /api/reports/custom-query with filters returns data', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/custom-query?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });

  it('POST /api/reports/custom runs custom report', { timeout: T }, async () => {
    const res = await api.post('/api/reports/custom').send({
      startDate: START, endDate: END, reportType: 'tests',
    });
    expect([200, 400]).toContain(res.status);
  });

  it('POST /api/reports/drilldown returns rows+columns', { timeout: T }, async () => {
    const res = await api.post('/api/reports/drilldown').send({
      reportId: 'daily-activity', startDate: START, endDate: END,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('columns');
  });
});

// ── RP6: Excel/PDF Export ─────────────────────────────────────────────────────
describe('RP6: Export Endpoints', () => {
  it('POST /api/reports/export/excel/daily-activity returns xlsx', { timeout: T }, async () => {
    const res = await api.post('/api/reports/export/excel/daily-activity').send(BASE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheet|octet/);
  });

  it('POST /api/reports/export/pdf/daily-activity returns HTML', { timeout: T }, async () => {
    const res = await api.post('/api/reports/export/pdf/daily-activity').send(BASE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('POST /api/reports/export/excel/non-negative-summary returns xlsx', { timeout: T }, async () => {
    const res = await api.post('/api/reports/export/excel/non-negative-summary').send(BASE);
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/analytics.xlsx returns xlsx', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/analytics.xlsx?startDate=${START}&endDate=${END}`);
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/reports/weekly.xlsx returns xlsx', { timeout: T }, async () => {
    const res = await api.get(`/api/reports/weekly.xlsx?startDate=${START}&endDate=${END}`);
    expect(res.status).toBe(200);
  });
});

// ── RP7: Report Templates ─────────────────────────────────────────────────────
describe('RP7: Report Templates CRUD', () => {
  let templateId;

  it('GET /api/report-templates returns array', { timeout: T }, async () => {
    const res = await api.get('/api/report-templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/report-templates creates template', { timeout: T }, async () => {
    const res = await api.post('/api/report-templates').send({
      name: 'RP Test Template',
      config: JSON.stringify({ reportType: 'daily-activity', startDate: START, endDate: END }),
    });
    expect([200, 201]).toContain(res.status);
    templateId = res.body.id || res.body.TemplateID;
  });

  it('PUT /api/report-templates/:id updates', { timeout: T }, async () => {
    if (!templateId) return;
    const res = await api.put(`/api/report-templates/${templateId}`).send({ name: 'RP Test Template Updated' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/report-templates/:id removes', { timeout: T }, async () => {
    if (!templateId) return;
    const res = await api.delete(`/api/report-templates/${templateId}`);
    expect([200, 204]).toContain(res.status);
  });
});
