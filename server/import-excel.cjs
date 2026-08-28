/**
 * Import AOD Tracker V2 Excel data into the live SQLite database.
 * Run with:  node server/import-excel.js [path-to-xlsx]
 *
 * Dedup logic:
 *   Person  — FullName + DOB + EmployerID  → reuse existing or create new
 *   AODTest — PersonID + TestDate           → skip if already exists
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const XLSX  = require('xlsx');
const Database = require('better-sqlite3');

// ── Resolve paths ─────────────────────────────────────────────────────────────
const xlsxPath = process.argv[2]
  || path.join(__dirname, '..', 'AOD Tracker V2(1).xlsx');

const dbPath = process.env.DB_PATH
  || path.join(__dirname, 'database', 'aod_tracker.db');

if (!fs.existsSync(xlsxPath)) {
  console.error('Excel file not found:', xlsxPath);
  process.exit(1);
}
if (!fs.existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

console.log('Excel :', xlsxPath);
console.log('DB    :', dbPath);

// ── Open DB ───────────────────────────────────────────────────────────────────
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert Excel OLE serial date → 'YYYY-MM-DD' */
function oleToDate(n) {
  if (!n || typeof n !== 'number') return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

/** Convert Excel fractional time → 'HH:MM' */
function oleToTime(n) {
  if (!n || typeof n !== 'number') return null;
  const totalMin = Math.round(n * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/** Normalise a cell value — treat 0, '0', 'N/A', '' as null/false */
function val(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '0' || s === '' || s === 'N/A') return null;
  return s;
}

/** Map Excel test type strings → TestType.Code in our DB */
const TEST_TYPE_MAP = {
  'random'              : 'RND',
  'port authority'      : 'PA',
  'pre-employment / rtw': 'PRE',
  'pre-employment/rtw'  : 'PRE',
  'pre employment'      : 'PRE',
  'post incident'       : 'INC',
  'cause'               : 'CAU',
  'for cause'           : 'CAU',
  'blanket'             : 'BLK',
  'did not attend'      : 'DNA',
};

/** Map Excel oral result strings → canonical values */
function mapOralResult(s) {
  if (!s) return null;
  const l = s.trim().toLowerCase();
  if (l === 'negative') return 'Negative';
  if (l === 'non-negative' || l === 'non- negative') return 'Non-Negative';
  if (l === 'refused') return 'Refused';
  if (l === 'unable to test') return 'Unable to Test';
  if (l === 'did not attend' || l === 'pos bac.') return null; // not a drug result
  return null;
}

/** Map Excel urine result */
function mapUrineResult(s) {
  if (!s) return null;
  const l = s.trim().toLowerCase();
  if (l === 'negative') return 'Negative';
  if (l === 'non-negative' || l === 'non- negative') return 'Non-Negative';
  if (l === 'refused') return 'Refused';
  return null;
}

/** Map confirmatory result */
function mapConfirmatory(s) {
  if (!s) return null;
  const l = s.trim().toLowerCase();
  if (l === 'negative') return 'Negative';
  if (l.includes('positive') || l.includes('confirmed')) return 'Substance Confirmed';
  if (l.includes('pending')) return 'Pending';
  return null;
}

// ── Load lookup tables ────────────────────────────────────────────────────────
const testTypeRows = db.prepare('SELECT TestTypeID, Code FROM TestType').all();
const testTypeByCode = {};
for (const r of testTypeRows) testTypeByCode[r.Code] = r.TestTypeID;

// ── Cached lookups to avoid repeated queries ──────────────────────────────────
const employerCache = {};   // name → EmployerID
const personCache   = {};   // "Name|DOB|EmployerID" → PersonID
const clinicianCache = {};  // name → ClinicianID

function getOrCreateEmployer(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (employerCache[key] !== undefined) return employerCache[key];
  const existing = db.prepare('SELECT EmployerID FROM Employer WHERE LOWER(CompanyName) = ?').get(key);
  if (existing) { employerCache[key] = existing.EmployerID; return existing.EmployerID; }
  // Determine category
  const category = key.includes('scjv') || key === 'town & country' ? 'SCJV' : 'Contractor';
  const r = db.prepare('INSERT INTO Employer (CompanyName, Category, IsActive) VALUES (?,?,1)').run(name.trim(), category);
  employerCache[key] = r.lastInsertRowid;
  return r.lastInsertRowid;
}

function getOrCreatePerson(fullName, dob, employerId) {
  const dobStr = dob || null;
  const empId  = employerId || null;
  const key = `${fullName.trim().toLowerCase()}|${dobStr}|${empId}`;
  if (personCache[key] !== undefined) return personCache[key];

  // Try to find existing by name + DOB + employer
  let existing;
  if (dobStr && empId) {
    existing = db.prepare(`
      SELECT PersonID FROM Person
      WHERE LOWER(TRIM(FullName)) = ? AND DateOfBirth = ? AND EmployerID = ?
    `).get(fullName.trim().toLowerCase(), dobStr, empId);
  } else if (dobStr) {
    existing = db.prepare(`
      SELECT PersonID FROM Person
      WHERE LOWER(TRIM(FullName)) = ? AND DateOfBirth = ?
    `).get(fullName.trim().toLowerCase(), dobStr);
  } else {
    existing = db.prepare(`
      SELECT PersonID FROM Person WHERE LOWER(TRIM(FullName)) = ?
    `).get(fullName.trim().toLowerCase());
  }

  if (existing) { personCache[key] = existing.PersonID; return existing.PersonID; }

  // Map sex
  const r = db.prepare(`
    INSERT INTO Person (FullName, DateOfBirth, EmployerID, IsActive)
    VALUES (?,?,?,1)
  `).run(fullName.trim(), dobStr, empId);
  personCache[key] = r.lastInsertRowid;
  return r.lastInsertRowid;
}

function getOrCreateClinician(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (clinicianCache[key] !== undefined) return clinicianCache[key];
  const existing = db.prepare('SELECT ClinicianID FROM Clinician WHERE LOWER(TRIM(Name)) = ?').get(key);
  if (existing) { clinicianCache[key] = existing.ClinicianID; return existing.ClinicianID; }
  const r = db.prepare('INSERT INTO Clinician (Name, IsActive) VALUES (?,1)').run(name.trim());
  clinicianCache[key] = r.lastInsertRowid;
  return r.lastInsertRowid;
}

// Prepared statements
const existingTestStmt = db.prepare(`
  SELECT TestID FROM AODTest WHERE PersonID = ? AND TestDate = ?
`);

const insertTest = db.prepare(`
  INSERT INTO AODTest (
    TestNumber, TestDate, TestTime, PersonID, TestTypeID, ClinicianID,
    OralUndertaken, OralResult,
    BACUndertaken, BACInitialValue, BACResult,
    UrineUndertaken, UrineResult,
    SampleSentToLab, ConfirmatoryResult,
    FinalBACOutcome, FinalDrugOutcome, OverallAODResult,
    TestStatus, IsPending, IsNonNegative,
    Notes, CreatedAt, UpdatedAt
  ) VALUES (
    ?,?,?,?,?,?,
    ?,?,
    ?,?,?,
    ?,?,
    ?,?,
    ?,?,?,
    ?,?,?,
    ?,?,?
  )
`);

const insertNonNeg = db.prepare(`
  INSERT INTO NonNegativeRecord (TestID, DetectedSubstances, TypeOfTest, Status)
  VALUES (?,?,?,'Closed')
`);

const insertPosBac = db.prepare(`
  INSERT INTO PositiveBACRecord (TestID, MeasuredBAC, FinalBACOutcome, Status)
  VALUES (?,?,?,'Closed')
`);

let testCounter = db.prepare("SELECT COUNT(*) as c FROM AODTest").get().c;
function generateTestNumber() {
  testCounter++;
  return `IMP-${String(testCounter).padStart(5,'0')}`;
}

// ── Read Excel ────────────────────────────────────────────────────────────────
console.log('\nReading Excel...');
const wb   = XLSX.readFile(xlsxPath);
const ws   = wb.Sheets['AOD_Base'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const headers = rows[0];

console.log(`Found ${rows.length - 1} data rows`);
console.log('Headers:', headers);

// ── Import ────────────────────────────────────────────────────────────────────
let imported = 0, skipped = 0, errors = 0;

const importAll = db.transaction(() => {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    try {
      // 0:Date 1:Time 2:Name 3:DOB 4:Sex 5:Employer 6:WorkerType 7:TestType
      // 8:OralResult 9:BAC 10:Tester 11:UrineUndertaken 12:UrineResult
      // 13:SampleSent 14:ConfirmatoryResult 15:Notes
      // 18:OverrideBACResult 19:OverrideDrugResult 20:FinalBACOutcome 21:FinalDrugOutcome

      const testDate  = oleToDate(r[0]);
      const testTime  = oleToTime(r[1]);
      const name      = val(r[2]);
      const dob       = oleToDate(r[3]);
      const employer  = val(r[5]);
      const typeRaw   = val(r[7]) || '';
      const oralRaw   = val(r[8]);
      const bacRaw    = parseFloat(r[9]) || 0;
      const tester    = val(r[10]);
      const urineUnd  = r[11] == 1 || String(r[11]).toLowerCase() === 'yes';
      const urineRaw  = val(r[12]);
      const sampleSnt = r[13] == 1 || String(r[13]).toLowerCase() === 'yes';
      const confirRaw = val(r[14]);
      const notes     = val(r[15]);
      const finalBACRaw  = val(r[20]);
      const finalDrugRaw = val(r[21]);

      if (!testDate || !name) { skipped++; continue; }

      // Map types
      const typeCode  = TEST_TYPE_MAP[typeRaw.toLowerCase()] || 'RND';
      const testTypeId = testTypeByCode[typeCode] || testTypeByCode['RND'];

      const oralResult  = mapOralResult(oralRaw);
      const urineResult = urineUnd ? mapUrineResult(urineRaw) : null;
      const confirResult = mapConfirmatory(confirRaw);

      // Determine undertakens
      const oralUndertaken = oralResult !== null ? 1 : 0;
      const bacUndertaken  = bacRaw > 0 || (typeRaw.toLowerCase().includes('bac') || String(r[8]).toLowerCase().includes('pos bac')) ? 1 : (bacRaw === 0 && oralUndertaken === 0 && !urineUnd ? 1 : 0);

      // For DNA rows, minimal test
      const isDNA = typeCode === 'DNA';

      // Lookup / create person
      const employerId  = getOrCreateEmployer(employer);
      const personId    = getOrCreatePerson(name, dob, employerId);
      const clinicianId = getOrCreateClinician(tester);

      // Skip if test already exists for this person+date
      if (existingTestStmt.get(personId, testDate)) { skipped++; continue; }

      // Compute outcomes
      const bacPos = bacRaw > 0;
      const isNonNeg = (oralResult === 'Non-Negative' || urineResult === 'Non-Negative' || bacPos) ? 1 : 0;
      const isPending = (confirResult === 'Pending' || (isNonNeg && !confirResult)) ? 1 : 0;

      let finalBAC  = finalBACRaw  || (bacPos ? 'Positive' : (bacUndertaken ? 'Negative' : null));
      let finalDrug = finalDrugRaw || (oralResult === 'Non-Negative' || urineResult === 'Non-Negative'
        ? (confirResult || 'Pending Confirmation')
        : (oralResult === 'Negative' || urineResult === 'Negative' ? 'Negative' : null));

      // Normalise final outcomes
      if (finalBAC && finalBAC.toLowerCase().includes('negative')) finalBAC = 'Negative';
      if (finalBAC && finalBAC.toLowerCase().includes('positive')) finalBAC = 'Positive';
      if (finalDrug && finalDrug.toLowerCase().includes('negative')) finalDrug = 'Negative';

      let testStatus = 'Closed';
      if (isPending) testStatus = 'Pending Lab';
      else if (isNonNeg && confirResult !== 'Negative') testStatus = 'Review Required';

      // Overall outcome
      let overall = 'Negative';
      if (finalDrug && finalDrug !== 'Negative') overall = finalDrug;
      else if (finalBAC === 'Positive') overall = 'Positive BAC';

      const testNumber = generateTestNumber();
      const createdAt = testDate + ' 00:00:00';

      const result = insertTest.run(
        testNumber, testDate, testTime, personId, testTypeId, clinicianId,
        oralUndertaken, oralResult,
        bacUndertaken ? 1 : 0, bacRaw || null, bacPos ? 'Positive' : (bacUndertaken ? 'Negative' : null),
        urineUnd ? 1 : 0, urineResult,
        sampleSnt ? 1 : 0, confirResult,
        finalBAC, finalDrug, overall,
        testStatus, isPending, isNonNeg,
        notes, createdAt, createdAt
      );
      const testId = result.lastInsertRowid;

      // Create non-negative record
      if (isNonNeg) {
        const substances = [];
        if (bacPos) substances.push(`BAC: ${bacRaw}`);
        if (oralResult === 'Non-Negative') substances.push('Oral Fluid');
        if (urineResult === 'Non-Negative') substances.push('Urine');
        insertNonNeg.run(testId, substances.join(', '), bacPos ? 'BAC' : (oralResult === 'Non-Negative' ? 'Oral' : 'Urine'));
      }

      // Create positive BAC record
      if (bacPos) {
        insertPosBac.run(testId, bacRaw, finalBAC || 'Positive');
      }

      imported++;
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Row ${i} error:`, err.message, '| row:', JSON.stringify(rows[i]?.slice(0, 8)));
    }
  }
});

console.log('\nImporting (inside transaction)...');
importAll();

console.log('\n────────────────────────────────');
console.log(`✓ Imported : ${imported}`);
console.log(`  Skipped  : ${skipped}  (already existed or blank)`);
console.log(`  Errors   : ${errors}`);
console.log('────────────────────────────────');

// Summary counts
const totals = db.prepare("SELECT COUNT(*) as c FROM AODTest").get();
const persons = db.prepare("SELECT COUNT(*) as c FROM Person").get();
const employers = db.prepare("SELECT COUNT(*) as c FROM Employer").get();
const clinicians = db.prepare("SELECT COUNT(*) as c FROM Clinician").get();
console.log(`\nDB now has:`);
console.log(`  Tests     : ${totals.c}`);
console.log(`  Persons   : ${persons.c}`);
console.log(`  Employers : ${employers.c}`);
console.log(`  Clinicians: ${clinicians.c}`);

db.close();
