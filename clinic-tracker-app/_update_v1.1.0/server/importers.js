/**
 * importers.js — Idempotent Excel importers for AOD Tracker & Patient Tracker
 *
 * Used by:
 *   - Admin API endpoints (server/index.js)  — file-upload import
 *   - CLI wrapper (server/import-cli.js)      — node import-cli.js aod <file>
 *
 * Design goals:
 *   - SQLite backend (uses the live better-sqlite3 connection via getRawDb()).
 *   - Idempotent: re-running the same file adds only missing rows (dedup).
 *   - Robust to column drift: maps spreadsheet columns by HEADER NAME.
 *   - Schema-drift tolerant: only writes DB columns that actually exist.
 *   - dryRun mode previews counts without writing.
 *
 * Each importer returns a stats object:
 *   { dryRun, totalRows, inserted, duplicates, skipped, errors,
 *     created: { employers, persons, clinicians }, sample, errorSamples }
 */

import XLSX from 'xlsx';
import { getRawDb, dbType } from './db.js';

// ─── Generic helpers ──────────────────────────────────────────────────────────

/** Excel OLE serial date → 'YYYY-MM-DD' (null if not a valid date number) */
function oleToDate(n) {
  if (n == null) return null;
  if (typeof n === 'string') {
    const t = n.trim();
    // Already an ISO-ish date string
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(t);
    if (!isNaN(d.getTime()) && t.length >= 8) return d.toISOString().slice(0, 10);
    return null;
  }
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Excel fractional time → 'HH:MM'. Non-numeric strings (e.g. "D/S") returned trimmed. */
function oleToTime(n) {
  if (n == null) return null;
  if (typeof n === 'string') {
    const t = n.trim();
    if (!t || t === '0') return null;
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    return t; // preserve labels like D/S, N/S
  }
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const totalMin = Math.round((n % 1) * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Normalise a cell value — treat 0, '0', 'N/A', '' as null */
function val(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s === '0' || s.toLowerCase() === 'n/a') return null;
  return s;
}

function boolVal(v) {
  if (v == null) return 0;
  const s = String(v).trim().toLowerCase();
  return (s === 'yes' || s === 'y' || s === '1' || s === 'true') ? 1 : 0;
}

const normHeader = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Find the header row index within the first `scan` rows by required keywords. */
function findHeaderRow(rows, requiredAny, scan = 8) {
  const wanted = requiredAny.map(normHeader);
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const r = rows[i];
    if (!r) continue;
    const norms = r.map(normHeader);
    if (wanted.every(w => norms.includes(w))) return i;
  }
  // fallback: row containing at least one wanted token
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const r = rows[i];
    if (!r) continue;
    const norms = r.map(normHeader);
    if (wanted.some(w => norms.includes(w))) return i;
  }
  return -1;
}

function buildHeaderMap(headerRow) {
  const m = {};
  (headerRow || []).forEach((h, i) => {
    const k = normHeader(h);
    if (k && !(k in m)) m[k] = i;
  });
  return m;
}

/** Resolve a column index from any of the supplied header-name aliases. */
function colIdx(map, ...aliases) {
  for (const a of aliases) {
    const k = normHeader(a);
    if (k in map) return map[k];
  }
  return -1;
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}

/** Build a prepared INSERT limited to columns that exist in the table. */
function buildInsert(db, table, templateKeys) {
  const existing = tableColumns(db, table);
  const keys = templateKeys.filter(k => existing.has(k));
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  return { stmt: db.prepare(sql), keys };
}

function assertSqlite() {
  if (dbType() !== 'sqlite') {
    throw new Error('Excel import currently supports the SQLite backend only. ' +
      'For SQL Server, use the migration tooling / bulk loader described in SQL_EXPRESS_MIGRATION.md.');
  }
}

// ─── Lookup cache factory (employer / person / clinician) ──────────────────────

function makeLookups(db, dryRun, stats) {
  const employerCols = tableColumns(db, 'Employer');
  const personCols   = tableColumns(db, 'Person');

  // In dry-run we have no real autoincrement IDs; hand out unique negative
  // placeholders so dedup keys remain distinct (otherwise everything collides).
  let placeholderSeq = -1;
  const nextPlaceholder = () => placeholderSeq--;

  const employerCache = new Map(); // lower(name) → EmployerID
  db.prepare('SELECT EmployerID, CompanyName FROM Employer').all()
    .forEach(r => employerCache.set(String(r.CompanyName).trim().toLowerCase(), r.EmployerID));

  const clinicianCache = new Map();
  db.prepare('SELECT ClinicianID, Name FROM Clinician').all()
    .forEach(r => clinicianCache.set(String(r.Name).trim().toLowerCase(), r.ClinicianID));

  const personCache = new Map(); // "name|dob|empId" → PersonID
  db.prepare('SELECT PersonID, FullName, DateOfBirth, EmployerID FROM Person').all()
    .forEach(r => {
      const k = `${String(r.FullName).trim().toLowerCase()}|${r.DateOfBirth || ''}|${r.EmployerID || ''}`;
      personCache.set(k, r.PersonID);
    });

  const insEmployer = employerCols.has('Category')
    ? db.prepare('INSERT INTO Employer (CompanyName, Category, IsActive) VALUES (?,?,1)')
    : db.prepare('INSERT INTO Employer (CompanyName, IsActive) VALUES (?,1)');
  const insClinician = db.prepare('INSERT INTO Clinician (Name, IsActive) VALUES (?,1)');

  // Person insert respecting available columns
  const personKeys = ['FullName', 'DateOfBirth', 'SexID', 'EmployerID', 'WorkerTypeID', 'IsActive']
    .filter(k => personCols.has(k));
  const insPerson = db.prepare(
    `INSERT INTO Person (${personKeys.join(', ')}) VALUES (${personKeys.map(() => '?').join(', ')})`
  );

  function getOrCreateEmployer(rawName) {
    if (!rawName) return null;
    const name = String(rawName).trim();
    const key = name.toLowerCase();
    if (employerCache.has(key)) return employerCache.get(key);
    if (dryRun) { const id = nextPlaceholder(); employerCache.set(key, id); stats.created.employers++; return id; }
    const category = (key.includes('scjv') || key === 'town & country') ? 'SCJV' : 'Contractor';
    const info = employerCols.has('Category')
      ? insEmployer.run(name, category)
      : insEmployer.run(name);
    employerCache.set(key, info.lastInsertRowid);
    stats.created.employers++;
    return info.lastInsertRowid;
  }

  function getOrCreateClinician(rawName) {
    if (!rawName) return null;
    const name = String(rawName).trim();
    const key = name.toLowerCase();
    if (clinicianCache.has(key)) return clinicianCache.get(key);
    if (dryRun) { const id = nextPlaceholder(); clinicianCache.set(key, id); stats.created.clinicians++; return id; }
    const info = insClinician.run(name);
    clinicianCache.set(key, info.lastInsertRowid);
    stats.created.clinicians++;
    return info.lastInsertRowid;
  }

  function getOrCreatePerson(fullName, dob, sexId, employerId, workerTypeId) {
    const name = String(fullName).trim();
    const key = `${name.toLowerCase()}|${dob || ''}|${employerId || ''}`;
    if (personCache.has(key)) return personCache.get(key);
    // looser fallback: name + dob (any employer)
    if (dob) {
      for (const [k, v] of personCache) {
        if (k.startsWith(`${name.toLowerCase()}|${dob}|`)) { personCache.set(key, v); return v; }
      }
    }
    if (dryRun) { const id = nextPlaceholder(); personCache.set(key, id); stats.created.persons++; return id; }
    const vals = personKeys.map(k => {
      switch (k) {
        case 'FullName': return name;
        case 'DateOfBirth': return dob || null;
        case 'SexID': return sexId || null;
        case 'EmployerID': return employerId || null;
        case 'WorkerTypeID': return workerTypeId || null;
        case 'IsActive': return 1;
        default: return null;
      }
    });
    const info = insPerson.run(...vals);
    personCache.set(key, info.lastInsertRowid);
    stats.created.persons++;
    return info.lastInsertRowid;
  }

  return { getOrCreateEmployer, getOrCreateClinician, getOrCreatePerson };
}

// ─── Mapping tables ────────────────────────────────────────────────────────────

const TEST_TYPE_MAP = {
  'random': 'RND',
  'port authority': 'PA',
  'pre-employment / rtw': 'PRE',
  'pre-employment/rtw': 'PRE',
  'pre employment': 'PRE',
  'pre-employment': 'PRE',
  'post incident': 'INC',
  'cause': 'CAU',
  'for cause': 'CAU',
  'blanket': 'BLK',
  'did not attend': 'DNA',
};

const SEX_MAP = { male: 1, female: 2, other: 3, m: 1, f: 2 };

function mapResult(s) {
  if (!s) return null;
  const l = String(s).trim().toLowerCase();
  if (l === 'negative') return 'Negative';
  if (l === 'non-negative' || l === 'non- negative') return 'Non-Negative';
  if (l === 'refused') return 'Refused';
  if (l === 'unable to test') return 'Unable to Test';
  return null;
}

function mapConfirmatory(s) {
  if (!s) return null;
  const l = String(s).trim().toLowerCase();
  if (l === 'negative') return 'Negative';
  if (l.includes('positive') || l.includes('confirmed')) return 'Substance Confirmed';
  if (l.includes('pending')) return 'Pending';
  return null;
}

// ─── AOD importer ──────────────────────────────────────────────────────────────

export function importAodWorkbook(input, opts = {}) {
  assertSqlite();
  const dryRun = !!opts.dryRun;
  const db = getRawDb();

  const wb = Buffer.isBuffer(input) ? XLSX.read(input, { type: 'buffer' }) : XLSX.readFile(input);
  const sheetName = opts.sheet
    || wb.SheetNames.find(n => normHeader(n) === 'aodbase')
    || wb.SheetNames.find(n => /aod/i.test(n))
    || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`AOD sheet not found (looked for "AOD_Base"). Sheets: ${wb.SheetNames.join(', ')}`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const hdrRow = findHeaderRow(rows, ['Date', 'Name', 'Type of test'], 6);
  if (hdrRow < 0) throw new Error('Could not locate AOD header row (Date / Name / Type of test).');
  const H = buildHeaderMap(rows[hdrRow]);

  const c = {
    date:    colIdx(H, 'Date'),
    time:    colIdx(H, 'Time'),
    name:    colIdx(H, 'Name'),
    dob:     colIdx(H, 'DOB', 'Date of Birth'),
    sex:     colIdx(H, 'Sex', 'Gender'),
    employer:colIdx(H, 'Employer', 'Company'),
    worker:  colIdx(H, 'Worker Type', 'SCJV'),
    type:    colIdx(H, 'Type of test', 'Test Type'),
    oral:    colIdx(H, 'Oral result', 'Result'),
    bac:     colIdx(H, 'BAC'),
    tester:  colIdx(H, 'Tester', 'Clinician'),
    urineUnd:colIdx(H, 'Urine undertaken?', 'Urine?'),
    urineRes:colIdx(H, 'Urine Result'),
    sample:  colIdx(H, 'Sample Sent to Lab?', 'Sample Sent'),
    confirm: colIdx(H, 'Confirmatory result'),
    notes:   colIdx(H, 'Notes', 'Comments'),
    ovrBac:  colIdx(H, 'Override BAC Result'),
    ovrDrug: colIdx(H, 'Override Drug Result'),
    finalBac:colIdx(H, 'Final BAC Outcome'),
    finalDrug:colIdx(H, 'Final Drug Outcome'),
  };

  const testTypeByCode = {};
  db.prepare('SELECT TestTypeID, Code FROM TestType').all().forEach(r => { testTypeByCode[r.Code] = r.TestTypeID; });
  const defaultType = testTypeByCode['RND'] || Object.values(testTypeByCode)[0];

  const stats = {
    type: 'aod', dryRun, sheet: sheetName, totalRows: 0,
    inserted: 0, duplicates: 0, skipped: 0, errors: 0,
    created: { employers: 0, persons: 0, clinicians: 0 },
    sample: [], errorSamples: [],
  };

  const aodCols = tableColumns(db, 'AODTest');
  const lookups = makeLookups(db, dryRun, stats);

  // Existing dedup keys + test numbers
  const dedup = new Set();
  db.prepare('SELECT PersonID, TestDate, TestTime, TestTypeID FROM AODTest').all()
    .forEach(r => dedup.add(`${r.PersonID}|${r.TestDate}|${r.TestTime || ''}|${r.TestTypeID}`));
  const existingNums = new Set(db.prepare('SELECT TestNumber FROM AODTest').all().map(r => r.TestNumber));
  let counter = db.prepare('SELECT COUNT(*) c FROM AODTest').get().c;
  function nextTestNumber() {
    let n;
    do { counter++; n = `IMP-${String(counter).padStart(6, '0')}`; } while (existingNums.has(n));
    existingNums.add(n);
    return n;
  }

  const template = [
    'TestNumber', 'TestDate', 'TestTime', 'PersonID', 'TestTypeID', 'ClinicianID',
    'OralUndertaken', 'OralResult', 'BACUndertaken', 'BACInitialValue', 'BACResult',
    'UrineUndertaken', 'UrineResult', 'SampleSentToLab', 'ConfirmatoryResult',
    'FinalBACOutcome', 'FinalDrugOutcome', 'OverallAODResult',
    'TestStatus', 'IsPending', 'IsNonNegative', 'Notes', 'CreatedAt', 'UpdatedAt',
  ];
  const { stmt: insTest, keys: insKeys } = buildInsert(db, 'AODTest', template);
  const insNonNeg = aodCols && tableColumns(db, 'NonNegativeRecord').size
    ? db.prepare("INSERT INTO NonNegativeRecord (TestID, DetectedSubstances, TypeOfTest, Status) VALUES (?,?,?,'Closed')")
    : null;
  const insPosBac = tableColumns(db, 'PositiveBACRecord').size
    ? db.prepare("INSERT INTO PositiveBACRecord (TestID, MeasuredBAC, FinalBACOutcome, Status) VALUES (?,?,?,'Closed')")
    : null;

  const processRow = (r) => {
    const testDate = oleToDate(r[c.date]);
    const name = val(r[c.name]);
    if (!testDate || !name) { stats.skipped++; return; }
    stats.totalRows++;

    const testTime = oleToTime(r[c.time]);
    const typeRaw = (val(r[c.type]) || '').toLowerCase();
    const typeCode = TEST_TYPE_MAP[typeRaw] || 'RND';
    const testTypeId = testTypeByCode[typeCode] || defaultType;

    const dob = oleToDate(r[c.dob]);
    const sexId = SEX_MAP[String(val(r[c.sex]) || '').toLowerCase()] || null;
    const workerRaw = String(val(r[c.worker]) || '').toLowerCase();
    const workerTypeId = workerRaw.includes('staff') ? 1 : 2;

    const employerId = lookups.getOrCreateEmployer(val(r[c.employer]));
    const personId = lookups.getOrCreatePerson(name, dob, sexId, employerId, workerTypeId);
    const clinicianId = lookups.getOrCreateClinician(val(r[c.tester]));

    const key = `${personId}|${testDate}|${testTime || ''}|${testTypeId}`;
    if (dedup.has(key)) { stats.duplicates++; return; }
    dedup.add(key);

    const oralResult = mapResult(r[c.oral]);
    const urineUnd = boolVal(r[c.urineUnd]);
    const urineResult = urineUnd ? mapResult(r[c.urineRes]) : null;
    const confirm = mapConfirmatory(r[c.confirm]);
    const bac = (typeof r[c.bac] === 'number' && r[c.bac] > 0) ? r[c.bac] : null;
    const bacPos = bac !== null;
    const notes = val(r[c.notes]);
    const sampleSent = boolVal(r[c.sample]);
    const finalBacRaw = val(r[c.finalBac]);
    const finalDrugRaw = val(r[c.finalDrug]);

    const isNonNeg = (oralResult === 'Non-Negative' || urineResult === 'Non-Negative' || bacPos) ? 1 : 0;
    const isPending = (confirm === 'Pending' || (isNonNeg && !confirm && !bacPos)) ? 1 : 0;
    const oralUndertaken = oralResult !== null ? 1 : 0;
    const bacUndertaken = (bacPos || (!oralUndertaken && !urineUnd)) ? 1 : 0;

    let finalBac = finalBacRaw || (bacPos ? 'Positive' : (bacUndertaken ? 'Negative' : null));
    if (finalBac && /negative/i.test(finalBac)) finalBac = 'Negative';
    else if (finalBac && /positive/i.test(finalBac)) finalBac = 'Positive';
    let finalDrug = finalDrugRaw || (isNonNeg ? (confirm || 'Pending Confirmation')
      : (oralResult === 'Negative' || urineResult === 'Negative' ? 'Negative' : null));
    if (finalDrug && /negative/i.test(finalDrug) && !/non/i.test(finalDrug)) finalDrug = 'Negative';

    let testStatus = 'Closed';
    if (isPending) testStatus = 'Pending Lab';
    else if (isNonNeg && confirm !== 'Negative') testStatus = 'Review Required';

    let overall = 'Negative';
    if (finalDrug && finalDrug !== 'Negative') overall = finalDrug;
    else if (finalBac === 'Positive') overall = 'Positive BAC';

    if (dryRun) { stats.inserted++; if (stats.sample.length < 8) stats.sample.push({ testDate, name, type: typeCode, oral: oralResult }); return; }

    const createdAt = `${testDate} 00:00:00`;
    const obj = {
      TestNumber: nextTestNumber(), TestDate: testDate, TestTime: testTime,
      PersonID: personId, TestTypeID: testTypeId, ClinicianID: clinicianId,
      OralUndertaken: oralUndertaken, OralResult: oralResult,
      BACUndertaken: bacUndertaken, BACInitialValue: bac,
      BACResult: bacPos ? 'Positive' : (bacUndertaken ? 'Negative' : null),
      UrineUndertaken: urineUnd, UrineResult: urineResult,
      SampleSentToLab: sampleSent, ConfirmatoryResult: confirm,
      FinalBACOutcome: finalBac, FinalDrugOutcome: finalDrug, OverallAODResult: overall,
      TestStatus: testStatus, IsPending: isPending, IsNonNegative: isNonNeg,
      Notes: notes, CreatedAt: createdAt, UpdatedAt: createdAt,
    };
    const info = insTest.run(...insKeys.map(k => obj[k]));
    const testId = info.lastInsertRowid;

    if (isNonNeg && insNonNeg) {
      const subs = [];
      if (bacPos) subs.push(`BAC: ${bac}`);
      if (oralResult === 'Non-Negative') subs.push('Oral Fluid');
      if (urineResult === 'Non-Negative') subs.push('Urine');
      insNonNeg.run(testId, subs.join(', '), bacPos ? 'BAC' : (oralResult === 'Non-Negative' ? 'Oral' : 'Urine'));
    }
    if (bacPos && insPosBac) insPosBac.run(testId, bac, finalBac || 'Positive');

    stats.inserted++;
    if (stats.sample.length < 8) stats.sample.push({ testDate, name, type: typeCode, oral: oralResult });
  };

  const dataRows = rows.slice(hdrRow + 1);
  const runAll = db.transaction(() => {
    for (let i = 0; i < dataRows.length; i++) {
      try { processRow(dataRows[i]); }
      catch (err) {
        stats.errors++;
        if (stats.errorSamples.length < 5) stats.errorSamples.push({ row: hdrRow + 2 + i, error: err.message });
      }
    }
  });
  runAll();

  return stats;
}

// ─── Patient Tracker importer ───────────────────────────────────────────────────

export function importPatientWorkbook(input, opts = {}) {
  assertSqlite();
  const dryRun = !!opts.dryRun;
  const db = getRawDb();

  const wb = Buffer.isBuffer(input) ? XLSX.read(input, { type: 'buffer' }) : XLSX.readFile(input);
  const sheetName = opts.sheet
    || wb.SheetNames.find(n => normHeader(n) === 'patienttracker')
    || wb.SheetNames.find(n => /patient/i.test(n))
    || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Patient sheet not found. Sheets: ${wb.SheetNames.join(', ')}`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const hdrRow = findHeaderRow(rows, ['PATIENT NAME', 'WR/NWR'], 6);
  if (hdrRow < 0) throw new Error('Could not locate Patient header row (PATIENT NAME / WR/NWR).');
  const H = buildHeaderMap(rows[hdrRow]);

  const c = {
    date:   colIdx(H, 'Column1', 'Date'),
    time:   colIdx(H, 'Time'),
    wrNwr:  colIdx(H, 'WR/NWR'),
    name:   colIdx(H, 'PATIENT NAME', 'Name'),
    workgroup: colIdx(H, 'WORKGROUP', 'Workgroup', 'Employer'),
    body:   colIdx(H, 'BODY LOCATION', 'Body Location'),
    injury: colIdx(H, 'INJURY TYPE', 'Injury Type'),
    classification: colIdx(H, 'CLASSIFICATION', 'Classification'),
    rtw:    colIdx(H, 'RTW PLAN', 'RTW Plan'),
    drConsult: colIdx(H, 'DR CONSULT?', 'Dr Consult'),
    referral: colIdx(H, 'Referral'),
    clinician: colIdx(H, 'CLINICIAN', 'Clinician'),
    comment: colIdx(H, 'Comment', 'Comments'),
    eow:    colIdx(H, 'End of Week Tracker?', 'End of Week Tracker'),
  };

  const stats = {
    type: 'patient', dryRun, sheet: sheetName, totalRows: 0,
    inserted: 0, duplicates: 0, skipped: 0, errors: 0,
    created: { employers: 0, persons: 0, clinicians: 0 },
    sample: [], errorSamples: [],
  };

  const peCols = tableColumns(db, 'PatientEvent');
  const lookups = makeLookups(db, dryRun, stats);

  // Build dedup set from a natural key
  const keyParts = (o) => [
    o.EventDate || '', String(o.PatientName || '').trim().toLowerCase(), o.WrNwr || '',
    o.BodyLocation || '', o.InjuryType || '', o.Classification || '',
    String(o.Comment || '').trim().toLowerCase(),
  ].join('|');

  const dedup = new Set();
  const existCols = ['EventDate', 'PatientName', 'WrNwr', 'BodyLocation', 'InjuryType', 'Classification', 'Comment']
    .filter(k => peCols.has(k));
  db.prepare(`SELECT ${existCols.join(', ')} FROM PatientEvent`).all()
    .forEach(r => dedup.add(keyParts(r)));

  const template = [
    'EventDate', 'EventTime', 'PersonID', 'PatientName', 'Workgroup', 'WorkgroupEmployerID',
    'WrNwr', 'BodyLocation', 'InjuryType', 'Classification', 'RtwPlan', 'DrConsult',
    'Referral', 'Comment', 'EndOfWeekTracker', 'ClinicianID', 'CreatedAt',
  ];
  const { stmt: insEvent, keys: insKeys } = buildInsert(db, 'PatientEvent', template);

  const processRow = (r) => {
    const eventDate = oleToDate(r[c.date]);
    const name = val(r[c.name]);
    const wrNwr = val(r[c.wrNwr]);
    if (!eventDate || !name) { stats.skipped++; return; }
    stats.totalRows++;

    const workgroup = val(r[c.workgroup]);
    let comment = val(r[c.comment]);
    let eowRaw = r[c.eow];
    // Column drift: sometimes the comment lands under "End of Week Tracker?"
    const eowStr = val(eowRaw);
    let endOfWeek = boolVal(eowRaw);
    if (!comment && eowStr && !/^(yes|no|y|n|1|0|true|false)$/i.test(eowStr)) {
      comment = eowStr; endOfWeek = 0;
    }

    const obj = {
      EventDate: eventDate,
      EventTime: oleToTime(r[c.time]),
      PersonID: null,
      PatientName: name,
      Workgroup: workgroup,
      WorkgroupEmployerID: workgroup ? lookups.getOrCreateEmployer(workgroup) : null,
      WrNwr: wrNwr,
      BodyLocation: val(r[c.body]),
      InjuryType: val(r[c.injury]),
      Classification: val(r[c.classification]),
      RtwPlan: val(r[c.rtw]),
      DrConsult: boolVal(r[c.drConsult]),
      Referral: val(r[c.referral]),
      Comment: comment,
      EndOfWeekTracker: endOfWeek,
      ClinicianID: lookups.getOrCreateClinician(val(r[c.clinician])),
      CreatedAt: `${eventDate} 00:00:00`,
    };

    const k = keyParts(obj);
    if (dedup.has(k)) { stats.duplicates++; return; }
    dedup.add(k);

    if (dryRun) { stats.inserted++; if (stats.sample.length < 8) stats.sample.push({ eventDate, name, wrNwr, workgroup }); return; }

    insEvent.run(...insKeys.map(key => obj[key]));
    stats.inserted++;
    if (stats.sample.length < 8) stats.sample.push({ eventDate, name, wrNwr, workgroup });
  };

  const dataRows = rows.slice(hdrRow + 1);
  const runAll = db.transaction(() => {
    for (let i = 0; i < dataRows.length; i++) {
      try { processRow(dataRows[i]); }
      catch (err) {
        stats.errors++;
        if (stats.errorSamples.length < 5) stats.errorSamples.push({ row: hdrRow + 2 + i, error: err.message });
      }
    }
  });
  runAll();

  return stats;
}

export default { importAodWorkbook, importPatientWorkbook };
