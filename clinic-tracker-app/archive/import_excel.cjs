/**
 * import_excel.cjs
 * Imports AOD_Base sheet from "AOD Tracker V2(1).xlsx" into the SQLite database.
 *
 * Run: node import_excel.cjs
 * Add --dry-run to preview without writing.
 */

const XLSX    = require('./server/node_modules/xlsx');
const Database = require('./server/node_modules/better-sqlite3');
const path    = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const XLSX_FILE = path.join(__dirname, 'AOD Tracker V2(1).xlsx');
const DB_FILE   = path.join(__dirname, 'server', 'database', 'aod_tracker.db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function excelDateToISO(n) {
  if (!n || typeof n !== 'number') return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().split('T')[0];
}

function excelTimeToHHMM(n) {
  if (!n || typeof n !== 'number') return null;
  const t = n % 1;
  const totalSec = Math.round(t * 86400);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return (s === '0' || s === '' || s.toLowerCase() === 'n/a') ? null : s;
}

function boolVal(v) {
  if (!v) return 0;
  const s = String(v).trim().toLowerCase();
  return (s === 'yes' || s === '1' || s === 'true') ? 1 : 0;
}

// Normalise test type strings to DB IDs
const TEST_TYPE_MAP = {
  'random':                  2,
  'port authority':          5,
  'pre-employment / rtw':    1,
  'pre-employment/rtw':      1,
  'pre employment':          1,
  'pre-employment':          1,
  'post incident':           4,
  'cause':                   3,
  'for cause':               3,
  'did not attend':          7,
  'blanket':                 6,
};

function mapTestType(raw) {
  if (!raw) return null;
  return TEST_TYPE_MAP[String(raw).toLowerCase().trim()] || null;
}

// Worker type: "Saipem" is actually an employer, map to Contractor (2)
function mapWorkerType(raw) {
  if (!raw) return 2;
  const s = String(raw).toLowerCase().trim();
  if (s.includes('staff') || s === 'scjv staff') return 1;
  return 2; // default Contractor
}

// Sex name → ID
const SEX_MAP = { male: 1, female: 2, other: 3, m: 1, f: 2 };
function mapSex(raw) {
  if (!raw) return null;
  return SEX_MAP[String(raw).toLowerCase().trim()] || null;
}

// ── Load Excel ────────────────────────────────────────────────────────────────

console.log('Reading Excel file...');
const wb   = XLSX.readFile(XLSX_FILE);
const ws   = wb.Sheets['AOD_Base'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const dataRows = rows.slice(1).filter(r => r && r[0] && typeof r[0] === 'number');
console.log(`Found ${dataRows.length} data rows.`);

// ── Open DB ───────────────────────────────────────────────────────────────────

const db = new Database(DB_FILE, { readonly: DRY_RUN });

if (!DRY_RUN) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

// ── Lookup caches ─────────────────────────────────────────────────────────────

const employerCache = new Map(); // CompanyName.lower → EmployerID
db.prepare('SELECT EmployerID, CompanyName FROM Employer').all()
  .forEach(r => employerCache.set(r.CompanyName.trim().toLowerCase(), r.EmployerID));

const personCache = new Map();   // "FULLNAME|DOB" → PersonID
db.prepare('SELECT PersonID, FullName, DateOfBirth FROM Person').all()
  .forEach(r => personCache.set(`${r.FullName.trim().toUpperCase()}|${r.DateOfBirth}`, r.PersonID));

const clinicianCache = new Map(); // name.lower → ClinicianID
db.prepare('SELECT ClinicianID, Name FROM Clinician').all()
  .forEach(r => clinicianCache.set(r.Name.trim().toLowerCase(), r.ClinicianID));

// Test dedup: "PersonID|Date|Time|TypeID"
const testDedupSet = new Set();
db.prepare('SELECT PersonID, TestDate, TestTime, TestTypeID FROM AODTest').all()
  .forEach(r => testDedupSet.add(`${r.PersonID}|${r.TestDate}|${r.TestTime||''}|${r.TestTypeID}`));

// ── Prepared statements ───────────────────────────────────────────────────────

const insertEmployer = db.prepare(
  'INSERT INTO Employer (CompanyName, Category) VALUES (?, ?) RETURNING EmployerID'
);
const insertClinician = db.prepare(
  'INSERT INTO Clinician (Name, IsActive) VALUES (?, 1) RETURNING ClinicianID'
);
const insertPerson = db.prepare(`
  INSERT INTO Person (FullName, DateOfBirth, SexID, EmployerID, WorkerTypeID, IsActive)
  VALUES (?, ?, ?, ?, ?, 1)
  RETURNING PersonID
`);
const insertTest = db.prepare(`
  INSERT INTO AODTest (
    TestNumber, TestDate, TestTime, PersonID, TestTypeID, ClinicianID,
    OralUndertaken, OralResult,
    BACUndertaken, BACValue, BACResult,
    UrineUndertaken, UrineResult,
    SampleSentToLab, ConfirmatoryResult,
    OverrideBACResult, OverrideDrugResult,
    FinalBACOutcome, FinalDrugOutcome,
    IsNonNegative, IsPending, Notes,
    TestStatus
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?,
    'Closed'
  )
`);

// ── Stats ─────────────────────────────────────────────────────────────────────

let stats = {
  employersCreated: 0,
  cliniciansCreated: 0,
  personsCreated: 0,
  testsInserted: 0,
  testsDuplicate: 0,
  testsSkippedNoType: 0,
  testsSkippedNoDate: 0,
};

// ── Import ────────────────────────────────────────────────────────────────────

function getOrCreateEmployer(rawName) {
  if (!rawName) return null;
  const key = rawName.trim().toLowerCase();
  if (employerCache.has(key)) return employerCache.get(key);
  if (DRY_RUN) { employerCache.set(key, -1); return -1; }
  const row = insertEmployer.get(rawName.trim(), 'Contractor');
  employerCache.set(key, row.EmployerID);
  stats.employersCreated++;
  return row.EmployerID;
}

function getOrCreateClinician(rawName) {
  if (!rawName) return null;
  const key = rawName.trim().toLowerCase();
  if (clinicianCache.has(key)) return clinicianCache.get(key);
  if (DRY_RUN) { clinicianCache.set(key, -1); return -1; }
  const row = insertClinician.get(rawName.trim());
  clinicianCache.set(key, row.ClinicianID);
  stats.cliniciansCreated++;
  return row.ClinicianID;
}

function getOrCreatePerson(fullName, dob, sexID, employerID, workerTypeID) {
  const key = `${fullName.trim().toUpperCase()}|${dob}`;
  if (personCache.has(key)) return personCache.get(key);
  if (DRY_RUN) { personCache.set(key, -1); return -1; }
  const row = insertPerson.get(fullName.trim(), dob, sexID, employerID, workerTypeID);
  personCache.set(key, row.PersonID);
  stats.personsCreated++;
  return row.PersonID;
}

let testNumber = db.prepare('SELECT MAX(CAST(TestNumber AS INTEGER)) as m FROM AODTest').get().m || 0;

const importAll = db.transaction(() => {
  for (const r of dataRows) {
    // Date / time
    const testDate = excelDateToISO(r[0]);
    if (!testDate) { stats.testsSkippedNoDate++; continue; }
    const testTime = excelTimeToHHMM(r[1]);

    // Test type
    const testTypeID = mapTestType(r[7]);
    if (!testTypeID) { stats.testsSkippedNoType++; continue; }

    // Person
    const rawName = clean(r[2]);
    if (!rawName) { stats.testsSkippedNoDate++; continue; }

    const dob = excelDateToISO(r[3]);
    const sexID = mapSex(r[4]);
    const employerID = getOrCreateEmployer(r[5]);
    const workerTypeID = mapWorkerType(r[6]);
    const personID = getOrCreatePerson(rawName, dob || '1900-01-01', sexID, employerID, workerTypeID);

    // Dedup test
    const dedupKey = `${personID}|${testDate}|${testTime||''}|${testTypeID}`;
    if (testDedupSet.has(dedupKey)) { stats.testsDuplicate++; continue; }
    testDedupSet.add(dedupKey);

    // Fields
    const oralResult   = clean(r[8]);
    const bac          = (typeof r[9] === 'number' && r[9] > 0) ? r[9] : null;
    const clinicianID  = getOrCreateClinician(clean(r[10]));
    const urineYN      = boolVal(r[11]);
    const urineResult  = clean(r[12]);
    const sampleSent   = boolVal(r[13]);
    const confirmatory = clean(r[14]);
    const notes        = clean(r[15]);
    const overrideBAC  = clean(r[18]);
    const overrideDrug = clean(r[19]);
    const finalBAC     = clean(r[20]);
    const finalDrug    = clean(r[21]);

    const isNonNeg = (
      oralResult === 'Non-Negative' || oralResult === 'Non- Negative' ||
      urineResult === 'Non-Negative' || urineResult === 'Non- Negative' ||
      finalDrug === 'Non-Negative' || finalDrug === 'Positive'
    ) ? 1 : 0;

    testNumber++;

    if (!DRY_RUN) {
      insertTest.run(
        String(testNumber).padStart(6, '0'), testDate, testTime, personID, testTypeID, clinicianID,
        oralResult ? 1 : 0, oralResult,
        bac !== null ? 1 : 0, bac, bac !== null ? (bac > 0 ? 'Positive' : 'Negative') : null,
        urineYN, urineResult,
        sampleSent, confirmatory,
        overrideBAC, overrideDrug,
        finalBAC, finalDrug,
        isNonNeg, 0, notes
      );
    }
    stats.testsInserted++;
  }
});

console.log(DRY_RUN ? '[DRY RUN — no data will be written]' : '[LIVE RUN — writing to database]');
console.log('Starting import...');

importAll();

console.log('\n✓ Import complete!');
console.log('  Employers created:  ', stats.employersCreated);
console.log('  Clinicians created: ', stats.cliniciansCreated);
console.log('  Persons created:    ', stats.personsCreated);
console.log('  Tests inserted:     ', stats.testsInserted);
console.log('  Tests skipped (dup):', stats.testsDuplicate);
console.log('  Tests skipped (type):', stats.testsSkippedNoType);
console.log('  Tests skipped (date):', stats.testsSkippedNoDate);

db.close();
