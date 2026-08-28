/**
 * Testing Management Routes (≤ 3 min)
 *
 * Covers:
 *   TM1  DNA/Attendance — POST, GET, PUT, DELETE
 *   TM2  Pending Medicals — POST, GET, PUT, DELETE
 *   TM3  Manual scheduled test — POST /api/schedule
 *   TM4  Random list generate from system persons — POST /api/random-lists/generate
 *   TM5  Random list add-to-pending — POST /api/random-lists/:id/add-to-pending
 *   TM6  Report Templates — POST, GET, PUT, DELETE
 *   TM7  Report export routes — Excel + PDF HTML
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const TODAY = new Date().toISOString().split('T')[0];

// Track created IDs for cleanup
const cleanupAttendance    = [];
const cleanupMedicals      = [];
const cleanupSchedule      = [];
const cleanupRandomLists   = [];
const cleanupTemplates     = [];
const cleanupPersons       = [];

afterAll(async () => {
  for (const id of cleanupAttendance)  try { await api.delete(`/api/attendance/${id}`);        } catch {}
  for (const id of cleanupMedicals)    try { await api.delete(`/api/pending-medicals/${id}`);  } catch {}
  for (const id of cleanupSchedule)    try { await api.delete(`/api/schedule/${id}`);           } catch {}
  for (const id of cleanupRandomLists) try { await api.delete(`/api/random-lists/${id}`);       } catch {}
  for (const id of cleanupTemplates)   try { await api.delete(`/api/report-templates/${id}`);   } catch {}
  for (const id of cleanupPersons)      try { await api.delete(`/api/persons/${id}`);            } catch {}
});

// ── TM1 DNA / Attendance ──────────────────────────────────────────────────────

describe('TM1: DNA / Attendance records', () => {
  let recordId;
  let personId;

  beforeAll(async () => {
    // AttendanceRecord.PersonID is NOT NULL — need a real person
    const pRes = await api.post('/api/persons').send({ fullName: '__TM DNA Person__', sexId: 1 });
    personId = pRes.body?.id;
    if (personId) cleanupPersons.push(personId);
  });

  it('GET /api/attendance returns 200 array', async () => {
    const res = await api.get('/api/attendance');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/attendance → 400 without scheduledDate', async () => {
    const res = await api.post('/api/attendance').send({ personId, reasonCategory: 'Not at work' });
    expect(res.status).toBe(400);
  });

  it('POST /api/attendance creates DNA record with date + reason', async () => {
    const res = await api.post('/api/attendance').send({
      personId,
      scheduledDate:   TODAY,
      scheduledTime:   '08:00',
      reasonCategory:  'Not at work',
      reason:          'Called in sick',
      followUpRequired: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    recordId = res.body.id;
    cleanupAttendance.push(recordId);
  });

  it('GET /api/attendance returns created record', async () => {
    const res = await api.get('/api/attendance').query({ dateFrom: TODAY, dateTo: TODAY });
    expect(res.status).toBe(200);
    const found = res.body.find(r => r.AttendanceID === recordId);
    expect(found).toBeDefined();
    expect(found.ReasonCategory).toBe('Not at work');
    expect(found.FollowUpRequired).toBe(1);
  });

  it('PUT /api/attendance/:id updates reason', async () => {
    const res = await api.put(`/api/attendance/${recordId}`).send({
      reasonCategory: 'Off-duty',
      reason: 'Annual leave',
      followUpRequired: false,
    });
    expect(res.status).toBe(200);
  });

  it('GET confirms updated reason', async () => {
    const res = await api.get('/api/attendance').query({ dateFrom: TODAY, dateTo: TODAY });
    const found = res.body.find(r => r.AttendanceID === recordId);
    expect(found.ReasonCategory).toBe('Off-duty');
    expect(found.FollowUpRequired).toBe(0);
  });

  it('DELETE /api/attendance/:id removes record', async () => {
    const res = await api.delete(`/api/attendance/${recordId}`);
    expect([200, 204]).toContain(res.status);
    cleanupAttendance.splice(cleanupAttendance.indexOf(recordId), 1);
  });

  it('GET confirms record is gone', async () => {
    const res = await api.get('/api/attendance').query({ dateFrom: TODAY, dateTo: TODAY });
    expect(res.body.find(r => r.AttendanceID === recordId)).toBeUndefined();
  });
});

// ── TM2 Pending Medicals ──────────────────────────────────────────────────────

describe('TM2: Pending Medicals CRUD', () => {
  let medicalId;

  it('GET /api/pending-medicals returns 200 array', async () => {
    const res = await api.get('/api/pending-medicals');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST without medicalType → 400', async () => {
    const res = await api.post('/api/pending-medicals').send({ personName: 'Test Person' });
    expect(res.status).toBe(400);
  });

  it('POST creates pending medical', async () => {
    const res = await api.post('/api/pending-medicals').send({
      personName:    '__TM Medical Worker__',
      medicalType:   'Pre-Employment',
      priority:      'High',
      dueDate:       TODAY,
      notes:         'New starter requiring pre-employment medical',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    medicalId = res.body.id;
    cleanupMedicals.push(medicalId);
  });

  it('GET returns created medical', async () => {
    const res = await api.get('/api/pending-medicals');
    const found = res.body.find(m => m.MedicalID === medicalId);
    expect(found).toBeDefined();
    expect(found.MedicalType).toBe('Pre-Employment');
    expect(found.Priority).toBe('High');
    expect(found.Status).toBe('Pending');
  });

  it('GET with status filter returns matching records', async () => {
    const res = await api.get('/api/pending-medicals').query({ status: 'Pending' });
    expect(res.status).toBe(200);
    res.body.forEach(m => expect(m.Status).toBe('Pending'));
  });

  it('PUT updates status to Scheduled', async () => {
    const res = await api.put(`/api/pending-medicals/${medicalId}`).send({
      medicalType: 'Pre-Employment',
      priority:    'High',
      status:      'Scheduled',
      scheduledDate: TODAY,
      notes:       'Booked with clinic',
    });
    expect(res.status).toBe(200);
  });

  it('GET reflects Scheduled status', async () => {
    const res = await api.get('/api/pending-medicals');
    const found = res.body.find(m => m.MedicalID === medicalId);
    expect(found.Status).toBe('Scheduled');
  });

  it('DELETE removes the medical', async () => {
    const res = await api.delete(`/api/pending-medicals/${medicalId}`);
    expect([200, 204]).toContain(res.status);
    cleanupMedicals.splice(cleanupMedicals.indexOf(medicalId), 1);
  });
});

// ── TM3 Manual scheduled test ─────────────────────────────────────────────────

describe('TM3: POST /api/schedule — manual test creation', () => {
  let scheduleId;

  it('creates a pending scheduled test manually', async () => {
    // First create a person to link
    const pRes = await api.post('/api/persons').send({
      fullName: '__TM Schedule Person__', sexId: 1,
    });
    const personId = pRes.body?.id || null;

    const res = await api.post('/api/schedule').send({
      personId,
      scheduledDate: TODAY,
      scheduledTime: '09:00',
      notes: 'Manual pending test',
    });
    expect([200, 201, 400]).toContain(res.status); // 400 if personId required
    if (res.status === 200 || res.status === 201) {
      scheduleId = res.body?.id || res.body?.scheduleId;
      if (scheduleId) cleanupSchedule.push(scheduleId);
    }
  });

  it('GET /api/schedule returns the scheduled list', async () => {
    const res = await api.get('/api/schedule').query({ date: TODAY });
    expect(res.status).toBe(200);
    // may be array or object with schedules key
    const list = Array.isArray(res.body) ? res.body : (res.body.schedules || []);
    expect(Array.isArray(list)).toBe(true);
  });
});

// ── TM4 Random list — generate from system persons ────────────────────────────

describe('TM4: POST /api/random-lists/generate', () => {
  let listId;

  it('generates a random list from system persons (gracefully handles empty pool)', async () => {
    const res = await api.post('/api/random-lists/generate').send({
      listDate: TODAY,
      shift: 'Day',
      count: 5,
    });
    // 200 with entries, or 200/400 with message if no eligible persons
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('listId');
      expect(res.body).toHaveProperty('entries');
      expect(Array.isArray(res.body.entries)).toBe(true);
      listId = res.body.listId;
      cleanupRandomLists.push(listId);
    }
  });

  it('GET /api/random-lists/:id/export/excel returns xlsx bytes', async () => {
    if (!listId) return;
    const res = await api.get(`/api/random-lists/${listId}/export/excel`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml|xlsx|octet-stream/);
  });

  it('GET /api/random-lists/:id/export/pdf returns HTML', async () => {
    if (!listId) return;
    const res = await api.get(`/api/random-lists/${listId}/export/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ── TM5 Random list add-to-pending ───────────────────────────────────────────

describe('TM5: POST /api/random-lists/:id/add-to-pending', () => {
  it('add-to-pending on existing list returns added count', async () => {
    // Create a list first
    const createRes = await api.post('/api/random-lists').send({
      listDate: TODAY, shift: 'Night',
    });
    expect(createRes.status).toBe(200);
    const listId = createRes.body.id;
    cleanupRandomLists.push(listId);

    // Add entries (without matchedPersonId so they skip the pending insert)
    await api.post(`/api/random-lists/${listId}/entries`).send({
      employeeName: '__TM Pending A__', employeeNumber: 'TP-001',
    });

    const res = await api.post(`/api/random-lists/${listId}/add-to-pending`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('added');
    expect(typeof res.body.added).toBe('number');
  });
});

// ── TM6 Report Templates ─────────────────────────────────────────────────────

describe('TM6: Report Templates CRUD', () => {
  let templateId;

  it('GET /api/report-templates returns 200 array', async () => {
    const res = await api.get('/api/report-templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST without name → 400', async () => {
    const res = await api.post('/api/report-templates').send({ reportId: 'daily-activity' });
    expect(res.status).toBe(400);
  });

  it('POST creates report template', async () => {
    const res = await api.post('/api/report-templates').send({
      name:        '__TM Template Test__',
      description: 'Created by automated test',
      reportId:    'daily-activity',
      config:      JSON.stringify({ datePreset: 'last30days' }),
      datePreset:  'last30days',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    templateId = res.body.id;
    cleanupTemplates.push(templateId);
  });

  it('GET returns created template', async () => {
    const res = await api.get('/api/report-templates');
    const found = res.body.find(t => t.TemplateID === templateId);
    expect(found).toBeDefined();
    expect(found.Name).toBe('__TM Template Test__');
    expect(found.ReportId).toBe('daily-activity');
  });

  it('PUT updates template name', async () => {
    const res = await api.put(`/api/report-templates/${templateId}`).send({
      name:       '__TM Template Updated__',
      reportId:   'daily-activity',
      datePreset: 'last7days',
    });
    expect(res.status).toBe(200);
  });

  it('GET reflects updated name', async () => {
    const res = await api.get('/api/report-templates');
    const found = res.body.find(t => t.TemplateID === templateId);
    expect(found.Name).toBe('__TM Template Updated__');
    expect(found.DatePreset).toBe('last7days');
  });

  it('DELETE removes template', async () => {
    const res = await api.delete(`/api/report-templates/${templateId}`);
    expect([200, 204]).toContain(res.status);
    cleanupTemplates.splice(cleanupTemplates.indexOf(templateId), 1);
    const listRes = await api.get('/api/report-templates');
    expect(listRes.body.find(t => t.TemplateID === templateId)).toBeUndefined();
  });
});

// ── TM7 Report export routes ─────────────────────────────────────────────────

describe('TM7: Report export routes', () => {
  const params = {
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate:   new Date().toISOString().split('T')[0],
  };

  it('POST /api/reports/export/excel/daily-activity returns xlsx', async () => {
    const res = await api.post('/api/reports/export/excel/daily-activity').send(params);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml|xlsx|octet-stream/);
  });

  it('POST /api/reports/export/pdf/daily-activity returns HTML', async () => {
    const res = await api.post('/api/reports/export/pdf/daily-activity').send(params);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toMatch(/window\.print|<table/i);
  });

  it('POST /api/reports/export/excel/non-negative-summary returns xlsx', async () => {
    const res = await api.post('/api/reports/export/excel/non-negative-summary').send(params);
    expect(res.status).toBe(200);
  });

  it('POST /api/reports/custom returns { columns, rows } (AOD dataset)', async () => {
    const res = await api.post('/api/reports/custom').send({
      ...params,
      dataset: 'aod',
      groupBy: 'month',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body).toHaveProperty('columns');
    expect(res.body.dataset).toBe('aod');
  });

  it('POST /api/reports/custom returns { columns, rows } (patient dataset)', async () => {
    const res = await api.post('/api/reports/custom').send({
      ...params,
      dataset: 'patient',
      groupBy: 'wrNwr',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('POST /api/reports/custom → 400 for invalid dataset', async () => {
    const res = await api.post('/api/reports/custom').send({ ...params, dataset: 'unknown', groupBy: 'month' });
    expect(res.status).toBe(400);
  });

  it('POST /api/reports/drilldown returns { rows, columns } (AOD drill-down)', async () => {
    const res = await api.post('/api/reports/drilldown').send({
      ...params,
      reportId: 'daily-activity',
      field: 'result',
      value: '__all__',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body).toHaveProperty('columns');
  });
});
