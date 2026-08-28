/**
 * Test data helpers for e2e tests
 * Provides seed data for consistent testing
 */

import { Page } from '@playwright/test';

export interface TestPerson {
  fullName: string;
  dob: string;
  gender: string;
  company: string;
  employeeNumber?: string;
  badgeNumber?: string;
}

export interface TestAODRecord {
  testDate: string;
  testTime: string;
  personId?: number;
  testTypeId: number;
  clinicianId?: number;
  oralUndertaken: boolean;
  oralResult?: string;
  bacUndertaken: boolean;
  bacInitialValue?: number;
  bacFinalValue?: number;
  urineUndertaken: boolean;
  urineResult?: string;
  notes?: string;
}

export interface TestPatientEvent {
  eventDate: string;
  eventTime: string;
  wrNwr: string;
  patientName: string;
  bodyLocation?: string;
  injuryType?: string;
  rtwPlan?: string;
  referral?: string;
  clinicianId?: number;
}

/**
 * Seed test data via API calls
 */
export async function seedTestEmployers(page: Page) {
  const employers = [
    { name: 'SCJV Staff Test', category: 'Employee', contractNumber: 'EMP-001' },
    { name: 'Contractor Test Co', category: 'Contractor', contractNumber: 'CON-001' },
    { name: 'Another Contractor', category: 'Contractor', contractNumber: 'CON-002' }
  ];

  for (const emp of employers) {
    await page.request.post('/api/employers', {
      data: emp
    });
  }
}

/**
 * Seed test people
 */
export async function seedTestPeople(page: Page): Promise<number[]> {
  const people = [
    { fullName: 'John Smith', dob: '1985-03-15', gender: 'Male', company: 'SCJV Staff Test', employeeNumber: 'EMP001' },
    { fullName: 'Jane Doe', dob: '1990-07-22', gender: 'Female', company: 'Contractor Test Co', badgeNumber: 'BG001' },
    { fullName: 'Bob Wilson', dob: '1982-11-08', gender: 'Male', company: 'Another Contractor', badgeNumber: 'BG002' }
  ];

  const ids: number[] = [];
  for (const person of people) {
    const response = await page.request.post('/api/people', { data: person });
    const data = await response.json();
    ids.push(data.id);
  }
  return ids;
}

/**
 * Seed AOD tests with various outcomes
 */
export async function seedTestAODTests(page: Page, personIds: number[]) {
  const today = new Date().toISOString().split('T')[0];
  const tests = [
    // Negative test
    {
      testDate: today,
      testTime: '09:00',
      personId: personIds[0],
      testTypeId: 1,
      oralUndertaken: true,
      oralResult: 'Negative',
      bacUndertaken: true,
      bacInitialValue: 0,
      urineUndertaken: false
    },
    // Positive BAC test
    {
      testDate: today,
      testTime: '10:30',
      personId: personIds[1],
      testTypeId: 2,
      oralUndertaken: true,
      oralResult: 'Negative',
      bacUndertaken: true,
      bacInitialValue: 0.023,
      bacFinalValue: 0.021,
      urineUndertaken: false
    },
    // Non-negative drug test
    {
      testDate: today,
      testTime: '11:00',
      personId: personIds[2],
      testTypeId: 3,
      oralUndertaken: true,
      oralResult: 'Non-Negative',
      bacUndertaken: false,
      urineUndertaken: true,
      urineResult: 'Negative',
      notes: 'Test notes'
    }
  ];

  for (const test of tests) {
    await page.request.post('/api/aod-tests', { data: test });
  }
}

/**
 * Seed patient events
 */
export async function seedTestPatientEvents(page: Page) {
  const today = new Date().toISOString().split('T')[0];
  const events = [
    {
      eventDate: today,
      eventTime: '08:00',
      wrNwr: 'WR',
      patientName: 'Patient One',
      bodyLocation: 'Hand',
      injuryType: 'Cut/Laceration',
      rtwPlan: 'Fit for full duties',
      referral: 'None'
    },
    {
      eventDate: today,
      eventTime: '09:30',
      wrNwr: 'WR Review',
      patientName: 'Patient Two',
      bodyLocation: 'Back',
      injuryType: 'Sprain/Strain',
      rtwPlan: 'Suitable duties',
      referral: 'Follow up'
    },
    {
      eventDate: today,
      eventTime: '14:00',
      wrNwr: 'NWR',
      patientName: 'Patient Three',
      bodyLocation: 'Head',
      injuryType: 'Other',
      rtwPlan: 'Not fit for work',
      referral: 'ED Referral'
    }
  ];

  for (const event of events) {
    await page.request.post('/api/patient-events', { data: event });
  }
}

/**
 * Clear all test data
 */
export async function clearTestData(page: Page) {
  await page.request.post('/api/test/cleanup', {});
}

/**
 * Generate date range for reports
 */
export function getDateRange(days: number = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}
