/**
 * Seed script — generates representative test data covering all data inputs.
 * Run: node server/seed.js
 *
 * WARNING: This appends data to the existing database. Run once on a fresh DB
 * or manually clear tables first if you want a clean slate.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'database', 'aod_tracker.db');

const SQL = await initSqlJs();
let db;
if (existsSync(DB_PATH)) {
  db = new SQL.Database(readFileSync(DB_PATH));
} else {
  console.error('Database not found at', DB_PATH);
  process.exit(1);
}

const run = (sql, params = []) => {
  db.run(sql, params);
  const r = db.exec('SELECT last_insert_rowid()');
  return r.length ? r[0].values[0][0] : null;
};
const query = (sql, params = []) => {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const [{ columns, values }] = res;
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
};
const save = () => {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
};

// ─── helpers ───────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── 1. Employers ──────────────────────────────────────────────────────────

console.log('\n▶  Seeding employers...');
const employers = [
  { name: 'SCJV Operations',    category: 'SCJV Staff',  contact: 'John Smith',    email: 'j.smith@scjv.com.au',   phone: '08 9001 1000' },
  { name: 'SCJV Engineering',   category: 'SCJV Staff',  contact: 'Lisa Park',     email: 'l.park@scjv.com.au',    phone: '08 9001 1001' },
  { name: 'Monadelphous Group',  category: 'Contractor', contact: 'Brett Wilson',  email: 'b.wilson@monadelphous.com.au', phone: '08 9311 2000' },
  { name: 'Civmec Construction', category: 'Contractor', contact: 'Sarah Nguyen',  email: 's.nguyen@civmec.com.au', phone: '08 9410 3000' },
  { name: 'Sodexo Facilities',   category: 'Contractor', contact: 'Tom Hargreaves',email: 't.hargreaves@sodexo.com', phone: '08 9400 4000' },
  { name: 'DT Infrastructure',   category: 'Contractor', contact: 'Amir Patel',    email: 'a.patel@dtinfra.com.au', phone: '08 9250 5000' },
];
const empIds = {};
for (const e of employers) {
  const id = run(
    `INSERT INTO Employer (CompanyName, Category, ContactName, ContactEmail, ContactPhone) VALUES (?,?,?,?,?)`,
    [e.name, e.category, e.contact, e.email, e.phone]
  );
  empIds[e.name] = id;
  console.log(`   Employer ${id}: ${e.name} (${e.category})`);
}

// ─── 2. Clinicians ─────────────────────────────────────────────────────────

console.log('\n▶  Seeding clinicians...');
const clinicians = [
  { name: 'Dr. Rachel Green',   empNum: 'CLIN-001', credentials: 'MBBS, FAFOEM', email: 'r.green@clinic.com' },
  { name: 'Nurse James Harlow', empNum: 'CLIN-002', credentials: 'RN, GCOccHealth',  email: 'j.harlow@clinic.com' },
  { name: 'Paramedic Ann Cole', empNum: 'CLIN-003', credentials: 'Cert IV Paramedic', email: 'a.cole@clinic.com' },
];
const clinicianIds = {};
for (const c of clinicians) {
  const id = run(
    `INSERT INTO Clinician (Name, EmployeeNumber, Credentials, Email, IsActive) VALUES (?,?,?,?,1)`,
    [c.name, c.empNum, c.credentials, c.email]
  );
  clinicianIds[c.name] = id;
  console.log(`   Clinician ${id}: ${c.name}`);
}

// ─── 3. Persons (Workers) ──────────────────────────────────────────────────

console.log('\n▶  Seeding persons...');
const persons = [
  { name: 'Michael Carter',   dob: '1985-03-12', emp: 'SCJV Operations',    badge: 'S-0001' },
  { name: 'Jane Thompson',    dob: '1990-07-22', emp: 'SCJV Engineering',    badge: 'S-0002' },
  { name: 'David Nguyen',     dob: '1978-11-05', emp: 'Monadelphous Group',  badge: 'M-0101' },
  { name: 'Sarah-Jane Walsh', dob: '1995-01-30', emp: 'Monadelphous Group',  badge: 'M-0102' },
  { name: 'Kevin Okafor',     dob: '1982-06-18', emp: 'Civmec Construction', badge: 'C-0201' },
  { name: 'Patricia Lim',     dob: '1988-09-09', emp: 'Civmec Construction', badge: 'C-0202' },
  { name: 'Ryan Sutherland',  dob: '1992-04-14', emp: 'Sodexo Facilities',   badge: 'SD-0301' },
  { name: 'Amy Chen',         dob: '1986-12-03', emp: 'DT Infrastructure',   badge: 'DT-0401' },
  { name: 'Mark Henderson',   dob: '1975-08-27', emp: 'SCJV Operations',     badge: 'S-0003' },
  { name: 'Tania Brooks',     dob: '1993-02-16', emp: 'Monadelphous Group',  badge: 'M-0103' },
  { name: 'Jake Morrison',    dob: '1980-10-10', emp: 'Civmec Construction', badge: 'C-0203' },
  { name: 'Wendy Fitzgerald', dob: '1987-05-25', emp: 'Sodexo Facilities',   badge: 'SD-0302' },
];
const personIds = {};
for (const p of persons) {
  const empId = empIds[p.emp] || null;
  const id = run(
    `INSERT INTO Person (FullName, DateOfBirth, EmployerID, BadgeNumber, IsActive) VALUES (?,?,?,?,1)`,
    [p.name, p.dob, empId, p.badge]
  );
  personIds[p.name] = id;
  console.log(`   Person ${id}: ${p.name} (${p.emp})`);
}

// ─── helpers for test generation ───────────────────────────────────────────

let testCounter = query("SELECT COALESCE(MAX(CAST(SUBSTR(TestNumber,5) AS INTEGER)), 0) as n FROM AODTest")[0]?.n || 0;
const nextTestNumber = () => {
  testCounter++;
  const y = new Date().getFullYear();
  return `AOD-${y}-${String(testCounter).padStart(3,'0')}`;
};

const logAudit = (action, table, id, desc) => {
  run(`INSERT INTO AuditLog (UserID, Action, RecordType, RecordID, Description) VALUES (NULL,?,?,?,?)`,
    [action, table, id, desc]);
};

// ─── 4. AOD Tests — all test types & outcome paths ────────────────────────

console.log('\n▶  Seeding AOD tests (all types & outcomes)...');

/*
  Test type IDs from schema seed:
    1=PRE, 2=RND, 3=CAU, 4=INC, 5=PA, 6=BLK, 7=DNA
*/

const testScenarios = [
  // ── Pre-employment / Return-to-work ─────────────────────────────────────
  {
    label:           'PRE — Oral Negative + BAC Negative',
    testTypeId:      1,
    personName:      'Michael Carter',
    testDate:        dateOffset(14),
    testTime:        '08:15',
    clinicianName:   'Dr. Rachel Green',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates, Benzodiazepines',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '08:10', bacFinalValue: '', bacFinalTime: '',
    urineUndertaken: false,
    expectedDrug:    'Negative', expectedBAC: 'Negative', status: 'Closed'
  },
  {
    label:           'PRE — Oral Non-Negative + BAC Negative → Pending Lab',
    testTypeId:      1,
    personName:      'Jane Thompson',
    testDate:        dateOffset(12),
    testTime:        '09:00',
    clinicianName:   'Nurse James Harlow',
    oralUndertaken:  true, oralResult: 'Non-Negative',
    oralSubstances:  'THC, Amphetamines',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '08:55', bacFinalValue: '', bacFinalTime: '',
    urineUndertaken: false,
    sampleSentToLab: true, labSentDate: dateOffset(12), labReference: 'LAB-2024-001',
    declaredMedications: 'Nil',
    expectedDrug:    'Pending Confirmation', expectedBAC: 'Negative', status: 'Pending Lab'
  },
  // ── Random ───────────────────────────────────────────────────────────────
  {
    label:           'RND — BAC Positive (Initial 0.052, Final 0.048)',
    testTypeId:      2,
    personName:      'David Nguyen',
    testDate:        dateOffset(10),
    testTime:        '06:30',
    clinicianName:   'Nurse James Harlow',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates, Benzodiazepines',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.052', bacInitialTime: '06:25', bacFinalValue: '0.048', bacFinalTime: '06:50',
    urineUndertaken: false,
    notes:           'Worker presented with smell of alcohol. Escort arranged.',
    expectedDrug:    'Negative', expectedBAC: 'Positive', status: 'Action Required'
  },
  {
    label:           'RND — Oral Negative + No BAC → Closed',
    testTypeId:      2,
    personName:      'Sarah-Jane Walsh',
    testDate:        dateOffset(9),
    testTime:        '07:00',
    clinicianName:   'Paramedic Ann Cole',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine',
    oralControlLines: 'Valid',
    bacUndertaken:   false,
    urineUndertaken: false,
    expectedDrug:    'Negative', expectedBAC: null, status: 'Closed'
  },
  // ── For Cause ────────────────────────────────────────────────────────────
  {
    label:           'CAU — Oral Non-Neg + BAC Positive — dual non-negative',
    testTypeId:      3,
    personName:      'Kevin Okafor',
    testDate:        dateOffset(8),
    testTime:        '14:00',
    clinicianName:   'Dr. Rachel Green',
    oralUndertaken:  true, oralResult: 'Non-Negative',
    oralSubstances:  'THC',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.031', bacInitialTime: '13:55', bacFinalValue: '0.029', bacFinalTime: '14:20',
    urineUndertaken: false,
    sampleSentToLab: true, labSentDate: dateOffset(8), labReference: 'LAB-2024-002',
    notes:           'For cause — observed erratic behaviour on site.',
    expectedDrug:    'Pending Confirmation', expectedBAC: 'Positive', status: 'Pending Lab'
  },
  {
    label:           'CAU — Urine Non-Negative → Pending Lab',
    testTypeId:      3,
    personName:      'Patricia Lim',
    testDate:        dateOffset(7),
    testTime:        '10:30',
    clinicianName:   'Nurse James Harlow',
    oralUndertaken:  false,
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '10:25',
    urineUndertaken: true, urineResult: 'Non-Negative',
    urineSubstances: 'Opiates, Benzodiazepines', urineControlLines: 'Valid', urineSampleId: 'U-20240001',
    sampleSentToLab: true, labSentDate: dateOffset(7), labReference: 'LAB-2024-003',
    declaredMedications: 'Codeine 30mg (prescribed)',
    expectedDrug:    'Pending Confirmation', expectedBAC: null, status: 'Pending Lab'
  },
  // ── Post Incident ─────────────────────────────────────────────────────────
  {
    label:           'INC — Post Incident Negative',
    testTypeId:      4,
    personName:      'Ryan Sutherland',
    testDate:        dateOffset(6),
    testTime:        '11:45',
    clinicianName:   'Paramedic Ann Cole',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates, Benzodiazepines',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '11:40',
    urineUndertaken: false,
    notes:           'Post-incident test following minor forklift collision.',
    expectedDrug:    'Negative', expectedBAC: 'Negative', status: 'Closed'
  },
  {
    label:           'INC — Post Incident BAC Initial >0, awaiting Final',
    testTypeId:      4,
    personName:      'Amy Chen',
    testDate:        dateOffset(5),
    testTime:        '15:00',
    clinicianName:   'Dr. Rachel Green',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.018', bacInitialTime: '14:55', bacFinalValue: '', bacFinalTime: '',
    urineUndertaken: false,
    notes:           'Initial BAC above zero. 20-minute observation in progress at time of entry.',
    expectedDrug:    'Negative', expectedBAC: 'Positive', status: 'Action Required'
  },
  // ── Port Authority ────────────────────────────────────────────────────────
  {
    label:           'PA — Port Authority Negative (oral + BAC)',
    testTypeId:      5,
    personName:      'Mark Henderson',
    testDate:        dateOffset(4),
    testTime:        '05:45',
    clinicianName:   'Nurse James Harlow',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates, Benzodiazepines, Methadone',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '05:40',
    urineUndertaken: false,
    expectedDrug:    'Negative', expectedBAC: 'Negative', status: 'Closed'
  },
  // ── Blanket ───────────────────────────────────────────────────────────────
  {
    label:           'BLK — Blanket Negative (oral only)',
    testTypeId:      6,
    personName:      'Tania Brooks',
    testDate:        dateOffset(3),
    testTime:        '07:30',
    clinicianName:   'Paramedic Ann Cole',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates',
    oralControlLines: 'Valid',
    bacUndertaken:   false,
    urineUndertaken: false,
    expectedDrug:    'Negative', expectedBAC: null, status: 'Closed'
  },
  {
    label:           'BLK — Blanket Oral Non-Negative + Declared Medications',
    testTypeId:      6,
    personName:      'Jake Morrison',
    testDate:        dateOffset(2),
    testTime:        '08:00',
    clinicianName:   'Dr. Rachel Green',
    oralUndertaken:  true, oralResult: 'Non-Negative',
    oralSubstances:  'Benzodiazepines',
    oralControlLines: 'Valid',
    bacUndertaken:   false,
    urineUndertaken: false,
    sampleSentToLab: true, labSentDate: dateOffset(2), labReference: 'LAB-2024-004',
    declaredMedications: 'Valium 5mg (prescribed for anxiety)',
    notes:           'Worker declared Valium script. Lab confirmation required.',
    expectedDrug:    'Pending Confirmation', expectedBAC: null, status: 'Pending Lab'
  },
  // ── Did Not Attend ────────────────────────────────────────────────────────
  {
    label:           'DNA — Did Not Attend',
    testTypeId:      7,
    personName:      'Wendy Fitzgerald',
    testDate:        dateOffset(1),
    testTime:        '06:00',
    clinicianName:   'Nurse James Harlow',
    oralUndertaken:  false,
    bacUndertaken:   false,
    urineUndertaken: false,
    notes:           'Worker did not attend scheduled random test. Follow-up required.',
    expectedDrug:    null, expectedBAC: null, status: 'Closed'
  },
  // ── Today's tests ────────────────────────────────────────────────────────
  {
    label:           'RND — Today — Negative (all clear)',
    testTypeId:      2,
    personName:      'Michael Carter',
    testDate:        dateOffset(0),
    testTime:        '06:45',
    clinicianName:   'Paramedic Ann Cole',
    oralUndertaken:  true, oralResult: 'Negative',
    oralSubstances:  'THC, Amphetamines, Cocaine, Opiates, Benzodiazepines',
    oralControlLines: 'Valid',
    bacUndertaken:   true, bacInitialValue: '0.000', bacInitialTime: '06:40',
    urineUndertaken: false,
    expectedDrug:    'Negative', expectedBAC: 'Negative', status: 'Closed'
  },
];

for (const s of testScenarios) {
  const testNumber = nextTestNumber();
  const personId   = personIds[s.personName];
  const clinicianId = clinicianIds[s.clinicianName];
  const empId      = personId
    ? query(`SELECT EmployerID FROM Person WHERE PersonID=?`, [personId])[0]?.EmployerID
    : null;

  const effectiveBAC = (s.bacFinalValue && s.bacFinalValue !== '')
    ? parseFloat(s.bacFinalValue)
    : (s.bacInitialValue ? parseFloat(s.bacInitialValue) : 0);

  const finalBACOutcome  = s.bacUndertaken ? (effectiveBAC > 0 ? 'Positive' : 'Negative') : null;
  const drugResult       = s.oralResult === 'Non-Negative' || s.urineResult === 'Non-Negative' ? 'Non-Negative' : (s.oralResult || s.urineResult || null);
  const finalDrugOutcome = drugResult === 'Non-Negative' ? 'Pending Confirmation' : (drugResult === 'Negative' ? 'Negative' : null);
  const isNonNeg   = (effectiveBAC > 0 || drugResult === 'Non-Negative') ? 1 : 0;
  const isPending  = drugResult === 'Non-Negative' ? 1 : 0;
  const rft        = s.oralResult === 'Non-Negative' || s.urineResult === 'Non-Negative' ? 1 : 0;

  const testId = run(`
    INSERT INTO AODTest (
      TestNumber, TestDate, TestTime, PersonID, TestTypeID, ClinicianID,
      OralUndertaken, OralResult, OralSubstances, OralControlLines,
      BACUndertaken, BACInitialValue, BACInitialTime, BACFinalValue, BACFinalTime, BACResult, BACDeviceID,
      UrineUndertaken, UrineResult, UrineSampleID, UrineSubstances, UrineControlLines,
      RFT, SampleSentToLab, LabSentDate, LabReference,
      DeclaredMedications, FinalBACOutcome, FinalDrugOutcome, TestStatus, IsPending, IsNonNegative,
      Notes, CreatedBy
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    testNumber, s.testDate, s.testTime, personId ?? null, s.testTypeId, clinicianId ?? null,
    s.oralUndertaken ? 1 : 0, s.oralResult ?? null, s.oralSubstances ?? null, s.oralControlLines ?? null,
    s.bacUndertaken ? 1 : 0, s.bacInitialValue ?? null, s.bacInitialTime ?? null,
    s.bacFinalValue || null, s.bacFinalTime || null,
    effectiveBAC > 0 ? 'Positive' : (s.bacUndertaken ? 'Negative' : null), null,
    s.urineUndertaken ? 1 : 0, s.urineResult ?? null, s.urineSampleId ?? null,
    s.urineSubstances ?? null, s.urineControlLines ?? null,
    rft, s.sampleSentToLab ? 1 : 0, s.labSentDate ?? null, s.labReference ?? null,
    s.declaredMedications ?? null,
    finalBACOutcome, finalDrugOutcome, s.status, isPending, isNonNeg,
    s.notes ?? null, null
  ]);

  if (isNonNeg) {
    const substances = [];
    if (effectiveBAC > 0) substances.push(`Alcohol (BAC: ${effectiveBAC.toFixed(3)})`);
    if (s.oralResult === 'Non-Negative') substances.push('Drug (Oral Fluid) - Non-Negative');
    if (s.urineResult === 'Non-Negative') substances.push('Drug (Urine) - Non-Negative');
    run(`INSERT INTO NonNegativeRecord (TestID, DetectedSubstances, TypeOfTest, Status) VALUES (?,?,?,'Open')`,
      [testId, substances.join(', '), effectiveBAC > 0 ? 'BAC' : 'Oral']);
  }
  if (isPending) {
    run(`INSERT INTO PendingResult (TestID, LabReference, Status) VALUES (?,?,'Awaiting')`,
      [testId, s.labReference ?? null]);
  }
  if (effectiveBAC > 0 && s.bacUndertaken) {
    run(`INSERT INTO PositiveBACRecord (TestID, MeasuredBAC, FinalBACOutcome, Status) VALUES (?,?,?,'Open')`,
      [testId, effectiveBAC, finalBACOutcome]);
  }

  logAudit('CREATE', 'AODTest', testId, `SEED: ${testNumber} - ${s.label}`);
  console.log(`   Test ${testNumber} (ID ${testId}): ${s.label}`);
}

// ─── 5. Patient Events ────────────────────────────────────────────────────

console.log('\n▶  Seeding patient events...');
const clinNames = Object.keys(clinicianIds);
const patientEvents = [
  { personName: 'Michael Carter',   date: dateOffset(0),  time: '07:30', wrNwr: 'WR',         injuryType: 'Laceration/Cut',    bodyLocation: 'Hand',         classification: 'First Aid',       referral: 'Self care',         drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Small laceration to right palm from sheet metal edge.' },
  { personName: 'David Nguyen',     date: dateOffset(0),  time: '09:15', wrNwr: 'WR Review',  injuryType: 'Sprain/Strain',     bodyLocation: 'Back - Lower', classification: 'WR Review',       referral: 'GP',                drConsult: true,  rtwPlan: 'Modified Duties',       comment: 'Review of ongoing lower back strain. Cleared for modified duties.' },
  { personName: 'Patricia Lim',     date: dateOffset(1),  time: '14:00', wrNwr: 'NWR',        injuryType: 'Illness',           bodyLocation: 'Other',        classification: 'Assessment Only', referral: 'Self care',         drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Presenting with headache and nausea. Not work related.' },
  { personName: 'Tania Brooks',     date: dateOffset(1),  time: '08:45', wrNwr: 'WR',         injuryType: 'Eye Injury',        bodyLocation: 'Eye',          classification: 'First Aid',       referral: 'ED',                drConsult: true,  rtwPlan: 'Off Work - Medical Certificate', comment: 'Foreign body in right eye. Flushed on site, referred to ED.' },
  { personName: 'Kevin Okafor',     date: dateOffset(2),  time: '11:00', wrNwr: 'NWR Review', injuryType: 'Sprain/Strain',     bodyLocation: 'Knee',         classification: 'NWR Review',      referral: 'Specialist',        drConsult: true,  rtwPlan: 'Restricted Duties',     comment: 'Review of right knee injury sustained outside of work.' },
  { personName: 'Jane Thompson',    date: dateOffset(2),  time: '13:30', wrNwr: 'WR',         injuryType: 'Burn',              bodyLocation: 'Forearm',      classification: 'First Aid',       referral: 'Return to work',    drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Minor steam burn to right forearm. Dressed on site.' },
  { personName: 'Ryan Sutherland',  date: dateOffset(3),  time: '06:00', wrNwr: 'Camp',       injuryType: 'Illness',           bodyLocation: 'Other',        classification: 'First Aid',       referral: 'Self care',         drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Camp presentation — upset stomach, possibly dietary. No WR link.' },
  { personName: 'Amy Chen',         date: dateOffset(3),  time: '10:00', wrNwr: 'WR',         injuryType: 'Bruise/Contusion',  bodyLocation: 'Shoulder',     classification: 'Assessment Only', referral: 'Review',            drConsult: false, rtwPlan: 'Pending Medical Review', comment: 'Shoulder struck by swinging door. Monitoring over next 24hr.' },
  { personName: 'Mark Henderson',   date: dateOffset(4),  time: '15:00', wrNwr: 'NWR',        injuryType: 'Mental Health',     bodyLocation: 'Other',        classification: 'Assessment Only', referral: 'GP',                drConsult: true,  rtwPlan: 'Graduated Return to Work', comment: 'Worker presenting with anxiety. Referred to GP for management plan.' },
  { personName: 'Wendy Fitzgerald', date: dateOffset(4),  time: '07:00', wrNwr: 'WR',         injuryType: 'Heat Related',      bodyLocation: 'Multiple',     classification: 'First Aid',       referral: 'Return to work',    drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Heat exhaustion during afternoon shift. Cooled, hydrated, recovered.' },
  { personName: 'Jake Morrison',    date: dateOffset(5),  time: '09:30', wrNwr: 'Camp Review',injuryType: 'Skin Irritation/Rash', bodyLocation: 'Chest',      classification: 'First Aid',       referral: 'GP',                drConsult: false, rtwPlan: 'Return to Full Duties', comment: 'Rash across chest. Camp review — possibly contact dermatitis.' },
  { personName: 'Sarah-Jane Walsh', date: dateOffset(5),  time: '12:00', wrNwr: 'WR',         injuryType: 'Fracture',          bodyLocation: 'Finger',       classification: 'First Aid',       referral: 'ED',                drConsult: true,  rtwPlan: 'Off Work - Medical Certificate', comment: 'Suspected fracture right index finger. Splinted and transported to ED.', endOfWeekTracker: true },
];

for (const e of patientEvents) {
  const personId = personIds[e.personName] || null;
  const clinicianId = clinicianIds[randomItem(clinNames)] || null;
  const id = run(`
    INSERT INTO PatientEvent
      (EventDate, EventTime, PersonID, PatientName, Workgroup, WrNwr, BodyLocation, InjuryType,
       Classification, RtwPlan, DrConsult, Referral, Comment, EndOfWeekTracker, ClinicianID)
    VALUES (?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?)
  `, [
    e.date, e.time, personId, e.personName, e.wrNwr,
    e.bodyLocation, e.injuryType, e.classification, e.rtwPlan,
    e.drConsult ? 1 : 0, e.referral, e.comment,
    e.endOfWeekTracker ? 1 : 0, clinicianId
  ]);
  console.log(`   Event ${id}: ${e.personName} — ${e.wrNwr} — ${e.injuryType}`);
}

// ─── 6. Training Records ──────────────────────────────────────────────────

console.log('\n▶  Seeding training records...');
const trainingRecords = [
  { clinician: 'Dr. Rachel Green',   date: dateOffset(90),  type: 'Course',     title: 'Occupational Medicine Update',           category: 'Clinical Practice',           hours: 8,  expiry: null },
  { clinician: 'Dr. Rachel Green',   date: dateOffset(60),  type: 'CPD',        title: 'Drug & Alcohol Testing Legislation 2024', category: 'Professional Development',     hours: 4,  expiry: null },
  { clinician: 'Dr. Rachel Green',   date: dateOffset(30),  type: 'Competency', title: 'Oral Fluid Collection (AS/NZS 4760)',     category: 'Clinical Practice',           hours: 2,  expiry: dateOffset(-365) },
  { clinician: 'Nurse James Harlow', date: dateOffset(120), type: 'Course',     title: 'Certificate III First Aid Renewal',       category: 'Education Activity',          hours: 6,  expiry: dateOffset(-730) },
  { clinician: 'Nurse James Harlow', date: dateOffset(45),  type: 'Drill',      title: 'Mass Casualty Incident Drill',            category: 'Clinical Practice',           hours: 3,  expiry: null },
  { clinician: 'Nurse James Harlow', date: dateOffset(10),  type: 'CPD',        title: 'Medication Management Refresher',         category: 'Consultation & Collaboration', hours: 2, expiry: null },
  { clinician: 'Paramedic Ann Cole', date: dateOffset(180), type: 'Competency', title: 'Urine Drug Screen Collection (AS/NZS 4308)', category: 'Clinical Practice',        hours: 2,  expiry: dateOffset(-365) },
  { clinician: 'Paramedic Ann Cole', date: dateOffset(75),  type: 'Course',     title: 'Advanced Trauma Life Support (ATLS)',    category: 'Education Activity',          hours: 16, expiry: dateOffset(-1095) },
  { clinician: 'Paramedic Ann Cole', date: dateOffset(20),  type: 'CPD',        title: 'Site Emergency Response Planning',       category: 'Leadership & Management',      hours: 4,  expiry: null },
];

for (const t of trainingRecords) {
  const clinicianId = clinicianIds[t.clinician] || null;
  const id = run(`
    INSERT INTO TrainingRecord
      (ClinicianID, TrainingDate, TrainingType, Title, Category, Hours, ExpiryDate, Passed)
    VALUES (?,?,?,?,?,?,?,1)
  `, [clinicianId, t.date, t.type, t.title, t.category, t.hours, t.expiry ?? null]);
  console.log(`   Training ${id}: ${t.clinician} — ${t.title}`);
}

// ─── 7. Scheduled Tests ───────────────────────────────────────────────────

console.log('\n▶  Seeding scheduled tests...');
const scheduledTests = [
  { personName: 'Michael Carter',   date: dateOffset(-1), time: '07:00', testTypeId: 2, notes: 'Random selection - next shift' },
  { personName: 'Kevin Okafor',     date: dateOffset(-2), time: '06:30', testTypeId: 1, notes: 'Return to work medical clearance' },
  { personName: 'Sarah-Jane Walsh', date: dateOffset(-3), time: '08:00', testTypeId: 5, notes: 'Port authority scheduled test' },
  { personName: 'Tania Brooks',     date: dateOffset(-1), time: '07:30', testTypeId: 6, notes: 'Site-wide blanket test' },
];
for (const s of scheduledTests) {
  const personId = personIds[s.personName] || null;
  const id = run(`
    INSERT INTO ScheduledTest (PersonID, ScheduledDate, ScheduledTime, TestTypeID, Status, Notes)
    VALUES (?,?,?,?,?,?)
  `, [personId, s.date, s.time, s.testTypeId, 'Scheduled', s.notes]);
  console.log(`   Scheduled ${id}: ${s.personName} on ${s.date}`);
}

// ─── 8. Random Test List (PDF-import simulation) ──────────────────────────

console.log('\n▶  Seeding random test list...');
const listId = run(`
  INSERT INTO RandomTestList (ListDate, Shift, SourceFileName, ImportedBy, DefaultEmployerID, TestTypeID)
  VALUES (?,?,?,?,?,?)
`, [dateOffset(0), 'Day', 'random_list_seed.pdf', null, empIds['Monadelphous Group'], 2]);

const randomEntries = [
  { empNum: 'M-0101', name: 'David Nguyen',     dept: 'Civil',      status: 'Pending' },
  { empNum: 'M-0102', name: 'Sarah-Jane Walsh', dept: 'Structural', status: 'Pending' },
  { empNum: 'M-0103', name: 'Tania Brooks',     dept: 'Civil',      status: 'Pending' },
  { empNum: 'C-0201', name: 'Kevin Okafor',     dept: 'Mechanical', status: 'Pending' },
  { empNum: 'C-0202', name: 'Patricia Lim',     dept: 'Mechanical', status: 'Pending' },
];

for (const e of randomEntries) {
  const matchedPersonId = personIds[e.name] || null;
  const id = run(`
    INSERT INTO RandomTestEntry
      (ListID, EmployeeNumber, EmployeeName, Department, Status, MatchedPersonID)
    VALUES (?,?,?,?,?,?)
  `, [listId, e.empNum, e.name, e.dept, e.status, matchedPersonId]);
  console.log(`   RandomEntry ${id}: ${e.name} (${e.dept})`);
}

// ─── Save ──────────────────────────────────────────────────────────────────

save();
console.log('\n✅ Seed complete. Database saved.\n');
console.log('Summary:');
console.log(`  Employers:       ${Object.keys(empIds).length}`);
console.log(`  Clinicians:      ${Object.keys(clinicianIds).length}`);
console.log(`  Persons:         ${Object.keys(personIds).length}`);
console.log(`  AOD Tests:       ${testScenarios.length}`);
console.log(`  Patient Events:  ${patientEvents.length}`);
console.log(`  Training Records:${trainingRecords.length}`);
console.log(`  Scheduled Tests: ${scheduledTests.length}`);
console.log(`  Random Entries:  ${randomEntries.length}`);
