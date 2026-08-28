import XLSX from 'xlsx';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'database', 'aod_tracker.db');
const EXCEL_PATH = 'C:/Users/agill/OneDrive/AOD tracker/AOD Tracker V2(1).xlsx';

// Backup existing database
if (existsSync(DB_PATH)) {
  const backupPath = DB_PATH.replace('.db', `_backup_${Date.now()}.db`);
  copyFileSync(DB_PATH, backupPath);
  console.log(`Backed up existing database to: ${backupPath}`);
}

// Initialize database
const SQL = await initSqlJs();
let db;
if (existsSync(DB_PATH)) {
  const fileBuffer = readFileSync(DB_PATH);
  db = new SQL.Database(fileBuffer);
} else {
  console.error('Database not found. Run the server first to create schema.');
  process.exit(1);
}

function saveDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  try {
    db.run(sql, params);
    return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
  } catch (e) {
    console.error('SQL Error:', e.message, '\nSQL:', sql);
    throw e;
  }
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  } catch (e) {
    console.error('Query Error:', e.message);
    return [];
  }
}

function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

// Excel date conversion
function excelDateToISO(serial) {
  if (!serial || serial === 0 || typeof serial !== 'number') return null;
  if (serial < 1 || serial > 100000) return null; // Invalid range
  try {
    const utc_days = Math.floor(serial - 25569);
    const date = new Date(utc_days * 86400 * 1000);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function excelTimeToHHMM(fraction) {
  if (!fraction || fraction === 0) return null;
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Read Excel
console.log('Reading Excel file...');
const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['AOD Arary Link'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(`Found ${data.length} rows in AOD Arary Link`);

// Clear existing test data (optional - comment out to append)
console.log('Clearing existing test data...');
db.run('DELETE FROM AODTest');
db.run('DELETE FROM Person');
db.run('DELETE FROM Employer');
db.run('DELETE FROM Clinician');

// Track unique entities
const employers = new Map();
const clinicians = new Map();
const persons = new Map();

// First pass: collect unique employers and clinicians
console.log('Collecting unique employers and clinicians...');
for (const row of data) {
  if (!row || row.length < 11) continue;
  
  const employerName = String(row[5] || '').trim();
  const clinicianName = String(row[10] || '').trim();
  
  if (employerName && employerName !== '0' && !employers.has(employerName)) {
    employers.set(employerName, null);
  }
  if (clinicianName && clinicianName !== '0' && !clinicians.has(clinicianName)) {
    clinicians.set(clinicianName, null);
  }
}

// Insert employers
console.log(`Inserting ${employers.size} employers...`);
for (const [name] of employers) {
  const category = name.toLowerCase().includes('saipem') || 
                   name.toLowerCase().includes('clough') || 
                   name.toLowerCase().includes('scjv') ? 'SCJV Staff' : 'Contractor';
  const result = run(
    'INSERT INTO Employer (CompanyName, Category, IsActive) VALUES (?, ?, 1)',
    [name, category]
  );
  employers.set(name, result.lastInsertRowid);
}

// Insert clinicians
console.log(`Inserting ${clinicians.size} clinicians...`);
for (const [name] of clinicians) {
  const result = run(
    'INSERT INTO Clinician (Name, IsActive) VALUES (?, 1)',
    [name]
  );
  clinicians.set(name, result.lastInsertRowid);
}

// Second pass: insert persons and tests
console.log('Importing test records...');
let imported = 0;
let skipped = 0;

for (const row of data) {
  if (!row || row.length < 11) {
    skipped++;
    continue;
  }
  
  const dateSerial = row[0];
  const timeSerial = row[1];
  const fullName = String(row[2] || '').trim();
  const dobSerial = row[3];
  const gender = String(row[4] || '').trim();
  const employerName = String(row[5] || '').trim();
  const category = String(row[6] || '').trim(); // Contractor/SCJV Staff
  const testType = String(row[7] || '').trim();
  const oralResult = String(row[8] || '').trim();
  const bac = parseFloat(row[9]) || 0;
  const clinicianName = String(row[10] || '').trim();
  
  // Skip invalid rows
  if (!fullName || fullName === '0' || !dateSerial) {
    skipped++;
    continue;
  }
  
  const testDate = excelDateToISO(dateSerial);
  const testTime = excelTimeToHHMM(timeSerial);
  const dob = excelDateToISO(dobSerial);
  
  if (!testDate) {
    skipped++;
    continue;
  }
  
  // Get or create person
  const personKey = `${fullName}|${dob || ''}`;
  let personId = persons.get(personKey);
  
  if (!personId) {
    const employerId = employers.get(employerName) || null;
    // Map gender to SexID (1=Male, 2=Female, 3=Other)
    let sexId = null;
    if (gender === 'Male') sexId = 1;
    else if (gender === 'Female') sexId = 2;
    else if (gender && gender !== '0') sexId = 3;
    
    const result = run(
      'INSERT INTO Person (FullName, DateOfBirth, SexID, EmployerID, IsActive) VALUES (?, ?, ?, ?, 1)',
      [fullName, dob, sexId, employerId]
    );
    personId = result.lastInsertRowid;
    persons.set(personKey, personId);
  }
  
  // Get IDs
  const employerId = employers.get(employerName) || null;
  const clinicianId = clinicians.get(clinicianName) || null;
  
  // Determine test status and results
  let testStatus = 'Completed';
  let drugFinalResult = oralResult;
  let alcoholResult = bac > 0 ? 'Positive' : 'Negative';
  
  if (oralResult === 'Non-Negative') {
    testStatus = 'Pending Lab';
    drugFinalResult = 'Non-Negative - Pending Lab';
  } else if (testType === 'Did Not Attend') {
    testStatus = 'DNA';
    drugFinalResult = 'N/A';
    alcoholResult = 'N/A';
  }
  
  // Map test type to TestTypeID
  const testTypeMap = {
    'Random': 2,
    'Pre-Employment': 1,
    'Pre-Employment/RTW': 1,
    'Pre Employment': 1,
    'For Cause': 3,
    'Cause': 3,
    'Post Incident': 4,
    'Port Authority': 5,
    'Blanket': 6,
    'Did Not Attend': 7
  };
  const testTypeId = testTypeMap[testType] || 2; // Default to Random
  
  // Generate test number
  const testNumber = `AOD-${testDate.replace(/-/g, '')}-${String(imported + 1).padStart(5, '0')}`;
  
  // Insert test
  run(`
    INSERT INTO AODTest (
      TestNumber, PersonID, ClinicianID, TestDate, TestTime, TestTypeID,
      OralUndertaken, OralResult, BACUndertaken, BACInitialValue, BACResult,
      TestStatus, IsPending, IsNonNegative, Notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    testNumber, personId, clinicianId, testDate, testTime, testTypeId,
    1, oralResult, bac > 0 ? 1 : 0, bac, alcoholResult,
    testStatus, testStatus === 'Pending Lab' ? 1 : 0, oralResult === 'Non-Negative' ? 1 : 0,
    `Imported from Excel. Category: ${category}`
  ]);
  
  imported++;
  
  if (imported % 5000 === 0) {
    console.log(`  Imported ${imported} records...`);
    saveDb(); // Save periodically
  }
}

// Final save
saveDb();

console.log('\n=== Import Complete ===');
console.log(`Employers: ${employers.size}`);
console.log(`Clinicians: ${clinicians.size}`);
console.log(`Persons: ${persons.size}`);
console.log(`Tests imported: ${imported}`);
console.log(`Rows skipped: ${skipped}`);

// Verify
const testCount = queryOne('SELECT COUNT(*) as count FROM AODTest');
const personCount = queryOne('SELECT COUNT(*) as count FROM Person');
console.log(`\nDatabase now has:`);
console.log(`  ${testCount?.count || 0} tests`);
console.log(`  ${personCount?.count || 0} persons`);
