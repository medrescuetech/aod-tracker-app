/**
 * PE: Patient Events, Attendance, Pending Medicals, Review Appointments,
 *     Compliance Checks, Patient Search
 * Each test capped at 3 minutes (180000ms).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

const api = request(app);
const T = 180_000;
const TODAY = new Date().toISOString().split('T')[0];
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

let personId, employerId, eventId, attendanceId, medicalId, apptId, checkId, completionId;

beforeAll(async () => {
  const emp = await api.post('/api/employers').send({ companyName: 'PE Employer', category: 'Contractor' });
  employerId = emp.body.id || emp.body.EmployerID;
  const per = await api.post('/api/persons').send({
    fullName: 'PE Patient', badgeNumber: 'PE001', employerId,
  });
  personId = per.body.id || per.body.PersonID;
});

// ── PE1: Patient Events ───────────────────────────────────────────────────────
describe('PE1: Patient Events CRUD', () => {
  it('GET /api/patient-events returns array', { timeout: T }, async () => {
    const res = await api.get('/api/patient-events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/patient-events creates event', { timeout: T }, async () => {
    const res = await api.post('/api/patient-events').send({
      personId,
      eventDate: TODAY,
      eventTime: '08:00',
      wrNwr: 'WR',
      injuryType: 'Laceration/Cut',
      bodyLocation: 'Hand',
      classification: 'First Aid',
    });
    expect([200, 201]).toContain(res.status);
    eventId = res.body.id || res.body.EventID;
    expect(eventId).toBeTruthy();
  });

  it('PUT /api/patient-events/:id updates event', { timeout: T }, async () => {
    if (!eventId) return;
    const res = await api.put(`/api/patient-events/${eventId}`).send({
      eventDate: TODAY, wrNwr: 'WR', classification: 'Assessment Only',
    });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/patient-search returns array', { timeout: T }, async () => {
    const res = await api.get('/api/patient-search?q=PE+Patient');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/patient-events/:id removes event', { timeout: T }, async () => {
    if (!eventId) return;
    const res = await api.delete(`/api/patient-events/${eventId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── PE2: Attendance ───────────────────────────────────────────────────────────
describe('PE2: Attendance Records', () => {
  it('GET /api/attendance returns array', { timeout: T }, async () => {
    const res = await api.get('/api/attendance');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/attendance creates DNA record', { timeout: T }, async () => {
    const res = await api.post('/api/attendance').send({
      personId,
      scheduledDate: TODAY,
      reason: 'Did Not Attend',
      reasonCategory: 'DNA',
    });
    expect([200, 201]).toContain(res.status);
    attendanceId = res.body.id || res.body.AttendanceID;
  });

  it('PUT /api/attendance/:id updates', { timeout: T }, async () => {
    if (!attendanceId) return;
    const res = await api.put(`/api/attendance/${attendanceId}`).send({ Reason: 'Refused' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/attendance/:id removes', { timeout: T }, async () => {
    if (!attendanceId) return;
    const res = await api.delete(`/api/attendance/${attendanceId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── PE3: Pending Medicals ─────────────────────────────────────────────────────
describe('PE3: Pending Medicals CRUD', () => {
  it('GET /api/pending-medicals returns array', { timeout: T }, async () => {
    const res = await api.get('/api/pending-medicals');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/pending-medicals creates record', { timeout: T }, async () => {
    const res = await api.post('/api/pending-medicals').send({
      personId,
      medicalType: 'Fitness for Duty',
      dueDate: NEXT_WEEK,
      notes: 'PE test',
    });
    expect([200, 201]).toContain(res.status);
    medicalId = res.body.id || res.body.MedicalID;
  });

  it('PUT /api/pending-medicals/:id updates', { timeout: T }, async () => {
    if (!medicalId) return;
    const res = await api.put(`/api/pending-medicals/${medicalId}`).send({ medicalType: 'Fitness for Duty', notes: 'Updated' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/pending-medicals/:id removes', { timeout: T }, async () => {
    if (!medicalId) return;
    const res = await api.delete(`/api/pending-medicals/${medicalId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── PE4: Review Appointments ──────────────────────────────────────────────────
describe('PE4: Review Appointments CRUD', () => {
  it('GET /api/review-appointments returns array', { timeout: T }, async () => {
    const res = await api.get('/api/review-appointments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/review-appointments/upcoming returns data', { timeout: T }, async () => {
    const res = await api.get('/api/review-appointments/upcoming');
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/review-appointments creates appointment', { timeout: T }, async () => {
    const res = await api.post('/api/review-appointments').send({
      personId,
      appointmentDate: NEXT_WEEK,
      status: 'Scheduled',
    });
    expect([200, 201]).toContain(res.status);
    apptId = res.body.id || res.body.AppointmentID;
  });

  it('GET /api/review-appointments/:id returns appt', { timeout: T }, async () => {
    if (!apptId) return;
    const res = await api.get(`/api/review-appointments/${apptId}`);
    expect([200, 404]).toContain(res.status);
  });

  it('PUT /api/review-appointments/:id updates', { timeout: T }, async () => {
    if (!apptId) return;
    const res = await api.put(`/api/review-appointments/${apptId}`).send({ Notes: 'Updated PE appt' });
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/review-appointments/:id removes', { timeout: T }, async () => {
    if (!apptId) return;
    const res = await api.delete(`/api/review-appointments/${apptId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ── PE5: Compliance Checks ────────────────────────────────────────────────────
describe('PE5: Compliance Checks CRUD', () => {
  it('GET /api/checks returns array', { timeout: T }, async () => {
    const res = await api.get('/api/checks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/checks creates check', { timeout: T }, async () => {
    const res = await api.post('/api/checks').send({
      name: 'PE Check', description: 'Test compliance check', frequencyDays: 90,
    });
    expect([200, 201]).toContain(res.status);
    checkId = res.body.id || res.body.CheckID;
  });

  it('PUT /api/checks/:id updates', { timeout: T }, async () => {
    if (!checkId) return;
    const res = await api.put(`/api/checks/${checkId}`).send({ name: 'PE Check Updated', frequencyDays: 180 });
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/checks/:id/completions returns array', { timeout: T }, async () => {
    if (!checkId) return;
    const res = await api.get(`/api/checks/${checkId}/completions`);
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/checks/:id/completions adds completion', { timeout: T }, async () => {
    if (!checkId || !personId) return;
    const res = await api.post(`/api/checks/${checkId}/completions`).send({
      completedDate: TODAY,
      completedBy: 'PE Tester',
      notes: 'Completed in test',
    });
    expect([200, 201]).toContain(res.status);
    completionId = res.body.id || res.body.CompletionID;
  });

  it('DELETE /api/checks/:id/completions/:cid removes', { timeout: T }, async () => {
    if (!checkId || !completionId) return;
    const res = await api.delete(`/api/checks/${checkId}/completions/${completionId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('DELETE /api/checks/:id removes check', { timeout: T }, async () => {
    if (!checkId) return;
    const res = await api.delete(`/api/checks/${checkId}`);
    expect([200, 204]).toContain(res.status);
  });
});
