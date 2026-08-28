import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, copyFileSync, statSync, createReadStream, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import {
  initDb, getRawDb, query, queryOne, run, exec,
  ensureColumn, saveDb, forceSaveDb
} from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import XLSX from 'xlsx';
import logger, { requestLogger, errorHandler, LOG_DIR } from './logger.js';
import { getSmtpConfig, saveSmtpConfig, testSmtp, sendMail, sendTestEmail, getEmailRules, saveEmailRules } from './mailer.js';
import { networkInterfaces } from 'os';
import { pack as sevenZipPack } from '7zip-min';
import { importAodWorkbook, importPatientWorkbook } from './importers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'aod-tracker-secret-key-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'admin123');

const SERVE_FRONTEND = process.env.SERVE_FRONTEND === '1' || process.env.SERVE_FRONTEND === 'true';
const FRONTEND_DIST_PATH = process.env.DIST_PATH || join(__dirname, '..', 'dist');
const HOST = process.env.HOST || '0.0.0.0';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helper: Flexible name search that handles both "First Last" and "Last, First" formats
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildNameSearchPatterns(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return null;
  const trimmed = searchTerm.trim();
  const patterns = [`%${trimmed}%`]; // Original search

  // Check if input contains a comma (surname, firstname format)
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [surname, firstname] = parts;
      // Also search as "firstname surname" (without comma)
      patterns.push(`%${firstname} ${surname}%`);
      // And individual parts
      patterns.push(`%${firstname}%`);
      patterns.push(`%${surname}%`);
    }
  } else if (trimmed.includes(' ')) {
    // Input has space but no comma - could be "firstname surname"
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstname = parts[0];
      const surname = parts.slice(1).join(' '); // Handle multi-word surnames
      // Also search as "surname, firstname" (with comma)
      patterns.push(`%${surname}, ${firstname}%`);
      // Reverse order without comma
      patterns.push(`%${surname} ${firstname}%`);
    }
  }

  return [...new Set(patterns)]; // Remove duplicates
}

function buildNameSearchSQL(columnName, patterns) {
  if (!patterns || patterns.length === 0) return null;
  const conditions = patterns.map(() => `LOWER(${columnName}) LIKE LOWER(?)`).join(' OR ');
  return { sql: `(${conditions})`, params: patterns };
}

// Initialise database (sql.js SQLite or MSSQL connection pool)
await initDb();
const db = getRawDb(); // raw driver for DDL / migration statements

// Run schema (use exec for multi-statement SQL, wrapped in try-catch for partial failures)
const schema = readFileSync(join(__dirname, 'database', 'schema.sql'), 'utf-8');
// Split and run statements individually to handle existing tables gracefully
// Strip -- line comments from each chunk before filtering so chunks with leading
// comments (e.g. the AODTest block) are not incorrectly dropped.
const statements = schema.split(';')
  .map(s => ({ raw: s, stripped: s.replace(/--[^\n]*/g, '').trim() }))
  .filter(({ stripped }) => stripped.length > 0)
  .map(({ raw }) => raw.trim());
for (const stmt of statements) {
  try {
    db.prepare(stmt).run();
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('duplicate column') && !err.message.includes('no such column')) {
      logger.dbError('SCHEMA', 'migration', err);
    }
  }
}

// Lightweight migrations for existing DB files (schema.sql is CREATE TABLE IF NOT EXISTS)

// AODTest workflow fields
ensureColumn('AODTest', 'RFT', 'RFT INTEGER DEFAULT 0');
ensureColumn('AODTest', 'ConfirmatoryResult', 'ConfirmatoryResult TEXT');
ensureColumn('AODTest', 'ConfirmatoryResultDate', 'ConfirmatoryResultDate TEXT');
ensureColumn('AODTest', 'DeclaredMedications', 'DeclaredMedications TEXT');
ensureColumn('AODTest', 'IDSighted', 'IDSighted INTEGER DEFAULT 0');
ensureColumn('AODTest', 'IDType', 'IDType TEXT');
ensureColumn('AODTest', 'IDNumber', 'IDNumber TEXT');
ensureColumn('AODTest', 'MedicationReviewStatus', 'MedicationReviewStatus TEXT');
ensureColumn('AODTest', 'MedicationReviewNotes', 'MedicationReviewNotes TEXT');
ensureColumn('AODTest', 'TestStatus', "TestStatus TEXT DEFAULT 'Closed'");

// Manual override fields (used by update routes)
ensureColumn('AODTest', 'OverrideBACResult', 'OverrideBACResult TEXT');
ensureColumn('AODTest', 'OverrideBACReason', 'OverrideBACReason TEXT');
ensureColumn('AODTest', 'OverrideDrugResult', 'OverrideDrugResult TEXT');
ensureColumn('AODTest', 'OverrideDrugReason', 'OverrideDrugReason TEXT');

// Lab result detail fields
ensureColumn('AODTest', 'LabDrugDetails', 'LabDrugDetails TEXT');
ensureColumn('AODTest', 'Creatinine',     'Creatinine TEXT');
ensureColumn('AODTest', 'LabComments',    'LabComments TEXT');

// Lab request type fields (Specific Test / GCMS)
ensureColumn('AODTest', 'LabRequestType', "LabRequestType TEXT DEFAULT 'specific'");
ensureColumn('AODTest', 'LabRequestNotes','LabRequestNotes TEXT');

// Screening substance detail fields
ensureColumn('AODTest', 'OralSubstances', 'OralSubstances TEXT');
ensureColumn('AODTest', 'UrineSubstances', 'UrineSubstances TEXT');
ensureColumn('AODTest', 'OralControlLines', 'OralControlLines TEXT');
ensureColumn('AODTest', 'UrineControlLines', 'UrineControlLines TEXT');

// Back-compat: some DBs may still have BACValue; new schema uses BACInitialValue/BACFinalValue
ensureColumn('AODTest', 'BACInitialValue', 'BACInitialValue REAL');
ensureColumn('AODTest', 'BACInitialTime', 'BACInitialTime TEXT');
ensureColumn('AODTest', 'BACFinalValue', 'BACFinalValue REAL');
ensureColumn('AODTest', 'BACFinalTime', 'BACFinalTime TEXT');

// Attachment table columns
ensureColumn('Attachment', 'Category', 'Category TEXT');
ensureColumn('Attachment', 'OriginalFileName', 'OriginalFileName TEXT');
ensureColumn('Attachment', 'Description', 'Description TEXT');

// Employer category field
ensureColumn('Employer', 'Category', "Category TEXT DEFAULT 'Contractor'");

// Missing columns identified from error logs
ensureColumn('PendingResult', 'LabResult', 'LabResult TEXT');
ensureColumn('AuditLog', 'CreatedAt', 'CreatedAt TEXT');
ensureColumn('AODTest', 'OverallAODResult', 'OverallAODResult TEXT');

// ── User table: extended RBAC + clinician fields ──────────────────────────
ensureColumn('User', 'FirstName',   'FirstName TEXT');
ensureColumn('User', 'LastName',    'LastName TEXT');
ensureColumn('User', 'UniqueID',    'UniqueID TEXT');   // employee/staff number
ensureColumn('User', 'IsClinician', 'IsClinician INTEGER DEFAULT 0');
ensureColumn('User', 'Credentials', 'Credentials TEXT'); // e.g. RN, NP
ensureColumn('User', 'DisplayName', 'DisplayName TEXT'); // Display name shown in UI (replaces clinician name)

// Seed roles that may not exist yet (user / supervisor / admin mapping)
try {
  run(`INSERT OR IGNORE INTO Role (Name, Description, Permissions) VALUES
    ('admin',      'Full system access',             '["all"]'),
    ('supervisor', 'Manage tests and non-negatives', '["tests.*","persons.*","reports.*","nonneg.*"]'),
    ('user',       'Enter and view tests',           '["tests.create","tests.read","persons.read"]')`);
} catch {}

// ── Feature flag: SECURE_LOGIN ────────────────────────────────────────────
// When 0 (default), all routes are open and no JWT is checked.
// When 1, authMiddleware enforces a valid JWT token on protected routes.
const SECURE_LOGIN = parseInt(process.env.SECURE_LOGIN || '0', 10) === 1;

// ── Migrate existing Clinician rows into User table (one-time) ────────────
try {
  const cliniciansToMigrate = query(`
    SELECT c.* FROM Clinician c
    WHERE NOT EXISTS (
      SELECT 1 FROM User u WHERE u.UniqueID = CAST(c.ClinicianID AS TEXT) AND u.IsClinician = 1
    )
  `);
  const userRoleId = queryOne(`SELECT RoleID FROM Role WHERE LOWER(Name) = 'user'`)?.RoleID || 2;
  const dummyHash = bcrypt.hashSync('changeme1', 10);
  for (const c of cliniciansToMigrate) {
    // Derive first/last name from Name field (e.g. "Jane Smith" → first=Jane last=Smith)
    const parts = (c.Name || '').trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';
    // Generate a unique username: first initial + lastname lowercase, ensure no collision
    const baseUser = `${firstName.charAt(0).toLowerCase()}${lastName.replace(/\s+/g,'').toLowerCase()}`;
    let username = baseUser || `clinician${c.ClinicianID}`;
    let suffix = 1;
    while (queryOne('SELECT 1 FROM User WHERE Username = ?', [username])) {
      username = `${baseUser}${suffix++}`;
    }
    try {
      run(`INSERT INTO User (Username, PasswordHash, FullName, FirstName, LastName, Email, RoleID,
                            UniqueID, IsClinician, Credentials, IsActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [username, dummyHash, c.Name, firstName, lastName,
         c.Email || null, userRoleId,
         String(c.ClinicianID), c.Credentials || null, c.IsActive ?? 1]);
    } catch { /* duplicate or constraint — skip */ }
  }
  if (cliniciansToMigrate.length) {
    logger.startup(`Migrated ${cliniciansToMigrate.length} clinician(s) into User table`);
  }
} catch (e) { logger.warn('Clinician→User migration error', { error: e.message }); }

// Employer merge and alias support
ensureColumn('Employer', 'AlsoKnownAs', 'AlsoKnownAs TEXT'); // Comma-separated aliases
ensureColumn('Employer', 'FullLegalName', 'FullLegalName TEXT'); // Full legal name if different from display name
ensureColumn('Employer', 'MergedIntoEmployerID', 'MergedIntoEmployerID INTEGER'); // For merged employers, points to the canonical employer

// Create Reviews Calendar (ReviewAppointment) table for tracking patient review appointments
try {
  run(`CREATE TABLE IF NOT EXISTS ReviewAppointment (
    AppointmentID INTEGER PRIMARY KEY AUTOINCREMENT,
    PersonID INTEGER NOT NULL REFERENCES Person(PersonID) ON DELETE CASCADE,
    AppointmentDate TEXT NOT NULL,
    TimeSlot TEXT, -- Optional time slot (e.g., "09:00", "14:30")
    Comment TEXT, -- Optional comment/reason for review
    ShowCommentOnDashboard INTEGER DEFAULT 1, -- Whether to show comment on dashboard
    Status TEXT DEFAULT 'Scheduled', -- Scheduled, Completed, Cancelled, No-Show
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    CreatedBy INTEGER,
    UpdatedBy INTEGER
  )`);
  run(`CREATE INDEX IF NOT EXISTS idx_review_appointment_date ON ReviewAppointment(AppointmentDate)`);
  run(`CREATE INDEX IF NOT EXISTS idx_review_appointment_person ON ReviewAppointment(PersonID)`);
  run(`CREATE INDEX IF NOT EXISTS idx_review_appointment_status ON ReviewAppointment(Status)`);
} catch (e) { /* Table may already exist */ }

// Migration: Add PatientName column for free-text entry (if not exists)
try {
  const hasPatientName = query(`SELECT 1 FROM pragma_table_info('ReviewAppointment') WHERE name = 'PatientName'`).length > 0;
  if (!hasPatientName) {
    run(`ALTER TABLE ReviewAppointment ADD COLUMN PatientName TEXT`);
    run(`CREATE INDEX IF NOT EXISTS idx_review_appointment_patient_name ON ReviewAppointment(PatientName)`);
  }
} catch (e) { /* Column may already exist or other error */ }

// Create EmployerAlias table for detailed alias tracking
try {
  run(`CREATE TABLE IF NOT EXISTS EmployerAlias (
    AliasID INTEGER PRIMARY KEY AUTOINCREMENT,
    EmployerID INTEGER NOT NULL REFERENCES Employer(EmployerID) ON DELETE CASCADE,
    AliasName TEXT NOT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(EmployerID, AliasName)
  )`);
  run(`CREATE INDEX IF NOT EXISTS idx_employer_alias_name ON EmployerAlias(AliasName)`);
} catch (e) { /* Table may already exist */ }


// Ensure RandomTestList tables exist (may not be created by schema due to index issues)
try {
  run(`CREATE TABLE IF NOT EXISTS RandomTestList (
    ListID INTEGER PRIMARY KEY AUTOINCREMENT,
    ListDate TEXT NOT NULL,
    Shift TEXT NOT NULL,
    SourceFileName TEXT,
    ImportedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    ImportedBy INTEGER,
    Notes TEXT
  )`);
  run(`CREATE TABLE IF NOT EXISTS RandomTestEntry (
    EntryID INTEGER PRIMARY KEY AUTOINCREMENT,
    ListID INTEGER,
    EmployeeNumber TEXT,
    EmployeeName TEXT NOT NULL,
    Department TEXT,
    Position TEXT,
    EmployerID INTEGER,
    EmployerCategory TEXT,
    MatchedPersonID INTEGER,
    Status TEXT DEFAULT 'Pending',
    TestID INTEGER,
    StatusNote TEXT,
    StatusUpdatedAt TEXT,
    StatusUpdatedBy INTEGER,
    ManualEntry INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { /* Tables may already exist */ }

// Migrate PatientEvent table to new schema (remove NOT NULL on PersonID)
try {
  // Check if old table exists with NOT NULL constraint or missing WrNwr
  const pragmaRows = db.pragma('table_info(PatientEvent)');
  let needsMigration = false;
  if (pragmaRows && pragmaRows.length > 0) {
    const colNames = pragmaRows.map(r => r.name);
    const personIdRow = pragmaRows.find(r => r.name === 'PersonID');
    if (!colNames.includes('WrNwr') || (personIdRow && personIdRow.notnull === 1)) {
      needsMigration = true;
    }
  }
  
  if (needsMigration) {
    logger.startup('Migrating PatientEvent table to new schema...');
    try { run(`DROP TABLE IF EXISTS PatientEvent_old`); } catch (e) {}
    run(`ALTER TABLE PatientEvent RENAME TO PatientEvent_old`);
    run(`CREATE TABLE PatientEvent (
      EventID INTEGER PRIMARY KEY AUTOINCREMENT,
      EventDate TEXT NOT NULL,
      EventTime TEXT,
      PersonID INTEGER,
      PatientName TEXT,
      Workgroup TEXT,
      WrNwr TEXT,
      BodyLocation TEXT,
      InjuryType TEXT,
      Classification TEXT,
      RtwPlan TEXT,
      DrConsult INTEGER DEFAULT 0,
      Referral TEXT,
      ClinicianID INTEGER,
      Comment TEXT,
      EndOfWeekTracker INTEGER DEFAULT 0,
      CreatedBy INTEGER,
      CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    // Copy old data if any
    try {
      run(`INSERT INTO PatientEvent (EventID, EventDate, EventTime, PersonID, ClinicianID, CreatedBy, CreatedAt)
              SELECT EventID, EventDate, EventTime, PersonID, ClinicianID, CreatedBy, CreatedAt FROM PatientEvent_old`);
    } catch (e) { /* No data or columns don't match */ }
    run(`DROP TABLE PatientEvent_old`);
    logger.startup('Migrated PatientEvent table to new schema');
  }
} catch (e) {
  logger.startup('Creating PatientEvent table fresh');
  // Table doesn't exist, create it fresh
  run(`CREATE TABLE IF NOT EXISTS PatientEvent (
    EventID INTEGER PRIMARY KEY AUTOINCREMENT,
    EventDate TEXT NOT NULL,
    EventTime TEXT,
    PersonID INTEGER,
    PatientName TEXT,
    Workgroup TEXT,
    WrNwr TEXT,
    BodyLocation TEXT,
    InjuryType TEXT,
    Classification TEXT,
    RtwPlan TEXT,
    DrConsult INTEGER DEFAULT 0,
    Referral TEXT,
    ClinicianID INTEGER,
    Comment TEXT,
    EndOfWeekTracker INTEGER DEFAULT 0,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

// Add new columns to existing PatientEvent table if they don't exist
ensureColumn('PatientEvent', 'PatientName', 'PatientName TEXT');
ensureColumn('PatientEvent', 'Workgroup', 'Workgroup TEXT');
ensureColumn('PatientEvent', 'WorkgroupEmployerID', 'WorkgroupEmployerID INTEGER');
ensureColumn('PatientEvent', 'WrNwr', 'WrNwr TEXT');
ensureColumn('PatientEvent', 'BodyLocation', 'BodyLocation TEXT');
ensureColumn('PatientEvent', 'InjuryType', 'InjuryType TEXT');
ensureColumn('PatientEvent', 'Classification', 'Classification TEXT');
ensureColumn('PatientEvent', 'RtwPlan', 'RtwPlan TEXT');
ensureColumn('PatientEvent', 'DrConsult', 'DrConsult INTEGER DEFAULT 0');
ensureColumn('PatientEvent', 'Referral', 'Referral TEXT');
ensureColumn('PatientEvent', 'Comment', 'Comment TEXT');
ensureColumn('PatientEvent', 'EndOfWeekTracker', 'EndOfWeekTracker INTEGER DEFAULT 0');
ensureColumn('PatientEvent', 'UpdatedAt', 'UpdatedAt TEXT');
ensureColumn('PatientEvent', 'UpdatedBy', 'UpdatedBy INTEGER');
ensureColumn('PatientEvent', 'EventType', 'EventType TEXT');
ensureColumn('PatientEvent', 'PresentingComplaint', 'PresentingComplaint TEXT');
ensureColumn('PatientEvent', 'Disposition', 'Disposition TEXT');
ensureColumn('PatientEvent', 'PersonName', 'PersonName TEXT');

// â”€â”€ Archive tables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
run(`CREATE TABLE IF NOT EXISTS ArchiveJob (
  JobID INTEGER PRIMARY KEY AUTOINCREMENT,
  ArchivedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  ArchivedBy TEXT,
  CutoffDate TEXT NOT NULL,
  Note TEXT,
  TestsArchived INTEGER DEFAULT 0,
  TrainingArchived INTEGER DEFAULT 0,
  EventsArchived INTEGER DEFAULT 0,
  PersonsArchived INTEGER DEFAULT 0,
  CliniciansArchived INTEGER DEFAULT 0
)`);

run(`CREATE TABLE IF NOT EXISTS ArchivedTest (
  ArchiveID INTEGER PRIMARY KEY AUTOINCREMENT,
  JobID INTEGER REFERENCES ArchiveJob(JobID),
  RestoredAt TEXT,
  OriginalID INTEGER,
  Data TEXT NOT NULL
)`);

run(`CREATE TABLE IF NOT EXISTS ArchivedTraining (
  ArchiveID INTEGER PRIMARY KEY AUTOINCREMENT,
  JobID INTEGER REFERENCES ArchiveJob(JobID),
  RestoredAt TEXT,
  OriginalID INTEGER,
  RecordType TEXT,
  Data TEXT NOT NULL
)`);

run(`CREATE TABLE IF NOT EXISTS ArchivedPatientEvent (
  ArchiveID INTEGER PRIMARY KEY AUTOINCREMENT,
  JobID INTEGER REFERENCES ArchiveJob(JobID),
  RestoredAt TEXT,
  OriginalID INTEGER,
  Data TEXT NOT NULL
)`);

run(`CREATE TABLE IF NOT EXISTS ArchivedPerson (
  ArchiveID INTEGER PRIMARY KEY AUTOINCREMENT,
  JobID INTEGER,
  RestoredAt TEXT,
  OriginalID INTEGER,
  ArchivedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  Reason TEXT,
  Data TEXT NOT NULL
)`);

run(`CREATE TABLE IF NOT EXISTS ArchivedClinician (
  ArchiveID INTEGER PRIMARY KEY AUTOINCREMENT,
  JobID INTEGER,
  RestoredAt TEXT,
  OriginalID INTEGER,
  ArchivedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  Reason TEXT,
  Data TEXT NOT NULL
)`);


run(`CREATE TABLE IF NOT EXISTS ReferralOption (
  OptionID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL UNIQUE,
  SortOrder INTEGER DEFAULT 0,
  IsActive INTEGER DEFAULT 1
)`);
(function seedReferrals() {
  const defaults = [
    'Return to work', 'Camp', 'Physio', 'Medmate', 'GP',
    'Company Injury Management Team', 'ED'
  ];
  for (let i = 0; i < defaults.length; i++) {
    try { run(`INSERT OR IGNORE INTO ReferralOption (Name, SortOrder) VALUES (?, ?)`, [defaults[i], i + 1]); } catch {}
  }
})();

// â”€â”€ Compliance Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
run(`CREATE TABLE IF NOT EXISTS ComplianceCheck (
  CheckID       INTEGER PRIMARY KEY AUTOINCREMENT,
  Name          TEXT    NOT NULL,
  Description   TEXT,
  FrequencyDays INTEGER NOT NULL DEFAULT 7,
  IsActive      INTEGER NOT NULL DEFAULT 1,
  CreatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS CheckCompletion (
  CompletionID  INTEGER PRIMARY KEY AUTOINCREMENT,
  CheckID       INTEGER NOT NULL REFERENCES ComplianceCheck(CheckID) ON DELETE CASCADE,
  CompletedDate TEXT    NOT NULL,
  CompletedBy   TEXT    NOT NULL,
  Notes         TEXT,
  CreatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// â”€â”€ Report Templates (saved report configurations) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
run(`CREATE TABLE IF NOT EXISTS ReportTemplate (
  TemplateID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Name         TEXT NOT NULL,
  Description  TEXT,
  ReportId     TEXT,          -- pre-built report ID (null for custom)
  Config       TEXT,          -- JSON: { dataset, groupBy, metrics, filters }
  DatePreset   TEXT DEFAULT 'month',
  CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// â”€â”€ Pending Medicals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
run(`CREATE TABLE IF NOT EXISTS PendingMedical (
  MedicalID       INTEGER PRIMARY KEY AUTOINCREMENT,
  PersonID        INTEGER REFERENCES Person(PersonID),
  PersonName      TEXT,
  MedicalType     TEXT NOT NULL,
  DueDate         TEXT,
  ScheduledDate   TEXT,
  Status          TEXT NOT NULL DEFAULT 'Pending',
  Priority        TEXT NOT NULL DEFAULT 'Normal',
  Notes           TEXT,
  CompletedDate   TEXT,
  CreatedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// â”€â”€ ScheduledTest extra columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ensureColumn('ScheduledTest', 'UpdatedAt',        'UpdatedAt TEXT');
ensureColumn('ScheduledTest', 'RescheduledFrom',  'RescheduledFrom TEXT');
ensureColumn('ScheduledTest', 'SourceType',       'SourceType TEXT');
ensureColumn('ScheduledTest', 'SourceID',         'SourceID INTEGER');
ensureColumn('ScheduledTest', 'TestNumber',       'TestNumber TEXT');

// â”€â”€ AttendanceRecord extra columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ensureColumn('AttendanceRecord', 'ReasonCategory',  'ReasonCategory TEXT');
ensureColumn('AttendanceRecord', 'ScheduledTime',   'ScheduledTime TEXT');
ensureColumn('AttendanceRecord', 'TestTypeID',      'TestTypeID INTEGER');
ensureColumn('AttendanceRecord', 'RecordedAt',      'RecordedAt TEXT');
ensureColumn('AttendanceRecord', 'RandomEntryID',   'RandomEntryID INTEGER');
ensureColumn('AttendanceRecord', 'Notes',           'Notes TEXT');

// Ensure RandomTestEntry has employer columns
ensureColumn('RandomTestEntry', 'EmployerID', 'EmployerID INTEGER');
ensureColumn('RandomTestEntry', 'EmployerCategory', 'EmployerCategory TEXT');

// Ensure RandomTestList has employer + test type override columns
ensureColumn('RandomTestList', 'DefaultEmployerID', 'DefaultEmployerID INTEGER');
ensureColumn('RandomTestList', 'TestTypeID', 'TestTypeID INTEGER');

// Training Tracker table
run(`CREATE TABLE IF NOT EXISTS TrainingRecord (
  TrainingID INTEGER PRIMARY KEY AUTOINCREMENT,
  ClinicianID INTEGER,
  TrainingDate TEXT NOT NULL,
  TrainingType TEXT NOT NULL,
  Title TEXT NOT NULL,
  Category TEXT,
  Hours REAL DEFAULT 0,
  ExpiryDate TEXT,
  Passed INTEGER DEFAULT 1,
  Notes TEXT,
  CreatedBy INTEGER,
  CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ClinicianID) REFERENCES Clinician(ClinicianID)
)`);

// New training fields to match T&C Training Records Tracker
ensureColumn('TrainingRecord', 'CompetencyUnit', 'CompetencyUnit TEXT');
ensureColumn('TrainingRecord', 'SecondaryUnit', 'SecondaryUnit TEXT');
ensureColumn('TrainingRecord', 'TrainingPackage', 'TrainingPackage TEXT');
ensureColumn('TrainingRecord', 'CPDType', 'CPDType TEXT');
ensureColumn('TrainingRecord', 'Disciplines', 'Disciplines TEXT');
ensureColumn('TrainingRecord', 'Interactive', 'Interactive TEXT');
ensureColumn('TrainingRecord', 'ClinicalVsNonClinical', 'ClinicalVsNonClinical TEXT');
ensureColumn('TrainingRecord', 'TrainerVerification', 'TrainerVerification INTEGER DEFAULT 0');
ensureColumn('TrainingRecord', 'LearningOutcome', 'LearningOutcome TEXT');
ensureColumn('TrainingRecord', 'TrainerID', 'TrainerID INTEGER');
ensureColumn('TrainingRecord', 'DurationMinutes', 'DurationMinutes INTEGER DEFAULT 0');

// Training lookup tables
run(`CREATE TABLE IF NOT EXISTS TrainingUnit (
  TrainingUnitID INTEGER PRIMARY KEY AUTOINCREMENT,
  Code TEXT,
  Name TEXT NOT NULL,
  TrainingPackage TEXT NOT NULL,
  Category TEXT,
  IsActive INTEGER DEFAULT 1
)`);

run(`CREATE TABLE IF NOT EXISTS Trainer (
  TrainerID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL,
  Qualifications TEXT,
  Email TEXT,
  Phone TEXT,
  IsTrainer INTEGER DEFAULT 0,
  IsActive INTEGER DEFAULT 1
)`);

run(`CREATE TABLE IF NOT EXISTS TrainingAttendee (
  AttendeeID INTEGER PRIMARY KEY AUTOINCREMENT,
  TrainingID INTEGER NOT NULL,
  TrainerID INTEGER NOT NULL,
  UNIQUE(TrainingID, TrainerID)
)`);

ensureColumn('Trainer', 'IsTrainer', 'IsTrainer INTEGER DEFAULT 1');

run(`CREATE TABLE IF NOT EXISTS CPDType (
  CPDTypeID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL,
  IsActive INTEGER DEFAULT 1
)`);

run(`CREATE TABLE IF NOT EXISTS ESOCertUnit (
  UnitID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL UNIQUE,
  DisplayName TEXT,
  GroupName TEXT DEFAULT 'Standard',
  SortOrder INTEGER DEFAULT 0,
  IsActive INTEGER DEFAULT 1
)`);

// Document library â€” multi-use documents (not patient-specific)
run(`CREATE TABLE IF NOT EXISTS Document (
  DocumentID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Title        TEXT NOT NULL,
  Description  TEXT,
  Category     TEXT DEFAULT 'General',
  FilePath     TEXT NOT NULL,
  FileName     TEXT NOT NULL,
  MimeType     TEXT,
  FileSize     INTEGER DEFAULT 0,
  UploadedAt   TEXT DEFAULT CURRENT_TIMESTAMP,
  UploadedBy   TEXT,
  IsActive     INTEGER DEFAULT 1
)`);


// Seed TrainingUnit from hardcoded list (INSERT OR IGNORE on Name+Package)
const seedUnits = [
  { code: 'HLTAID011', name: 'HLTAID011 Provide first aid', pkg: 'HLT' },
  { code: 'HLTAID014', name: 'HLTAID014 Provide Advanced First Aid', pkg: 'HLT' },
  { code: 'HLT41120',  name: 'HLT41120 Cert IV in Health Care', pkg: 'HLT' },
  { code: 'HLTPAL005', name: 'HLTPAL005 Drug and Alcohol Testing', pkg: 'HLT' },
  { code: '',          name: 'Advanced Life Support / RN / PARA', pkg: 'HLT' },
  { code: '',          name: 'Mental Health and wellbeing', pkg: 'HLT' },
  { code: '',          name: 'Clinical Administration', pkg: 'HLT' },
  { code: 'PUAEQU001', name: 'PUAEQU001 Prepare maintain and test response equipment', pkg: 'PUA' },
  { code: 'PUAFIR204', name: 'PUAFIR204 Respond to Wildfire', pkg: 'PUA' },
  { code: 'PUAFIR207', name: 'PUAFIR207 Operate BA open circuit', pkg: 'PUA' },
  { code: 'PUAFIR303', name: 'PUAFIR303 Suppress Wildfire', pkg: 'PUA' },
  { code: 'PUAFIR306', name: 'PUAFIR306 Identify detect and monitor HAZMAT at an incident', pkg: 'PUA' },
  { code: 'PUAFIR309', name: 'PUAFIR309 Operate Pumps', pkg: 'PUA' },
  { code: 'PUAFIR324', name: 'PUAFIR324 Render HAZMAT safe', pkg: 'PUA' },
  { code: 'PUASAR022', name: 'PUASAR022 Participate in a rescue operation', pkg: 'PUA' },
  { code: 'PUASAR024', name: 'PUASAR024 Undertake Road Crash Rescue', pkg: 'PUA' },
  { code: 'PUASAR025', name: 'PUASAR025 Undertake CS Rescue', pkg: 'PUA' },
  { code: 'PUASAR032', name: 'PUASAR032 Undertake Vertical Rescue', pkg: 'PUA' },
  { code: 'RIICOM201D', name: 'RIICOM201D Communicate in the workplace', pkg: 'RII' },
  { code: 'RIIERR201E', name: 'RIIERR201E Conduct Fire Team operations', pkg: 'RII' },
  { code: 'RIIERR301E', name: 'RIIERR301E Respond to worksite incidents', pkg: 'RII' },
  { code: 'RIIERR302E', name: 'RIIERR302E Respond to local emergencies and incidents', pkg: 'RII' },
  { code: 'RIIRIS301E', name: 'RIIRIS301E Apply risk management processes', pkg: 'RII' },
  { code: 'RIIWHS201D', name: 'RIIWHS201D Work Safely and follow WHS policies and procedures', pkg: 'RII' },
  { code: '',           name: 'AIIMS - Emergency Response Planning', pkg: 'N/A' },
  { code: '',           name: 'Site Based Familiarisations', pkg: 'N/A' },
];
for (const u of seedUnits) {
  try { run(`INSERT OR IGNORE INTO TrainingUnit (Code, Name, TrainingPackage) VALUES (?, ?, ?)`, [u.code || '', u.name, u.pkg]); } catch {}
}

// Seed Driving Competency units into TrainingUnit if not present
const drivingUnits = [
  { code: 'PUAVEH001', name: 'PUAVEH001 Drive under operational conditions', pkg: 'PUA' },
  { code: 'HLTOUT007', name: 'HLTOUT007 Transport Non-Emergency Patients Under Operational Conditions', pkg: 'HLT' },
  { code: 'HLTOUT006', name: 'HLTOUT006 Transport Emergency Patients', pkg: 'HLT' },
];
for (const u of drivingUnits) {
  try { run(`INSERT OR IGNORE INTO TrainingUnit (Code, Name, TrainingPackage) VALUES (?, ?, ?)`, [u.code, u.name, u.pkg]); } catch {}
}

// â”€â”€ TrainingUnit dedup + UNIQUE constraint migration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Remove exact duplicate rows (same Name+TrainingPackage), keep lowest ID
try {
  const unitDupes = query(`
    SELECT MIN(TrainingUnitID) as keepId, Name, TrainingPackage, COUNT(*) as cnt
    FROM TrainingUnit
    GROUP BY LOWER(Name), TrainingPackage
    HAVING COUNT(*) > 1
  `);
  for (const d of unitDupes) {
    run(`DELETE FROM TrainingUnit WHERE LOWER(Name)=LOWER(?) AND TrainingPackage=? AND TrainingUnitID != ?`,
      [d.Name, d.TrainingPackage, d.keepId]);
  }
} catch (e) { logger.warn('TrainingUnit dedup migration', { error: e.message }); }

// Recreate TrainingUnit with UNIQUE(Name, TrainingPackage) if not already present
try {
  run(`CREATE TABLE IF NOT EXISTS TrainingUnit_new (
    TrainingUnitID INTEGER PRIMARY KEY AUTOINCREMENT,
    Code TEXT,
    Name TEXT NOT NULL,
    TrainingPackage TEXT NOT NULL,
    Category TEXT,
    IsActive INTEGER DEFAULT 1,
    UNIQUE(Name, TrainingPackage)
  )`);
  const hasUnique = queryOne(`SELECT sql FROM sqlite_master WHERE type='table' AND name='TrainingUnit'`);
  if (hasUnique && !hasUnique.sql.includes('UNIQUE')) {
    exec(`INSERT OR IGNORE INTO TrainingUnit_new (TrainingUnitID, Code, Name, TrainingPackage, Category, IsActive)
      SELECT TrainingUnitID, Code, Name, TrainingPackage, Category, IsActive FROM TrainingUnit`);
    exec(`DROP TABLE TrainingUnit`);
    exec(`ALTER TABLE TrainingUnit_new RENAME TO TrainingUnit`);
  } else {
    exec(`DROP TABLE IF EXISTS TrainingUnit_new`);
  }
} catch (e) { logger.warn('TrainingUnit UNIQUE migration', { error: e.message }); }

// Seed CPDType
const seedCPDTypes = [
  'Educational activity', 'Training/skills practice', 'Scenario simulation',
  'Team training', 'Self-directed learning', 'Professional issues',
];
for (const t of seedCPDTypes) {
  try { run(`INSERT OR IGNORE INTO CPDType (Name) VALUES (?)`, [t]); } catch {}
}

// Seed ESO Certificate Units (INSERT OR IGNORE on Name)
const seedESOUnits = [
  { name: 'Advanced Life Support / RN / PARA',                              group: 'Standard',             sort: 1 },
  { name: 'AIIMS - Emergency Response Planning',                            group: 'Standard',             sort: 2 },
  { name: 'HLT41120 Cert IV in Health Care',                                group: 'Standard',             sort: 3 },
  { name: 'HLTAID011 Provide first aid',                                    group: 'Standard',             sort: 4 },
  { name: 'HLTAID014 Provide Advanced First Aid',                           group: 'Standard',             sort: 5 },
  { name: 'HLTPAL005 Drug and Alcohol Testing',                             group: 'Standard',             sort: 6 },
  { name: 'PUAEQU001 Prepare maintain and test response equipment',         group: 'Standard',             sort: 7 },
  { name: 'PUAFIR204 Respond to Wildfire',                                  group: 'Standard',             sort: 8 },
  { name: 'PUAFIR207 Operate BA open circuit',                              group: 'Standard',             sort: 9 },
  { name: 'PUAFIR303 Suppress Wildfire',                                    group: 'Standard',             sort: 10 },
  { name: 'PUAFIR306 Identify detect and monitor HAZMAT at an incident',    group: 'Standard',             sort: 11 },
  { name: 'PUAFIR309 Operate Pumps',                                        group: 'Standard',             sort: 12 },
  { name: 'PUAFIR324 Render HAZMAT safe',                                   group: 'Standard',             sort: 13 },
  { name: 'PUASAR022 Participate in a rescue operation',                    group: 'Standard',             sort: 14 },
  { name: 'PUASAR024 Undertake Road Crash Rescue',                          group: 'Standard',             sort: 15 },
  { name: 'PUASAR025 Undertake CS Rescue',                                  group: 'Standard',             sort: 16 },
  { name: 'PUASAR032 Undertake Vertical Rescue',                            group: 'Standard',             sort: 17 },
  { name: 'RIICOM201D Communicate in the workplace',                        group: 'Standard',             sort: 18 },
  { name: 'RIIERR201E Conduct Fire Team operations',                        group: 'Standard',             sort: 19 },
  { name: 'RIIERR301E Respond to worksite incidents',                       group: 'Standard',             sort: 20 },
  { name: 'RIIERR302E Respond to local emergencies and incidents',          group: 'Standard',             sort: 21 },
  { name: 'RIIRIS301E Apply risk management processes',                     group: 'Standard',             sort: 22 },
  { name: 'RIIWHS201D Work Safely and follow WHS policies and procedures',  group: 'Standard',             sort: 23 },
  { name: 'Mental Health and wellbeing',                                    group: 'Standard',             sort: 24 },
  { name: 'PUAVEH001 Drive under operational conditions',                   group: 'Driving Competency',   sort: 25 },
  { name: 'HLTOUT007 Transport Non-Emergency Patients Under Operational Conditions', group: 'Driving Competency', sort: 25 },
  { name: 'HLTOUT006 Transport Emergency Patients',                         group: 'Driving Competency',   sort: 25 },
];
for (const u of seedESOUnits) {
  try {
    const exists = queryOne('SELECT 1 FROM ESOCertUnit WHERE Name = ?', [u.name]);
    if (!exists) run(`INSERT INTO ESOCertUnit (Name, GroupName, SortOrder) VALUES (?, ?, ?)`, [u.name, u.group, u.sort]);
  } catch {}
}
// Remove any duplicates (keep lowest ID per name)
try { run(`DELETE FROM ESOCertUnit WHERE UnitID NOT IN (SELECT MIN(UnitID) FROM ESOCertUnit GROUP BY Name)`); } catch {}

saveDb();

// ============================================
// FILE UPLOAD CONFIGURATION
// ============================================

const UPLOADS_DIR = join(__dirname, 'uploads');
const TEST_DOCS_DIR = join(UPLOADS_DIR, 'test-documents');

// Ensure upload directories exist
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
if (!existsSync(TEST_DOCS_DIR)) mkdirSync(TEST_DOCS_DIR, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEST_DOCS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept PDFs, images, and common document types
  const allowedTypes = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, images, and Word documents are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

// ============================================
// OPTIONAL FRONTEND HOSTING
// ============================================

if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_DIST_PATH));
  app.get('/', (req, res) => {
    try {
      res.sendFile(join(FRONTEND_DIST_PATH, 'index.html'));
    } catch {
      res.status(500).send('Frontend not built');
    }
  });
}

// ============================================
// EMPLOYER CLASSIFICATION HELPER
// ============================================
// Get configured employer categories from admin settings
function getEmployerCategories() {
  try {
    const settings = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'admin'`);
    if (settings?.SettingValue) {
      const parsed = JSON.parse(settings.SettingValue);
      if (parsed.employerCategories && parsed.employerCategories.length >= 2) {
        return parsed.employerCategories;
      }
    }
  } catch (e) {}
  // Default categories if not configured
  return ['Employee', 'Contractor'];
}

// Rule: If company name contains "Saipem" or "Clough" (case-insensitive) = First category (Employee)
// Otherwise = Second category (Contractor)
const EMPLOYEE_PATTERNS = [/saipem/i, /clough/i, /scjv/i];

function classifyEmployer(companyName) {
  const categories = getEmployerCategories();
  if (!companyName) return categories[1]; // Default to second category (Contractor)
  for (const pattern of EMPLOYEE_PATTERNS) {
    if (pattern.test(companyName)) {
      return categories[0]; // First category (Employee)
    }
  }
  return categories[1]; // Second category (Contractor)
}

// Expand a list of employer IDs to include all employers that have been merged INTO them.
// This ensures that filtering by a canonical employer also captures people whose EmployerID
// still points at an old merged-away employer record.
function expandEmployerIds(ids) {
  if (!ids || ids.length === 0) return ids;
  const canonicalSet = new Set(ids.map(Number));
  // Find all employers that have MergedIntoEmployerID pointing at any of our selected IDs
  const merged = query(
    `SELECT EmployerID FROM Employer WHERE MergedIntoEmployerID IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  merged.forEach(r => canonicalSet.add(r.EmployerID));
  return [...canonicalSet];
}

// Build an employer filter string from a comma-separated "employers" query param,
// expanding merged children so canonical-employer selection captures all linked people.
function buildEmployerFilter(employersParam) {
  if (!employersParam) return { filter: '', ids: null };
  const raw = employersParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
  if (!raw.length) return { filter: '', ids: null };
  const ids = expandEmployerIds(raw);
  return { filter: `AND p.EmployerID IN (${ids.join(',')})`, ids };
}

// Resolve employer - if merged, return the canonical employer
function resolveEmployer(employerId) {
  if (!employerId) return null;
  let employer = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [employerId]);
  if (employer?.MergedIntoEmployerID) {
    employer = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [employer.MergedIntoEmployerID]);
  }
  return employer;
}

// Find employer by name, checking CompanyName, AlsoKnownAs, and EmployerAlias table
function findEmployerByName(companyName) {
  if (!companyName || companyName.trim() === '') return null;
  const name = companyName.trim();
  const lowerName = name.toLowerCase();
  
  // Check primary CompanyName (case-insensitive)
  let employer = queryOne('SELECT * FROM Employer WHERE LOWER(CompanyName) = LOWER(?) AND (MergedIntoEmployerID IS NULL OR MergedIntoEmployerID = 0)', [name]);
  if (employer) return employer;
  
  // Check AlsoKnownAs field (comma-separated aliases, case-insensitive)
  const allEmployers = query('SELECT * FROM Employer WHERE (MergedIntoEmployerID IS NULL OR MergedIntoEmployerID = 0)');
  for (const emp of allEmployers) {
    if (emp.AlsoKnownAs) {
      const aliases = emp.AlsoKnownAs.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
      if (aliases.includes(lowerName)) {
        return emp;
      }
    }
  }
  
  // Check EmployerAlias table
  const aliasMatch = queryOne(`
    SELECT e.* FROM Employer e
    JOIN EmployerAlias ea ON e.EmployerID = ea.EmployerID
    WHERE LOWER(ea.AliasName) = LOWER(?) AND ea.IsActive = 1
    AND (e.MergedIntoEmployerID IS NULL OR e.MergedIntoEmployerID = 0)
  `, [name]);
  if (aliasMatch) return aliasMatch;
  
  return null;
}

// Get or create employer by name, with automatic classification and alias checking
function getOrCreateEmployer(companyName) {
  if (!companyName || companyName.trim() === '') return null;
  
  const name = companyName.trim();
  
  // Check if exists (including aliases)
  let employer = findEmployerByName(name);
  
  if (!employer) {
    // Create new employer with automatic classification
    const category = classifyEmployer(name);
    const result = run(`
      INSERT INTO Employer (CompanyName, Category, IsActive)
      VALUES (?, ?, 1)
    `, [name, category]);
    
    employer = { EmployerID: result.lastInsertRowid, CompanyName: name, Category: category };
  }
  
  // If this employer was merged into another, return the canonical one
  if (employer?.MergedIntoEmployerID) {
    return resolveEmployer(employer.EmployerID);
  }
  
  return employer;
}

// Create default admin if not exists, or reset password to current ADMIN_PASSWORD
const adminRoleId = queryOne(`SELECT RoleID FROM Role WHERE LOWER(Name) = 'admin' OR LOWER(Name) = 'administrator' LIMIT 1`)?.RoleID || 1;
const adminRow = queryOne("SELECT COUNT(*) as count FROM User WHERE Username = 'admin'");
const adminCount = adminRow?.count ?? 0;
if (ADMIN_PASSWORD) {
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  if (adminCount === 0) {
    run(`INSERT INTO User (Username, PasswordHash, FullName, FirstName, LastName, Email, RoleID, IsClinician)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ['admin', adminHash, 'System Administrator', 'System', 'Administrator', 'admin@example.com', adminRoleId]);
    logger.startup('Default admin user created');
  } else {
    run(`UPDATE User SET PasswordHash = ?, RoleID = ? WHERE Username = 'admin'`, [adminHash, adminRoleId]);
    logger.startup('Admin password updated');
  }
} else if (adminCount === 0) {
  logger.warn('No ADMIN_PASSWORD set and no admin user exists. Set ADMIN_PASSWORD env var to create admin.');
}

// ── RBAC auth middleware ──────────────────────────────────────────────────
// When SECURE_LOGIN is disabled (default), attaches a guest context so route
// handlers can reference req.user without crashing, but never blocks access.
const authMiddleware = (req, res, next) => {
  if (!SECURE_LOGIN) {
    req.user = req.user || { userId: null, username: 'guest', role: 'admin', permissions: ['all'] };
    return next();
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Role check helper — returns 403 if user lacks required role/permission
const requireRole = (...roles) => (req, res, next) => {
  if (!SECURE_LOGIN) return next();
  const userRole = (req.user?.role || '').toLowerCase();
  const perms = req.user?.permissions || [];
  if (perms.includes('all') || roles.map(r => r.toLowerCase()).includes(userRole)) return next();
  res.status(403).json({ error: 'Insufficient permissions' });
};
forceSaveDb(); // initial flush after schema setup

app.use(cors());
app.use(express.json());
app.use(requestLogger);

if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_DIST_PATH));
}

// Audit logging helper (userId is optional now)
function logAudit(userId, action, recordType, recordId, description, oldValues = null, newValues = null) {
  run(`INSERT INTO AuditLog (UserID, Action, RecordType, RecordID, Description, OldValues, NewValues)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, recordType, recordId, description,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null]);
  logger.audit(action, recordType, recordId, description, { userId });
}

// Generate test number
function generateTestNumber() {
  const date = new Date();
  const prefix = `AOD-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const last = queryOne(`SELECT TestNumber FROM AODTest WHERE TestNumber LIKE ? ORDER BY TestNumber DESC LIMIT 1`, [`${prefix}%`]);
  const seq = last ? parseInt(last.TestNumber.split('-').pop()) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3,'0')}`;
}

// Seed default compliance settings if not present
const COMPLIANCE_DEFAULTS = {
  'require_coc_uploads': 'false',
};
for (const [key, value] of Object.entries(COMPLIANCE_DEFAULTS)) {
  const existing = queryOne('SELECT ConfigKey FROM SystemConfig WHERE ConfigKey = ?', [key]);
  if (!existing) run('INSERT INTO SystemConfig (ConfigKey, ConfigValue, Description) VALUES (?, ?, ?)',
    [key, value, 'Require Chain of Custody PDF uploads for non-negative results']);
}

// Public config (non-sensitive settings readable without admin auth)
app.get('/api/config', (req, res) => {
  const PUBLIC_KEYS = ['require_coc_uploads'];
  const rows = query(`SELECT ConfigKey, ConfigValue FROM SystemConfig WHERE ConfigKey IN (${PUBLIC_KEYS.map(() => '?').join(',')})`, PUBLIC_KEYS);
  const config = {};
  for (const row of rows) config[row.ConfigKey] = row.ConfigValue;
  // Fill in defaults for any missing keys
  for (const [k, v] of Object.entries(COMPLIANCE_DEFAULTS)) if (!(k in config)) config[k] = v;
  res.json(config);
});

// ============================================
// AUTH ROUTES
// ============================================

// Returns whether login is required on this server
app.get('/api/auth/config', (req, res) => {
  res.json({ secureLogin: SECURE_LOGIN });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = queryOne(`
    SELECT u.*, r.Name as RoleName, r.Permissions
    FROM User u
    LEFT JOIN Role r ON u.RoleID = r.RoleID
    WHERE u.Username = ? AND u.IsActive = 1
  `, [username]);

  if (!user || !bcrypt.compareSync(password, user.PasswordHash)) {
    logger.auth('Login failed', false, { username, ip: req.ip });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  run('UPDATE User SET LastLogin = CURRENT_TIMESTAMP WHERE UserID = ?', [user.UserID]);
  logAudit(user.UserID, 'LOGIN', 'User', user.UserID, `User ${username} logged in`);
  logger.auth('Login', true, { username, ip: req.ip });

  const roleName = (user.RoleName || 'user').toLowerCase();
  const token = jwt.sign({
    userId: user.UserID,
    username: user.Username,
    role: roleName,
    isClinician: !!user.IsClinician,
    permissions: JSON.parse(user.Permissions || '[]')
  }, JWT_SECRET, { expiresIn: '8h' });

  const displayName = user.DisplayName || (user.FirstName && user.LastName ? `${user.FirstName.charAt(0)} ${user.LastName}` : user.FullName || user.Username);

  res.json({
    token,
    user: {
      id: user.UserID,
      username: user.Username,
      fullName: user.FullName,
      firstName: user.FirstName,
      lastName: user.LastName,
      displayName,
      role: roleName,
      isClinician: !!user.IsClinician,
      uniqueId: user.UniqueID
    }
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const user = queryOne(`
      SELECT u.UserID, u.Username, u.FullName, u.FirstName, u.LastName, u.Email,
             u.IsClinician, u.UniqueID, u.Credentials, u.DisplayName,
             r.Name as RoleName, r.Permissions
      FROM User u LEFT JOIN Role r ON u.RoleID = r.RoleID
      WHERE u.UserID = ? AND u.IsActive = 1
    `, [payload.userId]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const displayName = user.DisplayName || (user.FirstName && user.LastName ? `${user.FirstName.charAt(0)} ${user.LastName}` : user.FullName || user.Username);
    res.json({ ...user, role: (user.RoleName || 'user').toLowerCase(), displayName });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ============================================
// TEST TYPE CRUD ROUTES
// ============================================

app.get('/api/test-types', (req, res) => {
  try { res.json(query('SELECT * FROM TestType ORDER BY Name')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/test-types', (req, res) => {
  const { name, code, description } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  try {
    const r = run('INSERT INTO TestType (Name, Code, Description, IsActive) VALUES (?, ?, ?, 1)',
      [name.trim(), code.trim().toUpperCase(), description || null]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/test-types/:id', (req, res) => {
  const { name, code, description, isActive } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  try {
    run('UPDATE TestType SET Name=?, Code=?, Description=?, IsActive=? WHERE TestTypeID=?',
      [name.trim(), code.trim().toUpperCase(), description || null, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/test-types/:id', (req, res) => {
  try {
    run('UPDATE TestType SET IsActive=0 WHERE TestTypeID=?', [req.params.id]);
    res.json({ message: 'Deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// HEALTH & MONITORING
// ============================================

// Health check endpoint (for monitoring and tests)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================
// LOOKUP DATA ROUTES
// ============================================

app.get('/api/lookups', (req, res) => {
  const sexes = query('SELECT * FROM Sex');
  const workerTypes = query('SELECT * FROM WorkerType');
  const testTypes = query('SELECT * FROM TestType WHERE IsActive = 1');
  const resultClassifications = query('SELECT * FROM ResultClassification');
  const roles = query('SELECT RoleID, Name, Description FROM Role');
  const config = query('SELECT ConfigKey, ConfigValue FROM SystemConfig');
  
  res.json({ sexes, workerTypes, testTypes, resultClassifications, roles, config });
});

// ============================================
// EMPLOYER ROUTES
// ============================================

app.get('/api/employers', (req, res) => {
  const { category, active } = req.query;
  let sql = `SELECT e.*, (SELECT COUNT(*) FROM Person WHERE EmployerID = e.EmployerID) as WorkerCount
    FROM Employer e WHERE 1=1`;
  const params = [];
  if (active !== undefined) {
    sql += ' AND e.IsActive = ?';
    params.push(active === 'false' ? 0 : 1);
  } else {
    sql += ' AND e.IsActive = 1';
  }
  if (category) {
    sql += ' AND e.Category = ?';
    params.push(category);
  }
  sql += ' ORDER BY e.Category, e.CompanyName';
  res.json(query(sql, params));
});

app.post('/api/employers', (req, res) => {
  const { companyName, category, contactName, contactEmail, contactPhone, address } = req.body;
  const result = run(`
    INSERT INTO Employer (CompanyName, Category, ContactName, ContactEmail, ContactPhone, Address)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [companyName, category || 'Contractor', contactName, contactEmail, contactPhone, address]);
  logAudit(null, 'CREATE', 'Employer', result.lastInsertRowid, `Created employer: ${companyName}`);
  res.json({ id: result.lastInsertRowid, message: 'Employer created' });
});

app.put('/api/employers/:id', (req, res) => {
  const { companyName, category, contactName, contactEmail, contactPhone, address, isActive } = req.body;
  
  const old = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [req.params.id]);
  
  run(`
    UPDATE Employer SET CompanyName=?, Category=?, ContactName=?, ContactEmail=?, ContactPhone=?, Address=?, IsActive=?, UpdatedAt=CURRENT_TIMESTAMP
    WHERE EmployerID=?
  `, [companyName, category, contactName, contactEmail, contactPhone, address, isActive ?? 1, req.params.id]);
  
  logAudit(null, 'UPDATE', 'Employer', req.params.id, `Updated employer: ${companyName}`, old, req.body);
  res.json({ message: 'Employer updated' });
});

// Merge employers - merge source employer(s) into target employer
app.post('/api/employers/merge', (req, res) => {
  const { targetEmployerId, sourceEmployerIds, addAlias } = req.body;
  
  if (!targetEmployerId || !sourceEmployerIds || !Array.isArray(sourceEmployerIds) || sourceEmployerIds.length === 0) {
    return res.status(400).json({ error: 'targetEmployerId and sourceEmployerIds array are required' });
  }
  
  const target = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [targetEmployerId]);
  if (!target) return res.status(404).json({ error: 'Target employer not found' });
  
  try {
    for (const sourceId of sourceEmployerIds) {
      if (sourceId === targetEmployerId) continue; // Can't merge into self
      
      const source = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [sourceId]);
      if (!source) continue;
      
      // Update all persons to point to target
      run('UPDATE Person SET EmployerID = ? WHERE EmployerID = ?', [targetEmployerId, sourceId]);
      
      // Update all AODTests to point to target
      run('UPDATE AODTest SET PersonID = (SELECT PersonID FROM Person WHERE EmployerID = ?) WHERE PersonID IN (SELECT PersonID FROM Person WHERE EmployerID = ?)', [targetEmployerId, sourceId]);
      
      // Mark source as merged into target
      run('UPDATE Employer SET MergedIntoEmployerID = ?, IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE EmployerID = ?', 
        [targetEmployerId, sourceId]);
      
      // Add source company name as alias if requested
      if (addAlias !== false) {
        // Add to AlsoKnownAs on target
        const currentAKA = target.AlsoKnownAs || '';
        const newAKA = currentAKA ? `${currentAKA}, ${source.CompanyName}` : source.CompanyName;
        run('UPDATE Employer SET AlsoKnownAs = ? WHERE EmployerID = ?', [newAKA, targetEmployerId]);
        
        // Also add as formal alias
        try {
          run('INSERT INTO EmployerAlias (EmployerID, AliasName) VALUES (?, ?)', [targetEmployerId, source.CompanyName]);
        } catch (e) { /* Alias may already exist */ }
      }
      
      logAudit(null, 'MERGE', 'Employer', sourceId, `Merged ${source.CompanyName} into ${target.CompanyName}`, source, { targetId: targetEmployerId });
    }
    
    res.json({ message: 'Employers merged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add alias to an employer
app.post('/api/employers/:id/aliases', (req, res) => {
  const { aliasName } = req.body;
  if (!aliasName || !aliasName.trim()) {
    return res.status(400).json({ error: 'aliasName is required' });
  }
  
  const employer = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [req.params.id]);
  if (!employer) return res.status(404).json({ error: 'Employer not found' });
  
  try {
    run('INSERT INTO EmployerAlias (EmployerID, AliasName) VALUES (?, ?)', [req.params.id, aliasName.trim()]);
    
    // Also update AlsoKnownAs field
    const currentAKA = employer.AlsoKnownAs || '';
    const aliases = currentAKA.split(',').map(a => a.trim()).filter(Boolean);
    if (!aliases.includes(aliasName.trim())) {
      const newAKA = currentAKA ? `${currentAKA}, ${aliasName.trim()}` : aliasName.trim();
      run('UPDATE Employer SET AlsoKnownAs = ? WHERE EmployerID = ?', [newAKA, req.params.id]);
    }
    
    res.json({ message: 'Alias added' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Alias already exists for this employer' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Remove alias from an employer
app.delete('/api/employers/:id/aliases/:aliasId', (req, res) => {
  const alias = queryOne('SELECT * FROM EmployerAlias WHERE AliasID = ? AND EmployerID = ?', [req.params.aliasId, req.params.id]);
  if (!alias) return res.status(404).json({ error: 'Alias not found' });
  
  run('DELETE FROM EmployerAlias WHERE AliasID = ?', [req.params.aliasId]);
  
  // Update AlsoKnownAs field
  const employer = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [req.params.id]);
  if (employer?.AlsoKnownAs) {
    const aliases = employer.AlsoKnownAs.split(',').map(a => a.trim()).filter(a => a !== alias.AliasName);
    run('UPDATE Employer SET AlsoKnownAs = ? WHERE EmployerID = ?', [aliases.join(', '), req.params.id]);
  }
  
  res.json({ message: 'Alias removed' });
});

// Get all aliases for an employer
app.get('/api/employers/:id/aliases', (req, res) => {
  const aliases = query('SELECT * FROM EmployerAlias WHERE EmployerID = ? AND IsActive = 1 ORDER BY AliasName', [req.params.id]);
  res.json(aliases);
});

// Unmerge an employer (restore a merged employer)
app.post('/api/employers/:id/unmerge', (req, res) => {
  const employer = queryOne('SELECT * FROM Employer WHERE EmployerID = ?', [req.params.id]);
  if (!employer) return res.status(404).json({ error: 'Employer not found' });
  if (!employer.MergedIntoEmployerID) return res.status(400).json({ error: 'Employer is not merged' });
  
  run('UPDATE Employer SET MergedIntoEmployerID = NULL, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE EmployerID = ?', [req.params.id]);
  
  logAudit(null, 'UNMERGE', 'Employer', req.params.id, `Restored ${employer.CompanyName} as independent employer`);
  res.json({ message: 'Employer restored' });
});

// Get merged employers list
app.get('/api/employers/merged', (req, res) => {
  const merged = query(`
    SELECT e.*, target.CompanyName as MergedIntoName
    FROM Employer e
    JOIN Employer target ON e.MergedIntoEmployerID = target.EmployerID
    WHERE e.MergedIntoEmployerID IS NOT NULL
    ORDER BY e.CompanyName
  `);
  res.json(merged);
});

// ============================================
// PERSON (WORKER) ROUTES
// ============================================

// Helper: extract surname (last space-separated word)
const getSurname = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toUpperCase();
};

app.get('/api/persons', (req, res) => {
  const { employerId, workerTypeId, search, activeOnly } = req.query;

  let sql = `
    SELECT p.*, e.CompanyName as EmployerName, wt.Name as WorkerTypeName, s.Name as SexName,
           (SELECT COUNT(*) FROM AODTest WHERE PersonID = p.PersonID) as TestCount
    FROM Person p
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN Sex s ON p.SexID = s.SexID
    WHERE 1=1
  `;
  const params = [];

  if (activeOnly !== 'false') { sql += ' AND p.IsActive = 1'; }
  if (employerId) { sql += ' AND p.EmployerID = ?'; params.push(employerId); }
  if (workerTypeId) { sql += ' AND p.WorkerTypeID = ?'; params.push(workerTypeId); }

  if (search) {
    // Use flexible name search that handles both "First Last" and "Last, First" formats
    const namePatterns = buildNameSearchPatterns(search);
    if (namePatterns && namePatterns.length > 0) {
      const nameSearch = buildNameSearchSQL('p.FullName', namePatterns);
      sql += ` AND (${nameSearch.sql} OR LOWER(p.BadgeNumber) LIKE LOWER(?) OR LOWER(p.EmployeeNumber) LIKE LOWER(?))`;
      params.push(...nameSearch.params, `%${search}%`, `%${search}%`);
    } else {
      sql += ' AND (p.FullName LIKE ? OR p.BadgeNumber LIKE ? OR p.EmployeeNumber LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
  }

  sql += ' ORDER BY p.FullName';
  res.json(query(sql, params));
});

app.post('/api/persons/import', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });

  const sexes       = query('SELECT SexID, Name FROM Sex');
  const employers   = query('SELECT EmployerID, CompanyName FROM Employer');
  const workerTypes = query('SELECT WorkerTypeID, Name FROM WorkerType');

  const findByName = (arr, nameField, val) =>
    !val ? null : arr.find(r => r[nameField]?.toLowerCase() === val.trim().toLowerCase());

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  rows.forEach((row, idx) => {
    const fullName = (row.FullName || row['Full Name'] || '').trim();
    if (!fullName) { errors.push({ row: idx + 1, error: 'Missing FullName' }); skipped++; return; }

    const dateOfBirth    = (row.DateOfBirth    || row['Date of Birth'] || '').trim() || null;
    const badgeNumber    = (row.BadgeNumber    || '').trim() || null;
    const employeeNumber = (row.EmployeeNumber || '').trim() || null;
    const department     = (row.Department     || '').trim() || null;
    const position       = (row.Position       || '').trim() || null;
    const email          = (row.Email          || '').trim() || null;
    const phone          = (row.Phone          || '').trim() || null;
    const isActive       = ['0','false','inactive','no'].includes(String(row.IsActive ?? '1').toLowerCase()) ? 0 : 1;

    const sexRow = findByName(sexes, 'Name', row.Sex);
    const sexId  = sexRow?.SexID || null;

    const empRow = findByName(employers, 'CompanyName', row.Employer);
    if (row.Employer && row.Employer.trim() && !empRow) {
      errors.push({ row: idx + 1, name: fullName, error: `Employer not found: "${row.Employer}"` });
      skipped++; return;
    }
    const employerId = empRow?.EmployerID || null;

    const wtRow      = findByName(workerTypes, 'Name', row.PatientType || row['Patient Type'] || row.WorkerType);
    const workerTypeId = wtRow?.WorkerTypeID || null;

    // Deduplicate: badge â†’ employee# â†’ name+DOB â†’ surname+DOB+employer â†’ name
    let existing = null;
    if (badgeNumber)    existing = queryOne('SELECT PersonID, FullName FROM Person WHERE BadgeNumber = ?', [badgeNumber]);
    if (!existing && employeeNumber) existing = queryOne('SELECT PersonID, FullName FROM Person WHERE EmployeeNumber = ?', [employeeNumber]);
    if (!existing && dateOfBirth)    existing = queryOne('SELECT PersonID, FullName FROM Person WHERE LOWER(FullName)=LOWER(?) AND DateOfBirth=?', [fullName, dateOfBirth]);
    if (!existing && dateOfBirth && employerId) {
      // surname + DOB + employer match (catches name variations like "J Smith" vs "John Smith")
      const surname = getSurname(fullName);
      if (surname.length > 1) {
        const surnameMatches = query(
          'SELECT PersonID, FullName FROM Person WHERE DateOfBirth=? AND EmployerID=? AND IsActive=1',
          [dateOfBirth, employerId]
        ).filter(p => getSurname(p.FullName) === surname);
        if (surnameMatches.length === 1) existing = surnameMatches[0];
      }
    }
    if (!existing)                   existing = queryOne('SELECT PersonID, FullName FROM Person WHERE LOWER(FullName)=LOWER(?)', [fullName]);

    try {
      if (existing) {
        run(`UPDATE Person SET FullName=?, DateOfBirth=?, SexID=?, EmployerID=?, WorkerTypeID=?,
             BadgeNumber=?, EmployeeNumber=?, Department=?, Position=?, Email=?, Phone=?, IsActive=?, UpdatedAt=CURRENT_TIMESTAMP
             WHERE PersonID=?`,
          [fullName, dateOfBirth, sexId, employerId, workerTypeId,
           badgeNumber, employeeNumber, department, position, email, phone, isActive, existing.PersonID]);
        updated++;
      } else {
        run(`INSERT INTO Person (FullName, DateOfBirth, SexID, EmployerID, WorkerTypeID, BadgeNumber, EmployeeNumber, Department, Position, Email, Phone, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [fullName, dateOfBirth, sexId, employerId, workerTypeId, badgeNumber, employeeNumber, department, position, email, phone, isActive]);
        created++;
      }
    } catch (e) {
      errors.push({ row: idx + 1, name: fullName, error: e.message });
      skipped++;
    }
  });

  logAudit(null, 'IMPORT', 'Person', null, `CSV import: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, errors, total: rows.length });
});

app.post('/api/persons', (req, res) => {
  const { fullName, dateOfBirth, sexId, employerId, workerTypeId, badgeNumber, employeeNumber, department, position, email, phone } = req.body;
  
  const result = run(`
    INSERT INTO Person (FullName, DateOfBirth, SexID, EmployerID, WorkerTypeID, BadgeNumber, EmployeeNumber, Department, Position, Email, Phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [fullName, dateOfBirth, sexId, employerId, workerTypeId, badgeNumber, employeeNumber, department, position, email, phone]);
  
  logAudit(null, 'CREATE', 'Person', result.lastInsertRowid, `Created person: ${fullName}`);
  res.json({ id: result.lastInsertRowid, message: 'Person created' });
});

app.put('/api/persons/:id', (req, res) => {
  const { fullName, dateOfBirth, sexId, employerId, workerTypeId, badgeNumber, employeeNumber, department, position, email, phone, isActive } = req.body;
  
  const old = queryOne('SELECT * FROM Person WHERE PersonID = ?', [req.params.id]);
  
  run(`
    UPDATE Person SET FullName=?, DateOfBirth=?, SexID=?, EmployerID=?, WorkerTypeID=?, BadgeNumber=?, EmployeeNumber=?, Department=?, Position=?, Email=?, Phone=?, IsActive=?, UpdatedAt=CURRENT_TIMESTAMP
    WHERE PersonID=?
  `, [fullName, dateOfBirth, sexId, employerId, workerTypeId, badgeNumber, employeeNumber, department, position, email, phone, isActive ?? 1, req.params.id]);
  
  logAudit(null, 'UPDATE', 'Person', req.params.id, `Updated person: ${fullName}`, old, req.body);
  res.json({ message: 'Person updated' });
});

// Returns merge recommendation: which of the two patients should be the "keep" record, and why
function getMergeRecommendation(a, b) {
  // Count records for each
  const aTests  = queryOne('SELECT COUNT(*) as n FROM AODTest WHERE PersonID = ?', [a.PersonID])?.n || 0;
  const bTests  = queryOne('SELECT COUNT(*) as n FROM AODTest WHERE PersonID = ?', [b.PersonID])?.n || 0;
  const aEvents = queryOne('SELECT COUNT(*) as n FROM PatientEvent WHERE PersonID = ?', [a.PersonID])?.n || 0;
  const bEvents = queryOne('SELECT COUNT(*) as n FROM PatientEvent WHERE PersonID = ?', [b.PersonID])?.n || 0;

  const reasons = [];
  // Priority order: DOB > Employer > record count (tests) > record count (events) > IsActive > PersonID (older = keep)
  if (a.DateOfBirth && !b.DateOfBirth) { reasons.push('A has a date of birth, B does not'); return { keepId: a.PersonID, dropId: b.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (b.DateOfBirth && !a.DateOfBirth) { reasons.push('B has a date of birth, A does not'); return { keepId: b.PersonID, dropId: a.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (a.EmployerID && !b.EmployerID)   { reasons.push('A has an employer, B does not'); return { keepId: a.PersonID, dropId: b.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (b.EmployerID && !a.EmployerID)   { reasons.push('B has an employer, A does not'); return { keepId: b.PersonID, dropId: a.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (aTests > bTests) { reasons.push(`A has more AOD tests (${aTests} vs ${bTests})`); return { keepId: a.PersonID, dropId: b.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (bTests > aTests) { reasons.push(`B has more AOD tests (${bTests} vs ${aTests})`); return { keepId: b.PersonID, dropId: a.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (aEvents > bEvents) { reasons.push(`A has more patient events (${aEvents} vs ${bEvents})`); return { keepId: a.PersonID, dropId: b.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (bEvents > aEvents) { reasons.push(`B has more patient events (${bEvents} vs ${aEvents})`); return { keepId: b.PersonID, dropId: a.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (a.IsActive && !b.IsActive) { reasons.push('A is active, B is not'); return { keepId: a.PersonID, dropId: b.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  if (b.IsActive && !a.IsActive) { reasons.push('B is active, A is not'); return { keepId: b.PersonID, dropId: a.PersonID, aTests, bTests, aEvents, bEvents, reasons }; }
  // Default: keep the older record (lower ID = created first)
  reasons.push('Records are equal â€” keeping the older entry');
  return { keepId: Math.min(a.PersonID, b.PersonID), dropId: Math.max(a.PersonID, b.PersonID), aTests, bTests, aEvents, bEvents, reasons };
}

app.get('/api/persons/:id/merge-preview', (req, res) => {
  const aId = parseInt(req.params.id);
  const bId = parseInt(req.query.withPersonId);
  if (!bId) return res.status(400).json({ error: 'withPersonId required' });
  const a = queryOne(`SELECT p.*, e.CompanyName as EmployerName FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID WHERE p.PersonID = ?`, [aId]);
  const b = queryOne(`SELECT p.*, e.CompanyName as EmployerName FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID WHERE p.PersonID = ?`, [bId]);
  if (!a || !b) return res.status(404).json({ error: 'Patient not found' });
  const rec = getMergeRecommendation(a, b);
  res.json({ a, b, recommendation: rec });
});

app.post('/api/persons/:id/merge', (req, res) => {
  const keepId = parseInt(req.params.id);
  const { sourcePersonId } = req.body;
  if (!sourcePersonId) return res.status(400).json({ error: 'sourcePersonId required' });
  const dropId = parseInt(sourcePersonId);
  if (keepId === dropId) return res.status(400).json({ error: 'Cannot merge a patient with themselves' });

  const keep = queryOne('SELECT * FROM Person WHERE PersonID = ?', [keepId]);
  const drop = queryOne('SELECT * FROM Person WHERE PersonID = ?', [dropId]);
  if (!keep) return res.status(404).json({ error: 'Target patient not found' });
  if (!drop) return res.status(404).json({ error: 'Source patient not found' });

  // Fill missing fields on the kept record from the dropped record
  const patch = {};
  if (!keep.DateOfBirth   && drop.DateOfBirth)   patch.DateOfBirth   = drop.DateOfBirth;
  if (!keep.EmployerID    && drop.EmployerID)     patch.EmployerID    = drop.EmployerID;
  if (!keep.SexID         && drop.SexID)          patch.SexID         = drop.SexID;
  if (!keep.WorkerTypeID  && drop.WorkerTypeID)   patch.WorkerTypeID  = drop.WorkerTypeID;
  if (!keep.BadgeNumber   && drop.BadgeNumber)    patch.BadgeNumber   = drop.BadgeNumber;
  if (!keep.EmployeeNumber && drop.EmployeeNumber) patch.EmployeeNumber = drop.EmployeeNumber;
  if (!keep.Department    && drop.Department)     patch.Department    = drop.Department;
  if (!keep.Position      && drop.Position)       patch.Position      = drop.Position;
  if (!keep.Email         && drop.Email)          patch.Email         = drop.Email;
  if (!keep.Phone         && drop.Phone)          patch.Phone         = drop.Phone;

  if (Object.keys(patch).length > 0) {
    const setClauses = Object.keys(patch).map(k => `${k} = ?`).join(', ');
    run(`UPDATE Person SET ${setClauses}, UpdatedAt = CURRENT_TIMESTAMP WHERE PersonID = ?`,
      [...Object.values(patch), keepId]);
  }

  // Move all related records from dropped â†’ kept
  run('UPDATE AODTest SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]);
  run('UPDATE PatientEvent SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]);
  run('UPDATE RandomTestEntry SET MatchedPersonID = ? WHERE MatchedPersonID = ?', [keepId, dropId]);
  try { run('UPDATE ScheduledTest SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]); } catch (_) {}
  try { run('UPDATE NonNegativeRecord SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]); } catch (_) {}
  try { run('UPDATE TrainingRecord SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]); } catch (_) {}
  try { run('UPDATE AttendanceRecord SET PersonID = ? WHERE PersonID = ?', [keepId, dropId]); } catch (_) {}

  run('UPDATE Person SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE PersonID = ?', [dropId]);
  const patchDesc = Object.keys(patch).length > 0 ? ` (filled: ${Object.keys(patch).join(', ')})` : '';
  logAudit(null, 'MERGE', 'Person', keepId, `Merged ${drop.FullName} (#${dropId}) into ${keep.FullName} (#${keepId})${patchDesc}`);
  res.json({ message: 'Patients merged successfully', keepId, dropId,
    fieldsFilled: Object.keys(patch),
    totalTests: queryOne('SELECT COUNT(*) as n FROM AODTest WHERE PersonID = ?', [keepId])?.n || 0 });
});

// Shared User SELECT — used by both clinician and user management routes
const USER_SELECT = `
  SELECT u.UserID, u.Username, u.FullName, u.FirstName, u.LastName, u.Email,
         u.UniqueID, u.IsClinician, u.Credentials, u.DisplayName,
         u.IsActive, u.LastLogin, u.CreatedAt,
         r.RoleID, r.Name as RoleName, LOWER(r.Name) as Role, r.Permissions
  FROM User u
  LEFT JOIN Role r ON u.RoleID = r.RoleID
`;

// ============================================
// CLINICIAN ROUTES
// ============================================
// Clinicians are now Users with IsClinician=1.
// These routes remain for backward-compat with forms/tests that use ClinicianID.
// Display name format: first initial + last name ("A Smith") when both parts exist.

const clinicianDisplayName = (u) => {
  if (u.FirstName && u.LastName) return `${u.FirstName.charAt(0)} ${u.LastName}`;
  return u.FullName || u.Username;
};

// Map a User row into the legacy Clinician shape
const userToClinician = (u) => ({
  ClinicianID: u.UserID,
  Name: clinicianDisplayName(u),
  FullName: u.FullName,
  FirstName: u.FirstName,
  LastName: u.LastName,
  EmployeeNumber: u.UniqueID,
  Credentials: u.Credentials,
  Email: u.Email,
  IsActive: u.IsActive,
  UserID: u.UserID,
  Role: u.Role,
  Username: u.Username,
});

app.get('/api/clinicians', (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  let sql = USER_SELECT + ' WHERE u.IsClinician = 1';
  if (!includeInactive) sql += ' AND u.IsActive = 1';
  sql += ' ORDER BY u.LastName, u.FirstName, u.FullName';
  res.json(query(sql).map(userToClinician));
});

app.get('/api/clinicians/export/csv', (req, res) => {
  try {
    const rows = query(USER_SELECT + " WHERE u.IsClinician = 1 AND u.IsActive = 1 ORDER BY u.LastName, u.FirstName");
    const headers = ['Name','EmployeeNumber','Credentials','Email'];
    const lines = [headers.join(','), ...rows.map(u => {
      const c = userToClinician(u);
      return [c.Name, c.EmployeeNumber || '', c.Credentials || '', c.Email || ''].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    })];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clinicians.csv"');
    res.send(lines.join('\r\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clinicians/:id', (req, res) => {
  const u = queryOne(USER_SELECT + ' WHERE u.UserID = ? AND u.IsClinician = 1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Clinician not found' });
  res.json(userToClinician(u));
});

app.post('/api/clinicians', (req, res) => {
  const { name, firstName, lastName, employeeNumber, credentials, email } = req.body;
  if (!name && !firstName && !lastName) return res.status(400).json({ error: 'Name is required' });

  const derivedFirst = firstName || (name ? name.split(/\s+/)[0] : '');
  const derivedLast  = lastName  || (name ? name.split(/\s+/).slice(1).join(' ') : '');
  const fullName     = name || [derivedFirst, derivedLast].filter(Boolean).join(' ');

  const baseUser = `${derivedFirst.charAt(0).toLowerCase()}${derivedLast.replace(/\s+/g,'').toLowerCase()}` || 'clinician';
  let username = baseUser; let suffix = 1;
  while (queryOne('SELECT 1 FROM User WHERE Username = ?', [username])) username = `${baseUser}${suffix++}`;

  const userRoleId = queryOne(`SELECT RoleID FROM Role WHERE LOWER(Name) = 'user'`)?.RoleID || 2;
  const dummyHash  = bcrypt.hashSync('changeme1', 10);
  const result = run(`INSERT INTO User (Username, PasswordHash, FullName, FirstName, LastName, Email,
                       UniqueID, RoleID, IsClinician, Credentials, IsActive)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [username, dummyHash, fullName, derivedFirst, derivedLast, email || null,
     employeeNumber || null, userRoleId, credentials || null]);

  logAudit(null, 'CREATE', 'Clinician', result.lastInsertRowid, `Created clinician: ${fullName}`);
  res.json({ id: result.lastInsertRowid, ClinicianID: result.lastInsertRowid, message: 'Clinician created' });
});

app.put('/api/clinicians/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM User WHERE UserID = ? AND IsClinician = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Clinician not found' });
  const { name, firstName, lastName, employeeNumber, credentials, email, isActive } = req.body;

  const derivedFirst = firstName !== undefined ? firstName : (name ? name.split(/\s+/)[0] : existing.FirstName);
  const derivedLast  = lastName  !== undefined ? lastName  : (name ? name.split(/\s+/).slice(1).join(' ') : existing.LastName);
  const fullName     = name || [derivedFirst, derivedLast].filter(Boolean).join(' ') || existing.FullName;

  run(`UPDATE User SET FullName=?, FirstName=?, LastName=?, Email=?, UniqueID=?,
       Credentials=?, IsActive=? WHERE UserID=?`,
    [fullName, derivedFirst, derivedLast,
     email     !== undefined ? email     : existing.Email,
     employeeNumber !== undefined ? employeeNumber : existing.UniqueID,
     credentials !== undefined ? credentials : existing.Credentials,
     isActive  !== undefined ? (isActive ? 1 : 0) : existing.IsActive,
     req.params.id]);

  logAudit(null, 'UPDATE', 'Clinician', req.params.id, `Updated clinician: ${fullName}`);
  res.json({ message: 'Clinician updated' });
});

app.delete('/api/clinicians/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM User WHERE UserID = ? AND IsClinician = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Clinician not found' });
  run('UPDATE User SET IsActive = 0 WHERE UserID = ?', [req.params.id]);
  logAudit(null, 'ARCHIVE', 'Clinician', req.params.id, `Archived clinician: ${existing.FullName}`);
  res.json({ message: 'Clinician archived' });
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

// Helper to generate display name
const generateDisplayName = (firstName, lastName, fullName) => {
  if (firstName && lastName) return `${firstName.charAt(0)} ${lastName}`;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0].charAt(0)} ${parts.slice(1).join(' ')}`;
    return fullName;
  }
  return '';
};

// List all users (with optional filters)
app.get('/api/users', (req, res) => {
  const { includeInactive, cliniciansOnly } = req.query;
  let sql = USER_SELECT + ' WHERE 1=1';
  const params = [];

  if (!includeInactive || includeInactive === 'false') {
    sql += ' AND u.IsActive = 1';
  }
  if (cliniciansOnly === 'true') {
    sql += ' AND u.IsClinician = 1';
  }
  sql += ' ORDER BY u.LastName, u.FirstName, u.FullName';

  const users = query(sql, params);
  res.json(users.map(u => ({
    ...u,
    displayName: u.DisplayName || generateDisplayName(u.FirstName, u.LastName, u.FullName)
  })));
});

// Get single user
app.get('/api/users/:id', (req, res) => {
  const user = queryOne(USER_SELECT + ' WHERE u.UserID = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...user,
    displayName: user.DisplayName || generateDisplayName(user.FirstName, user.LastName, user.FullName)
  });
});

// Get available roles
app.get('/api/users/roles', (req, res) => {
  const roles = query('SELECT RoleID, Name, Description, Permissions FROM Role ORDER BY RoleID');
  res.json(roles);
});

// Create new user
app.post('/api/users', (req, res) => {
  const { username, password, firstName, lastName, email, uniqueId, roleId, isClinician, credentials, displayName } = req.body;

  if (!username || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'Username, password, firstName, and lastName are required' });
  }

  // Check username uniqueness
  const existing = queryOne('SELECT 1 FROM User WHERE Username = ?', [username]);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const fullName = `${firstName} ${lastName}`.trim();
  const autoDisplayName = displayName || generateDisplayName(firstName, lastName, fullName);
  const passwordHash = bcrypt.hashSync(password, 10);
  const userRoleId = roleId || queryOne("SELECT RoleID FROM Role WHERE LOWER(Name) = 'user'")?.RoleID || 2;

  try {
    const result = run(`INSERT INTO User
      (Username, PasswordHash, FullName, FirstName, LastName, Email, UniqueID, RoleID, IsClinician, Credentials, DisplayName, IsActive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [username, passwordHash, fullName, firstName, lastName, email || null, uniqueId || null, userRoleId, isClinician ? 1 : 0, credentials || null, autoDisplayName]
    );
    logAudit(null, 'CREATE', 'User', result.lastInsertRowid, `Created user: ${fullName} (${username})`);
    res.json({ id: result.lastInsertRowid, message: 'User created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user
app.put('/api/users/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM User WHERE UserID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { username, password, firstName, lastName, email, uniqueId, roleId, isClinician, credentials, displayName, isActive } = req.body;

  // Check username uniqueness if changing
  if (username && username !== existing.Username) {
    const taken = queryOne('SELECT 1 FROM User WHERE Username = ? AND UserID != ?', [username, req.params.id]);
    if (taken) return res.status(409).json({ error: 'Username already exists' });
  }

  const newFirstName = firstName !== undefined ? firstName : existing.FirstName;
  const newLastName = lastName !== undefined ? lastName : existing.LastName;
  const fullName = `${newFirstName} ${newLastName}`.trim();
  const autoDisplayName = displayName || generateDisplayName(newFirstName, newLastName, fullName);

  let passwordHash = existing.PasswordHash;
  if (password) passwordHash = bcrypt.hashSync(password, 10);

  try {
    run(`UPDATE User SET
      Username = COALESCE(?, Username),
      PasswordHash = ?,
      FirstName = ?,
      LastName = ?,
      FullName = ?,
      Email = COALESCE(?, Email),
      UniqueID = COALESCE(?, UniqueID),
      RoleID = COALESCE(?, RoleID),
      IsClinician = COALESCE(?, IsClinician),
      Credentials = COALESCE(?, Credentials),
      DisplayName = ?,
      IsActive = COALESCE(?, IsActive)
      WHERE UserID = ?`,
      [username, passwordHash, newFirstName, newLastName, fullName, email, uniqueId, roleId, isClinician !== undefined ? (isClinician ? 1 : 0) : null, credentials, autoDisplayName, isActive !== undefined ? (isActive ? 1 : 0) : null, req.params.id]
    );
    logAudit(null, 'UPDATE', 'User', req.params.id, `Updated user: ${fullName}`);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete (deactivate) user
app.delete('/api/users/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM User WHERE UserID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Prevent deleting the last admin
  const adminRoleId = queryOne("SELECT RoleID FROM Role WHERE LOWER(Name) = 'admin'")?.RoleID;
  const isAdmin = existing.RoleID === adminRoleId;
  if (isAdmin) {
    const adminCount = queryOne('SELECT COUNT(*) as n FROM User WHERE RoleID = ? AND IsActive = 1', [adminRoleId])?.n || 0;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot deactivate the last admin user' });
  }

  run('UPDATE User SET IsActive = 0 WHERE UserID = ?', [req.params.id]);
  logAudit(null, 'ARCHIVE', 'User', req.params.id, `Deactivated user: ${existing.FullName}`);
  res.json({ message: 'User deactivated' });
});

// User self-management: update own profile
app.put('/api/users/me/profile', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const userId = payload.userId;
    const existing = queryOne('SELECT * FROM User WHERE UserID = ?', [userId]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const { firstName, lastName, email, displayName, currentPassword, newPassword } = req.body;

    // Verify current password if changing password
    if (newPassword) {
      if (!currentPassword || !bcrypt.compareSync(currentPassword, existing.PasswordHash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const newFirstName = firstName !== undefined ? firstName : existing.FirstName;
    const newLastName = lastName !== undefined ? lastName : existing.LastName;
    const fullName = `${newFirstName} ${newLastName}`.trim();
    const autoDisplayName = displayName || generateDisplayName(newFirstName, newLastName, fullName);

    let passwordHash = existing.PasswordHash;
    if (newPassword) passwordHash = bcrypt.hashSync(newPassword, 10);

    run(`UPDATE User SET
      FirstName = ?, LastName = ?, FullName = ?, Email = COALESCE(?, Email),
      DisplayName = ?, PasswordHash = ? WHERE UserID = ?`,
      [newFirstName, newLastName, fullName, email, autoDisplayName, passwordHash, userId]
    );

    logAudit(userId, 'UPDATE', 'User', userId, 'Updated own profile');
    res.json({ message: 'Profile updated' });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get own profile
app.get('/api/users/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const user = queryOne(USER_SELECT + ' WHERE u.UserID = ?', [payload.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      ...user,
      displayName: user.DisplayName || generateDisplayName(user.FirstName, user.LastName, user.FullName)
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/persons/:id', (req, res) => {
  const existing = queryOne(`SELECT p.*, e.CompanyName as EmployerName FROM Person p
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID WHERE p.PersonID = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  run(`INSERT INTO ArchivedPerson (OriginalID, Reason, Data) VALUES (?, ?, ?)`,
    [existing.PersonID, 'Manual delete', JSON.stringify(existing)]);
  run('UPDATE Person SET IsActive = 0 WHERE PersonID = ?', [req.params.id]);
  logAudit(null, 'ARCHIVE', 'Person', req.params.id, `Archived person: ${existing.FullName}`);
  res.json({ message: 'Person archived' });
});

// ============================================
// AOD TEST ROUTES
// ============================================

app.get('/api/persons/check-duplicate', (req, res) => {
  const { fullName, dob, employerId, excludeId } = req.query;
  if (!fullName || !fullName.trim()) return res.json({ exactMatch: null, partialMatches: [] });

  const surname = getSurname(fullName);
  let sql = `SELECT p.PersonID, p.FullName, p.DateOfBirth, p.EmployerID, p.BadgeNumber,
             e.CompanyName as EmployerName FROM Person p
             LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
             WHERE p.IsActive = 1`;
  const params = [];
  if (excludeId) { sql += ' AND p.PersonID != ?'; params.push(excludeId); }
  const persons = query(sql, params);

  const exactMatch = persons.find(p =>
    p.FullName?.trim().toLowerCase() === fullName.trim().toLowerCase()
    && (!dob || p.DateOfBirth === dob)
    && (!employerId || String(p.EmployerID) === String(employerId))
  ) || null;

  // Partial: same surname + same DOB (required) + same employer (if provided), different full name
  const partialMatches = dob ? persons.filter(p => {
    if (exactMatch && p.PersonID === exactMatch.PersonID) return false;
    return getSurname(p.FullName) === surname
      && p.DateOfBirth === dob
      && (!employerId || String(p.EmployerID) === String(employerId));
  }) : [];

  res.json({ exactMatch, partialMatches });
});

app.get('/api/persons/:id', (req, res) => {
  const person = queryOne(`
    SELECT p.*, e.CompanyName as EmployerName, wt.Name as WorkerTypeName, s.Name as SexName,
           (SELECT COUNT(*) FROM AODTest WHERE PersonID = p.PersonID) as TestCount,
           (SELECT COUNT(*) FROM PatientEvent WHERE PersonID = p.PersonID) as ClinicVisitCount,
           (SELECT COUNT(*) FROM AODTest WHERE PersonID = p.PersonID AND IsNonNegative = 1) as NonNegativeCount,
           (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) as LastTestDate,
           (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) as LastClinicDate
    FROM Person p
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN Sex s ON p.SexID = s.SexID
    WHERE p.PersonID = ?
  `, [req.params.id]);
  if (!person) return res.status(404).json({ error: 'Patient not found' });
  res.json(person);
});

// â”€â”€ Person linked history (all records by Name+DOB) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/persons/:id/history', (req, res) => {
  try {
    const person = queryOne('SELECT FullName, DateOfBirth FROM Person WHERE PersonID = ?', [req.params.id]);
    if (!person) return res.status(404).json({ error: 'Person not found' });

    // Find all Person records sharing the same FullName AND DOB (linked cases)
    let linkedIds = [parseInt(req.params.id)];
    if (person.FullName && person.DateOfBirth) {
      const linked = query(
        'SELECT PersonID FROM Person WHERE LOWER(FullName) = LOWER(?) AND DateOfBirth = ? AND PersonID != ?',
        [person.FullName, person.DateOfBirth, req.params.id]
      );
      linkedIds.push(...linked.map(r => r.PersonID));
    }

    const placeholders = linkedIds.map(() => '?').join(',');

    const tests = query(`
      SELECT t.TestID, t.TestNumber, t.TestDate, t.TestTime, t.OverallAODResult, t.TestStatus,
             tt.Name as TestTypeName, p.FullName as PersonName, e.CompanyName as EmployerName
      FROM AODTest t
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.PersonID IN (${placeholders})
      ORDER BY t.TestDate DESC, t.TestTime DESC
    `, linkedIds);

    const patientEvents = query(`
      SELECT pe.EventID, pe.EventDate, pe.InjuryType as PresentingComplaint, pe.Disposition,
             pe.PatientName, pe.Classification, pe.WrNwr
      FROM PatientEvent pe
      WHERE pe.PersonID IN (${placeholders})
      ORDER BY pe.EventDate DESC
    `, linkedIds);

    const dnaRecords = query(`
      SELECT a.AttendanceID, a.ScheduledDate, a.Reason, a.ReasonCategory,
             p.FullName as PersonName
      FROM AttendanceRecord a
      LEFT JOIN Person p ON a.PersonID = p.PersonID
      WHERE a.PersonID IN (${placeholders})
      ORDER BY a.ScheduledDate DESC
    `, linkedIds);

    res.json({
      linkedPersonIds: linkedIds,
      tests,
      patientEvents,
      dnaRecords
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compute the Overall AOD Result from drug + BAC outcomes
function computeOverallAODResult(finalDrugOutcome, finalBACOutcome) {
  const drug = finalDrugOutcome || '';
  const bac  = finalBACOutcome  || '';
  if (drug === 'Refused')   return 'Refused';
  if (drug === 'Invalid')   return 'Invalid';
  if (bac  === 'Positive')  return 'Alcohol Positive';
  if (drug === 'Pending Confirmation') return 'Drug Non-Negative Pending';
  if (drug === 'Confirmed - Inconsistent') return 'Drug Confirmed - Inconsistent';
  if (drug === 'Confirmed - Consistent with Declaration') return 'Drug Confirmed - Consistent';
  if (drug === 'Confirmed - Pending HSE Management Review') return 'Review Required';
  if (drug === 'Cancelled') return 'Cancelled';
  if (['Negative', 'Confirmed Negative', ''].includes(drug) && ['Negative', 'N/A', ''].includes(bac)) return 'Negative';
  return 'Review Required';
}

app.get('/api/tests', (req, res) => {
  const { dateFrom, dateTo, testTypeId, personId, isPending, isNonNegative, limit, search } = req.query;
  
  let sql = `
    SELECT t.*, p.FullName as PersonName, p.BadgeNumber, p.EmployeeNumber,
           e.CompanyName as EmployerName, wt.Name as WorkerTypeName,
           tt.Name as TestTypeName, tt.Code as TestTypeCode,
           c.Name as ClinicianName
    FROM AODTest t
    LEFT JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
    WHERE 1=1
  `;
  const params = [];
  
  if (dateFrom) { sql += ' AND t.TestDate >= ?'; params.push(dateFrom); }
  if (dateTo) { sql += ' AND t.TestDate <= ?'; params.push(dateTo); }
  if (testTypeId) { sql += ' AND t.TestTypeID = ?'; params.push(testTypeId); }
  if (personId) { sql += ' AND t.PersonID = ?'; params.push(personId); }
  if (isPending === 'true') { sql += ' AND t.IsPending = 1'; }
  if (isNonNegative === 'true') { sql += ' AND t.IsNonNegative = 1'; }
  if (search) { sql += ' AND (t.TestNumber LIKE ? OR p.FullName LIKE ? OR p.BadgeNumber LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
  
  sql += ' ORDER BY t.TestDate DESC, t.TestTime DESC';
  if (limit) { sql += ` LIMIT ${parseInt(limit)}`; }
  
  res.json(query(sql, params));
});

// Check for duplicate test (same person, same date) â€” must be before /:id
// STATUS-BASED LOGIC:
// - All duplicates allow override with warning
// - Strict matching: same date + same person (or donor name match)
// - Different statuses show different warning levels (green for closed, amber/red for active)
app.get('/api/tests/check-duplicate', (req, res) => {
  const { personId, donorName, employerId, testDate } = req.query;
  
  // Date is required for duplicate checking
  if (!testDate) return res.json({ hasDuplicate: false });

  let existing = null;

  // Find existing tests for this person on this specific date only
  if (personId) {
    existing = queryOne(`
      SELECT t.TestID, t.TestNumber, t.TestDate, t.TestStatus, t.TestTypeID,
             p.FullName, p.EmployerID, e.CompanyName as EmployerName,
             tt.Name as TestTypeName
      FROM AODTest t
      JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.PersonID = ? AND t.TestDate = ?
      ORDER BY t.TestID DESC LIMIT 1
    `, [personId, testDate]);
  }

  // If no match by personId, try matching by donor name on the same date
  if (!existing && donorName) {
    existing = queryOne(
      `SELECT t.TestID, t.TestNumber, t.TestDate, t.TestStatus, t.TestTypeID,
              p.FullName, p.EmployerID, e.CompanyName as EmployerName,
              tt.Name as TestTypeName
       FROM AODTest t
       JOIN Person p ON t.PersonID = p.PersonID
       LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
       LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
       WHERE LOWER(p.FullName) = LOWER(?) AND t.TestDate = ?` +
      (employerId ? ' AND p.EmployerID = ?' : '') +
      ' ORDER BY t.TestID DESC LIMIT 1',
      employerId ? [donorName, testDate, employerId] : [donorName, testDate]
    );
  }

  if (!existing) {
    return res.json({ hasDuplicate: false });
  }

  // Status-based styling for warnings
  const ACTIVE_STATUSES = ['Pending Lab', 'Action Required', 'Review Required', 'Scheduled', 'Pending'];
  const CLOSED_STATUSES = ['Closed'];
  
  const testStatus = existing.TestStatus || 'Closed';
  
  // Determine warning styling based on status
  const isClosed = CLOSED_STATUSES.includes(testStatus);
  const isActive = ACTIVE_STATUSES.includes(testStatus);
  
  // Build appropriate warning message based on status
  let warningMessage;
  if (isClosed) {
    warningMessage = `A completed test (${existing.TestNumber}) already exists for this person on ${testDate}. You can create a new test or merge into the existing one.`;
  } else if (isActive) {
    warningMessage = `An active test (${existing.TestNumber}) with status "${testStatus}" already exists for this person on ${testDate}. You can merge into the existing test or create a new one.`;
  } else {
    warningMessage = `A test (${existing.TestNumber}) with status "${testStatus}" already exists for this person on ${testDate}.`;
  }
  
  // Always allow override - user can choose to merge or create anyway
  res.json({ 
    hasDuplicate: true, 
    existingTest: existing,
    allowOverride: true, // Always allow creating new test with warning
    warningMessage: warningMessage,
    isClosed: isClosed,
    isActive: isActive,
    strictMatch: true // Indicates this is a same-date, same-person match
  });
});

app.get('/api/tests/:id', (req, res) => {
  const test = queryOne(`
    SELECT t.*, p.FullName as PersonName, p.DateOfBirth, p.BadgeNumber, p.EmployeeNumber,
           e.CompanyName as EmployerName, e.EmployerID, wt.Name as WorkerTypeName, p.WorkerTypeID,
           tt.Name as TestTypeName, tt.Code as TestTypeCode,
           c.Name as ClinicianName, s.Name as SexName
    FROM AODTest t
    LEFT JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Sex s ON p.SexID = s.SexID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
    WHERE t.TestID = ?
  `, [req.params.id]);
  
  if (!test) return res.status(404).json({ error: 'Test not found' });
  res.json(test);
});


app.post('/api/tests', (req, res) => {
  logger.debug('POST /api/tests', { bodyKeys: Object.keys(req.body || {}) });
  try {
  // If a testNumber was pre-assigned at scheduling time, honour it; otherwise generate a new one
  const testNumber = req.body.testNumber || generateTestNumber();
  const { 
    testDate, testTime, personId, donorName, donorDOB, donorEmployer, donorBadge,
    testTypeId, clinicianId,
    oralUndertaken, oralResult, oralDeviceId, oralSubstances, oralControlLines,
    bacUndertaken, bacInitialValue, bacInitialTime, bacFinalValue, bacFinalTime, bacDeviceId,
    urineUndertaken, urineResult, urineSampleId, urineSubstances, urineControlLines,
    sampleSentToLab, labSentDate, labReference,
    labRequestType, labRequestNotes,
    declaredMedications, idSighted, idType, idNumber, notes,
    skipAutoMerge
  } = req.body;
  
  // Get or create person record
  let actualPersonId = personId;
  if (!actualPersonId && donorName) {
    // Create new person record for this donor
    const result = run(`
      INSERT INTO Person (FullName, DateOfBirth, EmployerID, BadgeNumber, IsActive)
      VALUES (?, ?, ?, ?, 1)
    `, [donorName, donorDOB ?? null, donorEmployer ? parseInt(donorEmployer) : null, donorBadge ?? null]);
    actualPersonId = result.lastInsertRowid;
    logAudit(null, 'CREATE', 'Person', actualPersonId, `Created donor: ${donorName}`);
  }
  
  if (!actualPersonId) {
    return res.status(400).json({ error: 'Donor information required' });
  }
  
  // ============================================
  // WORKFLOW LOGIC
  // ============================================
  
  // BAC: Final overrides Initial. Only Final > 0 = Positive
  const effectiveBAC = (bacFinalValue !== null && bacFinalValue !== undefined && bacFinalValue !== '')
    ? parseFloat(bacFinalValue)
    : (bacInitialValue !== null && bacInitialValue !== undefined && bacInitialValue !== '' ? parseFloat(bacInitialValue) : 0);
  
  let finalBACOutcome = null;
  let finalDrugOutcome = null;
  let isPending = 0;
  let isNonNegative = 0;
  let testStatus = 'Closed'; // Default: case closed
  
  // ALCOHOL WORKFLOW
  // Initial = 0 â†’ Negative â†’ Closed
  // Initial > 0 â†’ requires Final
  // Final = 0 â†’ Negative (override) â†’ Closed  
  // Final > 0 â†’ Positive â†’ Case requires action
  if (bacUndertaken) {
    if (effectiveBAC > 0) {
      finalBACOutcome = 'Positive';
      isNonNegative = 1;
      testStatus = 'Action Required';
    } else {
      finalBACOutcome = 'Negative';
      // Closed - no action needed
    }
  }
  
  // DRUG WORKFLOW
  // Negative â†’ Closed (no further action)
  // Non-Negative â†’ RFT = Yes â†’ Pending Confirmation (requires lab)
  // Lab Negative â†’ Final Negative â†’ Closed
  // Lab Confirmed â†’ Review against declared medications
  let rft = 0;
  
  if (oralUndertaken || urineUndertaken) {
    const drugScreeningResult = oralResult === 'Non-Negative' || urineResult === 'Non-Negative' 
      ? 'Non-Negative' 
      : (oralResult === 'Negative' || urineResult === 'Negative' ? 'Negative' : null);
    
    // Refused / Invalid take priority over the screening result
    const specialResult = oralResult === 'Refused' || urineResult === 'Refused'
      ? 'Refused'
      : (oralResult === 'Invalid' || urineResult === 'Invalid' ? 'Invalid' : null);

    if (specialResult) {
      finalDrugOutcome = specialResult;
      testStatus = 'Action Required';
    } else if (drugScreeningResult === 'Non-Negative') {
      isNonNegative = 1;
      isPending = 1;
      rft = 1; // Referred for Further Testing
      finalDrugOutcome = 'Pending Confirmation';
      testStatus = 'Pending Lab';
    } else if (drugScreeningResult === 'Negative') {
      finalDrugOutcome = 'Negative';
      // Closed - no action needed (unless BAC positive)
    }
  }
  
  // If both BAC positive AND drug pending, prioritize pending status
  if (isPending) testStatus = 'Pending Lab';
  
  const result = run(`
    INSERT INTO AODTest (
      TestNumber, TestDate, TestTime, PersonID, TestTypeID, ClinicianID,
      OralUndertaken, OralResult, OralDeviceID, OralSubstances, OralControlLines,
      BACUndertaken, BACInitialValue, BACInitialTime, BACFinalValue, BACFinalTime, BACResult, BACDeviceID,
      UrineUndertaken, UrineResult, UrineSampleID, UrineSubstances, UrineControlLines,
      RFT, SampleSentToLab, LabSentDate, LabReference, LabRequestType, LabRequestNotes,
      DeclaredMedications, IDSighted, IDType, IDNumber, FinalBACOutcome, FinalDrugOutcome, OverallAODResult, TestStatus, IsPending, IsNonNegative,
      Notes, CreatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    testNumber, testDate ?? null, testTime ?? null, actualPersonId, testTypeId ?? null, clinicianId ?? null,
    oralUndertaken ? 1 : 0, oralResult ?? null, oralDeviceId ?? null,
    Array.isArray(oralSubstances) ? oralSubstances.join(', ') : (oralSubstances ?? null),
    oralControlLines ?? null,
    bacUndertaken ? 1 : 0, bacInitialValue ?? null, bacInitialTime ?? null, bacFinalValue ?? null, bacFinalTime ?? null,
    effectiveBAC > 0 ? 'Positive' : 'Negative', bacDeviceId ?? null,
    urineUndertaken ? 1 : 0, urineResult ?? null, urineSampleId ?? null,
    Array.isArray(urineSubstances) ? urineSubstances.join(', ') : (urineSubstances ?? null),
    urineControlLines ?? null,
    rft, sampleSentToLab ? 1 : 0, labSentDate ?? null, labReference ?? null,
    labRequestType ?? 'specific', labRequestNotes ?? null,
    declaredMedications ?? null, idSighted ? 1 : 0, idType ?? null, idNumber ?? null,
    finalBACOutcome ?? null, finalDrugOutcome ?? null, computeOverallAODResult(finalDrugOutcome, finalBACOutcome), testStatus, isPending, isNonNegative,
    notes ?? null, null
  ]);
  
  const testId = result.lastInsertRowid;
  
  // Create non-negative record if applicable
  if (isNonNegative) {
    const substances = [];
    if (effectiveBAC > 0) substances.push(`Alcohol (BAC: ${effectiveBAC.toFixed(3)})`);
    if (oralResult === 'Non-Negative') {
      const oral = Array.isArray(oralSubstances) ? oralSubstances.join(', ') : oralSubstances;
      substances.push(`Oral Fluid Non-Negative${oral ? ': ' + oral : ''}`);
    }
    if (urineResult === 'Non-Negative') {
      const urine = Array.isArray(urineSubstances) ? urineSubstances.join(', ') : urineSubstances;
      substances.push(`Urine Non-Negative${urine ? ': ' + urine : ''}`);
    }
    
    run(`
      INSERT INTO NonNegativeRecord (TestID, DetectedSubstances, TypeOfTest, Status)
      VALUES (?, ?, ?, 'Open')
    `, [testId, substances.join(', '), 
      effectiveBAC > 0 ? 'BAC' : (oralResult === 'Non-Negative' ? 'Oral' : 'Urine')]);
  }
  
  // Create pending record if sample sent to lab
  if (isPending) {
    run(`INSERT INTO PendingResult (TestID, LabReference, Status) VALUES (?, ?, 'Awaiting')`, [testId, labReference]);
  }
  
  // Create positive BAC record (BAC > 0)
  if (effectiveBAC > 0) {
    run(`INSERT INTO PositiveBACRecord (TestID, MeasuredBAC, FinalBACOutcome, Status) VALUES (?, ?, ?, 'Open')`, [testId, effectiveBAC, finalBACOutcome]);
  }
  
  logAudit(null, 'CREATE', 'AODTest', testId, `Created test: ${testNumber}`);

  // â”€â”€ Auto-resolve matching scheduled/random-list entries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // When a test is recorded, automatically mark any pending ScheduledTest or
  // RandomTestEntry for the same person + date as Completed/Tested so they
  // no longer appear on the pending list.
  const mergedScheduled = [];
  const mergedImported = [];

  try {
    if (skipAutoMerge) throw new Error('__skip__');
    // 1. Resolve ScheduledTest rows
    const pendingScheduled = query(`
      SELECT ScheduleID FROM ScheduledTest
      WHERE PersonID = ? AND ScheduledDate = ? AND Status IN ('Scheduled','Pending')
    `, [actualPersonId, testDate ?? null]);

    for (const row of pendingScheduled) {
      run(`UPDATE ScheduledTest SET Status = 'Completed', Notes = COALESCE(Notes || ' | ', '') || ?
           WHERE ScheduleID = ?`,
        [`Auto-completed by test ${testNumber}`, row.ScheduleID]);
      mergedScheduled.push(row.ScheduleID);
      logAudit(null, 'UPDATE', 'ScheduledTest', row.ScheduleID,
        `Auto-completed by test ${testNumber} (testId ${testId})`);
    }

    // 2. Resolve RandomTestEntry rows (matched by PersonID or by name on list date)
    const pendingImported = query(`
      SELECT e.EntryID FROM RandomTestEntry e
      JOIN RandomTestList l ON e.ListID = l.ListID
      WHERE e.Status IN ('Pending','Scheduled')
        AND l.ListDate = ?
        AND (
          e.MatchedPersonID = ?
          OR LOWER(TRIM(e.EmployeeName)) = LOWER(TRIM(?))
        )
    `, [testDate ?? null, actualPersonId, req.body.donorName ?? '']);

    for (const row of pendingImported) {
      run(`UPDATE RandomTestEntry SET Status = 'Tested', TestID = ?, StatusUpdatedAt = CURRENT_TIMESTAMP
           WHERE EntryID = ?`,
        [testId, row.EntryID]);
      mergedImported.push(row.EntryID);
      logAudit(null, 'UPDATE', 'RandomTestEntry', row.EntryID,
        `Auto-marked Tested by test ${testNumber} (testId ${testId})`);
    }
  } catch (mergeErr) {
    // Non-fatal â€” log but don't fail the test creation (skipAutoMerge throws __skip__ intentionally)
    if (mergeErr.message !== '__skip__') {
      logger.warn('Auto-merge error after test creation', { testId, error: mergeErr.message });
    }
  }

  // Fire auto-email rules (non-blocking)
  fireEmailRules('new_test', testId).catch(() => {});

  res.json({
    id: testId,
    testNumber,
    message: 'Test created',
    autoMerged: {
      scheduledTests: mergedScheduled,
      importedEntries: mergedImported,
      count: mergedScheduled.length + mergedImported.length
    }
  });
  } catch (err) {
    logger.error('Failed to create test', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to create test', message: String(err) });
  }
});

app.put('/api/tests/:id', (req, res) => {
  const old = queryOne('SELECT * FROM AODTest WHERE TestID = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Test not found' });
  
  // Merge incoming fields with existing record so partial updates don't null out columns
  const merged = { ...old, ...req.body };
  const {
    testDate = old.TestDate, testTime = old.TestTime, testTypeId = old.TestTypeID, clinicianId = old.ClinicianID,
    oralUndertaken = old.OralUndertaken, oralResult = old.OralResult, oralDeviceId = old.OralDeviceID,
    bacUndertaken = old.BACUndertaken, bacInitialValue = old.BACInitialValue, bacInitialTime = old.BACInitialTime, bacFinalValue = old.BACFinalValue, bacFinalTime = old.BACFinalTime, bacDeviceId = old.BACDeviceID,
    urineUndertaken = old.UrineUndertaken, urineResult = old.UrineResult, urineSampleId = old.UrineSampleID,
    rft: rftInput = old.RFT,
    sampleSentToLab = old.SampleSentToLab, labSentDate = old.LabSentDate, labReference = old.LabReference,
    labRequestType = old.LabRequestType, labRequestNotes = old.LabRequestNotes,
    confirmatoryResult = old.ConfirmatoryResult, confirmatoryResultDate = old.ConfirmatoryResultDate, detectedSubstances = old.DetectedSubstances,
    declaredMedications = old.DeclaredMedications, medicationReviewStatus = old.MedicationReviewStatus, medicationReviewNotes = old.MedicationReviewNotes,
    overrideBACResult = old.OverrideBACResult, overrideBACReason = old.OverrideBACReason, overrideDrugResult = old.OverrideDrugResult, overrideDrugReason = old.OverrideDrugReason,
    notes = old.Notes
  } = req.body;
  
  // Recalculate outcomes using workflow rules
  const parsedFinal = (bacFinalValue !== null && bacFinalValue !== undefined && bacFinalValue !== '') ? parseFloat(bacFinalValue) : null;
  const parsedInitial = (bacInitialValue !== null && bacInitialValue !== undefined && bacInitialValue !== '') ? parseFloat(bacInitialValue) : 0;
  const effectiveBAC = parsedFinal !== null ? parsedFinal : parsedInitial;
  
  let finalBACOutcome = null;
  let finalDrugOutcome = overrideDrugResult;
  let isPending = 0;
  let isNonNegative = 0;
  let testStatus = 'Closed';
  
  // Alcohol: Final overrides Initial. Any BAC > 0.000% = Positive
  if (bacUndertaken) {
    if (!overrideBACResult) {
      finalBACOutcome = effectiveBAC > 0 ? 'Positive' : 'Negative';
    } else {
      finalBACOutcome = overrideBACResult;
    }
 
    if (finalBACOutcome === 'Positive') {
      isNonNegative = 1;
      testStatus = 'Action Required';
    }
  }
 
  // Drugs: Non-Negative screening => RFT + Pending lab until confirmatory result
  const screeningNonNegative = oralResult === 'Non-Negative' || urineResult === 'Non-Negative';
  const screeningNegative = oralResult === 'Negative' || urineResult === 'Negative';
  const rft = typeof rftInput === 'boolean' ? (rftInput ? 1 : 0) : (rftInput ? parseInt(rftInput) : (screeningNonNegative ? 1 : 0));
 
  if (!finalDrugOutcome) {
    if (confirmatoryResult) {
      if (confirmatoryResult === 'Negative') {
        finalDrugOutcome = 'Confirmed Negative';
      } else if (confirmatoryResult === 'Substance Confirmed') {
        if (medicationReviewStatus === 'Consistent') {
          finalDrugOutcome = 'Confirmed - Consistent with Declaration';
        } else if (medicationReviewStatus === 'Inconsistent') {
          finalDrugOutcome = 'Confirmed - Inconsistent';
        } else {
          finalDrugOutcome = 'Confirmed - Pending Review';
        }
      } else {
        finalDrugOutcome = 'Review Required';
      }
    } else if (screeningNonNegative) {
      finalDrugOutcome = 'Pending Confirmation';
    } else if (screeningNegative) {
      finalDrugOutcome = 'Negative';
    }
  }
 
  if (screeningNonNegative) isNonNegative = 1;
 
  if (finalDrugOutcome === 'Pending Confirmation') {
    isPending = 1;
    testStatus = 'Pending Lab';
  }
 
  if (finalDrugOutcome === 'Confirmed - Inconsistent') {
    testStatus = 'Action Required';
  } else if (finalDrugOutcome === 'Confirmed - Pending HSE Management Review') {
    testStatus = 'Review Required';
  }
 
  // If both BAC positive AND drug pending, keep Pending Lab as primary state
  if (isPending) testStatus = 'Pending Lab';
  
  run(`
    UPDATE AODTest SET
      TestDate=?, TestTime=?, TestTypeID=?, ClinicianID=?,
      OralUndertaken=?, OralResult=?, OralDeviceID=?,
      BACUndertaken=?, BACInitialValue=?, BACInitialTime=?, BACFinalValue=?, BACFinalTime=?, BACResult=?, BACDeviceID=?,
      UrineUndertaken=?, UrineResult=?, UrineSampleID=?,
      RFT=?, SampleSentToLab=?, LabSentDate=?, LabReference=?, LabRequestType=?, LabRequestNotes=?,
      ConfirmatoryResult=?, ConfirmatoryResultDate=?, DetectedSubstances=?,
      DeclaredMedications=?, MedicationReviewStatus=?, MedicationReviewNotes=?,
      OverrideBACResult=?, OverrideBACReason=?, OverrideDrugResult=?, OverrideDrugReason=?,
      FinalBACOutcome=?, FinalDrugOutcome=?, OverallAODResult=?, TestStatus=?, IsPending=?, IsNonNegative=?,
      Notes=?, UpdatedBy=?, UpdatedAt=CURRENT_TIMESTAMP
    WHERE TestID=?
  `, [
    testDate, testTime, testTypeId, clinicianId,
    oralUndertaken ? 1 : 0, oralResult, oralDeviceId,
    bacUndertaken ? 1 : 0,
    (bacInitialValue === '' || bacInitialValue == null) ? null : parseFloat(bacInitialValue),
    bacInitialTime || null,
    (bacFinalValue   === '' || bacFinalValue   == null) ? null : parseFloat(bacFinalValue),
    bacFinalTime || null,
    effectiveBAC > 0 ? 'Positive' : 'Negative',
    bacDeviceId || null,
    urineUndertaken ? 1 : 0, urineResult, urineSampleId,
    rft, sampleSentToLab ? 1 : 0, labSentDate, labReference,
    labRequestType || 'specific', labRequestNotes || null,
    confirmatoryResult, confirmatoryResultDate, detectedSubstances,
    declaredMedications, medicationReviewStatus, medicationReviewNotes,
    overrideBACResult, overrideBACReason, overrideDrugResult, overrideDrugReason,
    finalBACOutcome, finalDrugOutcome, computeOverallAODResult(finalDrugOutcome, finalBACOutcome), testStatus, isPending, isNonNegative,
    notes, null, req.params.id
  ]);
  
  // Update pending result if confirmatory result received
  if (confirmatoryResult && old.IsPending) {
    run(`UPDATE PendingResult SET Status='Resolved', ResolvedAt=CURRENT_TIMESTAMP, ResolvedBy=? WHERE TestID=?`, [null, req.params.id]);
  }
  
  logAudit(null, 'UPDATE', 'AODTest', req.params.id, `Updated test: ${old.TestNumber}`, old, req.body);
  res.json({ message: 'Test updated' });
});

app.delete('/api/tests/:id', (req, res) => {
  const test = queryOne('SELECT * FROM AODTest WHERE TestID = ?', [req.params.id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  run('DELETE FROM NonNegativeRecord WHERE TestID = ?', [req.params.id]);
  run('DELETE FROM PendingResult WHERE TestID = ?', [req.params.id]);
  run('DELETE FROM AODTest WHERE TestID = ?', [req.params.id]);
  logAudit(null, 'DELETE', 'AODTest', req.params.id, `Deleted test: ${test.TestNumber}`);
  res.json({ message: 'Test deleted' });
});

// ============================================
// PENDING RESULTS ROUTES
// ============================================

app.get('/api/pending', (req, res) => {
  const pending = query(`
    SELECT pr.*, t.TestNumber, t.TestDate, t.OralResult, t.UrineResult,
           p.FullName as PersonName, e.CompanyName as EmployerName
    FROM PendingResult pr
    JOIN AODTest t ON pr.TestID = t.TestID
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE pr.Status = 'Awaiting'
    ORDER BY t.TestDate DESC
  `);
  res.json(pending);
});

// Record lab result - resolves pending case
app.post('/api/pending/:id/lab-result', (req, res) => {
  const { confirmatoryResult, confirmatoryResultDate, detectedSubstances, declaredMedications, medicationReviewStatus, notes } = req.body;
  // confirmatoryResult: 'Negative', 'Substance Confirmed', 'Cancelled'
  // medicationReviewStatus: 'Consistent', 'Inconsistent', 'N/A', 'Pending Review'
  
  const pending = queryOne('SELECT * FROM PendingResult WHERE PendingID = ?', [req.params.id]);
  if (!pending) return res.status(404).json({ error: 'Pending record not found' });
  
  const test = queryOne('SELECT * FROM AODTest WHERE TestID = ?', [pending.TestID]);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  
  // Determine final drug outcome based on confirmatory result
  let finalDrugOutcome;
  let newStatus;
  
  if (confirmatoryResult === 'Negative') {
    // Lab cleared - screening was false positive
    finalDrugOutcome = 'Confirmed Negative';
    newStatus = 'Closed';
  } else if (confirmatoryResult === 'Substance Confirmed') {
    // Lab confirmed substance - needs medication review
    if (medicationReviewStatus === 'Consistent') {
      finalDrugOutcome = 'Confirmed - Consistent with Declaration';
      newStatus = 'Closed'; // Explained by declared medication
    } else if (medicationReviewStatus === 'Inconsistent') {
      finalDrugOutcome = 'Confirmed - Inconsistent';
      newStatus = 'Action Required';
    } else {
      finalDrugOutcome = 'Confirmed - Pending Review';
      newStatus = 'Review Required';
    }
  } else if (confirmatoryResult === 'Cancelled') {
    finalDrugOutcome = 'Cancelled';
    newStatus = 'Review Required';
  } else {
    finalDrugOutcome = 'Pending';
    newStatus = 'Pending Lab';
  }
  
  // Update test record
  run(`
    UPDATE AODTest SET 
      ConfirmatoryResult = ?, ConfirmatoryResultDate = ?, DetectedSubstances = ?,
      DeclaredMedications = ?, MedicationReviewStatus = ?, MedicationReviewNotes = ?,
      FinalDrugOutcome = ?, TestStatus = ?, IsPending = 0
    WHERE TestID = ?
  `, [confirmatoryResult, confirmatoryResultDate || new Date().toISOString().split('T')[0], 
      detectedSubstances, declaredMedications, medicationReviewStatus, notes,
      finalDrugOutcome, newStatus, pending.TestID]);
  
  // Update pending record
  run(`
    UPDATE PendingResult SET 
      Status = 'Resolved', LabResult = ?, ResolvedAt = CURRENT_TIMESTAMP
    WHERE PendingID = ?
  `, [confirmatoryResult, req.params.id]);
  
  // Update non-negative record status - auto-progress workflow
  // Open -> In Review when lab result entered
  // In Review -> Closed when medication review complete or lab negative
  if (confirmatoryResult === 'Substance Confirmed') {
    // If medication review is consistent, auto-close; otherwise move to In Review
    if (medicationReviewStatus === 'Consistent') {
      run(`UPDATE NonNegativeRecord SET Status = 'Closed', ClosedDate = CURRENT_TIMESTAMP WHERE TestID = ?`, [pending.TestID]);
    } else {
      run(`UPDATE NonNegativeRecord SET Status = 'In Review' WHERE TestID = ?`, [pending.TestID]);
    }
  } else if (confirmatoryResult === 'Negative') {
    // Lab cleared the screening - case can be closed
    run(`UPDATE NonNegativeRecord SET Status = 'Closed', ClosedDate = CURRENT_TIMESTAMP WHERE TestID = ?`, [pending.TestID]);
  } else if (confirmatoryResult?.startsWith('Lab Unable to Test')) {
    // Lab couldn't test - needs manual review
    run(`UPDATE NonNegativeRecord SET Status = 'In Review' WHERE TestID = ?`, [pending.TestID]);
  }
  
  logAudit(null, 'UPDATE', 'AODTest', pending.TestID, `Confirmatory result: ${confirmatoryResult}, Review: ${medicationReviewStatus || 'N/A'}`);
  res.json({ 
    message: 'Confirmatory result recorded', 
    finalDrugOutcome,
    testStatus: newStatus,
    medicationReviewStatus
  });
});

// Direct lab result entry by TestID (from TestDetail page)
app.post('/api/tests/:id/lab-result', (req, res) => {
  const { confirmatoryResult, confirmatoryResultDate, detectedSubstances, declaredMedications,
          medicationReviewStatus, medicationReviewNotes, labDrugDetails, creatinine, labComments } = req.body;

  const test = queryOne('SELECT * FROM AODTest WHERE TestID = ?', [req.params.id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  let finalDrugOutcome, newStatus;
  const unableToTest = confirmatoryResult?.startsWith('Lab Unable to Test');

  if (confirmatoryResult === 'Negative') {
    finalDrugOutcome = 'Confirmed Negative'; newStatus = 'Closed';
  } else if (confirmatoryResult === 'Substance Confirmed') {
    if (medicationReviewStatus === 'Consistent') {
      finalDrugOutcome = 'Confirmed - Consistent with Declaration'; newStatus = 'Closed';
    } else if (medicationReviewStatus === 'Inconsistent') {
      finalDrugOutcome = 'Confirmed - Inconsistent'; newStatus = 'Action Required';
    } else {
      finalDrugOutcome = 'Confirmed - Pending HSE Management Review'; newStatus = 'Review Required';
    }
  } else if (unableToTest) {
    finalDrugOutcome = confirmatoryResult; newStatus = 'Review Required';
  } else if (confirmatoryResult === 'Cancelled') {
    finalDrugOutcome = 'Cancelled'; newStatus = 'Review Required';
  } else {
    finalDrugOutcome = 'Pending'; newStatus = 'Pending Lab';
  }

  run(`UPDATE AODTest SET
    ConfirmatoryResult=?, ConfirmatoryResultDate=?, DetectedSubstances=?,
    DeclaredMedications=?, MedicationReviewStatus=?, MedicationReviewNotes=?,
    LabDrugDetails=?, Creatinine=?, LabComments=?,
    FinalDrugOutcome=?, OverallAODResult=?, TestStatus=?, IsPending=0, UpdatedAt=CURRENT_TIMESTAMP
    WHERE TestID=?`,
    [confirmatoryResult, confirmatoryResultDate || new Date().toISOString().split('T')[0],
     detectedSubstances, declaredMedications, medicationReviewStatus, medicationReviewNotes,
     labDrugDetails, creatinine, labComments,
     finalDrugOutcome, computeOverallAODResult(finalDrugOutcome, test.FinalBACOutcome), newStatus, req.params.id]);

  run(`UPDATE PendingResult SET Status='Resolved', LabResult=?, ResolvedAt=CURRENT_TIMESTAMP
       WHERE TestID=? AND Status != 'Resolved'`,
    [confirmatoryResult, req.params.id]);

  // Auto-progress non-negative status based on lab result
  if (confirmatoryResult === 'Substance Confirmed') {
    if (medicationReviewStatus === 'Consistent') {
      run(`UPDATE NonNegativeRecord SET Status='Closed', ClosedDate=CURRENT_TIMESTAMP WHERE TestID=?`, [req.params.id]);
    } else {
      run(`UPDATE NonNegativeRecord SET Status='In Review' WHERE TestID=?`, [req.params.id]);
    }
  } else if (confirmatoryResult === 'Negative') {
    run(`UPDATE NonNegativeRecord SET Status='Closed', ClosedDate=CURRENT_TIMESTAMP WHERE TestID=?`, [req.params.id]);
  } else if (confirmatoryResult?.startsWith('Lab Unable to Test')) {
    run(`UPDATE NonNegativeRecord SET Status='In Review' WHERE TestID=?`, [req.params.id]);
  }

  logAudit(null, 'UPDATE', 'AODTest', req.params.id, `Lab result: ${confirmatoryResult}${detectedSubstances ? ' | ' + detectedSubstances : ''}`);

  // Fire auto-email rules (non-blocking)
  fireEmailRules('lab_result', parseInt(req.params.id)).catch(() => {});

  res.json({ message: 'Lab result recorded', finalDrugOutcome, testStatus: newStatus });
});

// ============================================
// NON-NEGATIVE ROUTES
// ============================================

app.get('/api/nonnegative', (req, res) => {
  const { status, search, personId } = req.query;
  let sql = `
    SELECT nn.*, t.TestNumber, t.TestDate, t.TestTime,
           COALESCE(t.BACFinalValue, t.BACInitialValue, 0) as EffectiveBAC,
           t.OralResult, t.UrineResult, t.FinalBACOutcome, t.FinalDrugOutcome,
           t.LabReference, t.ConfirmatoryResult, t.SampleSentToLab,
           t.TestStatus as TestCurrentStatus,
           tt.Name as TestTypeName, tt.Code as TestTypeCode,
           p.FullName as PersonName, p.BadgeNumber,
           e.CompanyName as EmployerName, wt.Name as WorkerTypeName,
           CAST((julianday('now') - julianday(t.TestDate)) AS INTEGER) as DaysOpen,
           CAST((julianday(nn.ClosedDate) - julianday(t.TestDate)) AS INTEGER) as DaysTakenToClose
    FROM NonNegativeRecord nn
    JOIN AODTest t ON nn.TestID = t.TestID
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ` AND nn.Status = ?`; params.push(status); }
  if (personId) { sql += ` AND t.PersonID = ?`; params.push(personId); }
  if (search) {
    sql += ` AND (p.FullName LIKE ? OR t.TestNumber LIKE ? OR e.CompanyName LIKE ? OR nn.DetectedSubstances LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  sql += ' ORDER BY t.TestDate DESC';
  res.json(query(sql, params));
});

app.get('/api/nonnegative/:id', (req, res) => {
  const record = queryOne(`
    SELECT nn.*,
      t.TestID, t.TestNumber, t.TestDate, t.TestTime,
      t.OralUndertaken, t.OralResult, t.OralSubstances, t.OralControlLines,
      t.BACUndertaken, t.BACInitialValue, t.BACInitialTime, t.BACFinalValue, t.BACFinalTime, t.BACResult,
      t.UrineUndertaken, t.UrineResult, t.UrineSampleID, t.UrineSubstances,
      t.RFT, t.SampleSentToLab, t.LabSentDate, t.LabReference,
      t.ConfirmatoryResult, t.ConfirmatoryResultDate,
      t.DeclaredMedications, t.MedicationReviewStatus, t.MedicationReviewNotes,
      t.FinalBACOutcome, t.FinalDrugOutcome, t.TestStatus as TestCurrentStatus,
      t.Notes as TestNotes,
      tt.Name as TestTypeName, tt.Code as TestTypeCode,
      p.FullName as PersonName, p.BadgeNumber, p.DateOfBirth,
      e.CompanyName as EmployerName, e.Category as EmployerCategory,
      wt.Name as WorkerTypeName,
      c.Name as ClinicianName
    FROM NonNegativeRecord nn
    JOIN AODTest t ON nn.TestID = t.TestID
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
    WHERE nn.NNID = ?
  `, [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(record);
});

app.put('/api/nonnegative/:id', (req, res) => {
  const { followUpAction, status, closureReason } = req.body;
  const prev = queryOne('SELECT Status FROM NonNegativeRecord WHERE NNID=?', [req.params.id]);
  const updates = ['FollowUpAction=?', 'Status=?', 'UpdatedAt=CURRENT_TIMESTAMP'];
  const params = [followUpAction ?? null, status];
  if (status === 'Closed' && prev?.Status !== 'Closed') {
    updates.push('ClosedDate=CURRENT_TIMESTAMP', 'ClosedBy=?', 'ClosureReason=?');
    params.push(null, closureReason ?? null);
  }
  params.push(req.params.id);
  run(`UPDATE NonNegativeRecord SET ${updates.join(', ')} WHERE NNID=?`, params);
  logAudit(null, 'UPDATE', 'NonNegativeRecord', req.params.id, `Status â†’ ${status}${followUpAction ? ' | Action: ' + followUpAction : ''}`);
  res.json({ message: 'Record updated' });
});

app.put('/api/nonnegative/:id/lab', (req, res) => {
  const { labReference, confirmatoryResult, confirmatoryResultDate, medicationReviewStatus,
          medicationReviewNotes, detectedSubstances, labDrugDetails, creatinine, labComments } = req.body;
  const record = queryOne('SELECT TestID FROM NonNegativeRecord WHERE NNID=?', [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Not found' });
  run(`UPDATE AODTest SET
    LabReference=?, ConfirmatoryResult=?, ConfirmatoryResultDate=?,
    MedicationReviewStatus=?, MedicationReviewNotes=?,
    DetectedSubstances=?, LabDrugDetails=?, Creatinine=?, LabComments=?,
    UpdatedAt=CURRENT_TIMESTAMP
    WHERE TestID=?`,
    [labReference ?? null, confirmatoryResult ?? null, confirmatoryResultDate ?? null,
     medicationReviewStatus ?? null, medicationReviewNotes ?? null,
     detectedSubstances ?? null, labDrugDetails ?? null, creatinine ?? null, labComments ?? null,
     record.TestID]);
  logAudit(null, 'UPDATE', 'NonNegativeRecord', req.params.id, `Lab result: ${confirmatoryResult || 'updated'}`);
  res.json({ message: 'Lab result updated' });
});

app.get('/api/nonnegative/:id/history', (req, res) => {
  const record = queryOne('SELECT TestID FROM NonNegativeRecord WHERE NNID=?', [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const history = query(`
    SELECT al.AuditID, al.Action, al.RecordType, al.RecordID, al.Description,
           al.Timestamp as CreatedAt, u.FullName as UserName
    FROM AuditLog al
    LEFT JOIN User u ON al.UserID = u.UserID
    WHERE (al.RecordType = 'NonNegativeRecord' AND al.RecordID = ?)
       OR (al.RecordType = 'AODTest' AND al.RecordID = ?)
    ORDER BY al.Timestamp DESC
  `, [req.params.id, record.TestID]);
  res.json(history);
});

app.post('/api/nonnegative/:id/notes', (req, res) => {
  const { noteText } = req.body;
  if (!noteText?.trim()) return res.status(400).json({ error: 'Note text required' });
  run(`INSERT INTO NonNegativeNote (NNID, NoteText, CreatedBy) VALUES (?, ?, ?)`, [req.params.id, noteText, null]);
  logAudit(null, 'CREATE', 'NonNegativeNote', req.params.id, `Note added`);
  res.json({ message: 'Note added' });
});

// Close non-negative case by TestID
app.post('/api/nonnegative/:testId/close', (req, res) => {
  const record = queryOne('SELECT NNID FROM NonNegativeRecord WHERE TestID = ?', [req.params.testId]);
  if (!record) return res.status(404).json({ error: 'Non-negative record not found' });
  
  try {
    run(`UPDATE NonNegativeRecord SET Status = 'Closed', ClosedDate = CURRENT_TIMESTAMP WHERE NNID = ?`, [record.NNID]);
    logAudit(null, 'UPDATE', 'NonNegativeRecord', record.NNID, `Case closed via API`);
    res.json({ message: 'Case closed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update non-negative status by TestID
app.put('/api/nonnegative/:testId/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });
  
  const record = queryOne('SELECT NNID FROM NonNegativeRecord WHERE TestID = ?', [req.params.testId]);
  if (!record) return res.status(404).json({ error: 'Non-negative record not found' });
  
  try {
    const closedDate = status === 'Closed' ? 'CURRENT_TIMESTAMP' : 'NULL';
    run(`UPDATE NonNegativeRecord SET Status = ?, ClosedDate = ${closedDate} WHERE NNID = ?`, [status, record.NNID]);
    logAudit(null, 'UPDATE', 'NonNegativeRecord', record.NNID, `Status changed to ${status}`);
    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN SETTINGS
// ============================================

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const adminToken = req.headers['x-admin-token'];
  if (!adminToken || adminToken !== ADMIN_PASSWORD) {
    logger.auth('Admin access attempt', false, { ip: req.ip, url: req.url });
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  logger.auth('Admin access granted', true, { ip: req.ip, url: req.url });
  next();
};
const requireAdmin = adminAuth;

// Ensure AppSettings table exists
try {
  run(`CREATE TABLE IF NOT EXISTS AppSettings (
    SettingID INTEGER PRIMARY KEY AUTOINCREMENT,
    SettingKey TEXT UNIQUE NOT NULL,
    SettingValue TEXT,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { /* Table may exist */ }
ensureColumn('AppSettings', 'ArchiveSettings', 'ArchiveSettings TEXT');

// Get admin settings (AppSettings JSON blob)
app.get('/api/admin/app-settings', (req, res) => {
  try {
    const settings = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'admin'`) || {};
    const parsed = settings.SettingValue ? JSON.parse(settings.SettingValue) : {};
    // Hydrate patientTrackerConfig defaults if not yet saved
    if (!parsed.patientTrackerConfig) {
      parsed.patientTrackerConfig = {
        showClassification: false,
        enableCamp: true,
        classifications: ['First Aid', 'Assessment Only', 'WR Review', 'NWR Review'],
        fatMtcClasses: ['FAT', 'MTC', 'LTI', 'Review'],
        injuryTypes: ['Laceration/Cut', 'Bruise/Contusion', 'Sprain/Strain', 'Fracture', 'Burn', 'Eye Injury', 'Insect Bite/Sting', 'Skin Irritation/Rash', 'Heat Related', 'Respiratory', 'Illness', 'Mental Health', 'Other'],
        bodyLocations: ['Head', 'Face', 'Eye', 'Ear', 'Neck', 'Shoulder', 'Upper Arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Finger', 'Chest', 'Back - Upper', 'Back - Lower', 'Abdomen', 'Hip', 'Thigh', 'Knee', 'Lower Leg', 'Ankle', 'Foot', 'Toe', 'Multiple', 'Other'],
      };
    }
    if (!parsed.oralPanel) {
      parsed.oralPanel = ['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO'];
    }
    if (!parsed.urinePanel) {
      parsed.urinePanel = ['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO'];
    }
    res.json({
      bacAutoClose: parsed.bacAutoClose !== false,
      ...parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update admin settings (deep-merge so partial updates don't clobber other keys)
app.put('/api/admin/app-settings', (req, res) => {
  const incoming = req.body;
  try {
    const row = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'admin'`);
    const existing = row?.SettingValue ? JSON.parse(row.SettingValue) : {};
    const merged = { ...existing, ...incoming };
    const jsonValue = JSON.stringify(merged);
    if (row) {
      run(`UPDATE AppSettings SET SettingValue = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SettingKey = 'admin'`, [jsonValue]);
    } else {
      run(`INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('admin', ?)`, [jsonValue]);
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// REPORTS
// ============================================

app.get('/api/reports/weekly', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  
  // Parse employer IDs if provided
  const employerIds = employers ? employers.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : null;
  const employerFilter = employerIds && employerIds.length > 0 
    ? `AND p.EmployerID IN (${employerIds.join(',')})` 
    : '';
  
  // Test counts by type
  const byType = query(`
    SELECT tt.Name, tt.Code, COUNT(*) as Count
    FROM AODTest t
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY tt.TestTypeID
  `, [startDate, endDate]);
  
  // Total tests
  const totals = query(`
    SELECT 
      COUNT(*) as TotalTests,
      SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegativeCount,
      SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PositiveBACCount,
      SUM(CASE WHEN t.FinalDrugOutcome IN ('Non-Negative', 'Confirmed Positive') THEN 1 ELSE 0 END) as NonNegativeDrugCount
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // DNA count
  const dnaType = queryOne('SELECT TestTypeID FROM TestType WHERE Code = ?', ['DNA']);
  const dnaCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestTypeID = ? AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [dnaType?.TestTypeID, startDate, endDate]);
  
  // By worker type
  const byWorkerType = query(`
    SELECT wt.Name, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY wt.WorkerTypeID
  `, [startDate, endDate]);
  
  // By employer category (Employee/Contractor)
  const byEmployerCategory = query(`
    SELECT e.Category, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);
  
  // RFT count (Referred for Further Testing)
  const rftCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.RFT = 1 AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // Pending lab results
  const pendingLabCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestStatus = 'Pending Lab' AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // Return report data
  res.json({
    byType,
    totals,
    dnaCount,
    byWorkerType,
    byEmployerCategory,
    rftCount,
    pendingLabCount
  });
});

// ============================================
// SCHEDULING AND RANDOM SELECTION
// ============================================

app.post('/api/schedule/random', (req, res) => {
  const { date, count, employerId, workerTypeId } = req.body;
  
  // Get eligible persons
  let sql = 'SELECT PersonID, FullName FROM Person WHERE IsActive = 1';
  const params = [];
  if (employerId) { sql += ' AND EmployerID = ?'; params.push(employerId); }
  if (workerTypeId) { sql += ' AND WorkerTypeID = ?'; params.push(workerTypeId); }
  
  const eligible = query(sql, params);
  
  if (eligible.length === 0) {
    return res.status(400).json({ error: 'No eligible persons found' });
  }
  
  // Random selection
  const shuffled = eligible.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));
  
  // Create scheduled tests â€” each gets a unique TestNumber at scheduling time
  const batchId = `RND-${Date.now()}`;
  const randomTypeId = queryOne('SELECT TestTypeID FROM TestType WHERE Code = ?', ['RND'])?.TestTypeID;
  
  const scheduled = selected.map(p => {
    const testNumber = generateTestNumber();
    run(`INSERT INTO ScheduledTest (PersonID, ScheduledDate, TestTypeID, RandomSelectionBatchID, CreatedBy, TestNumber)
      VALUES (?, ?, ?, ?, ?, ?)`, [p.PersonID, date, randomTypeId, batchId, null, testNumber]);
    return { personId: p.PersonID, fullName: p.FullName, testNumber };
  });
  
  logAudit(null, 'CREATE', 'ScheduledTest', null, `Random selection: ${selected.length} persons for ${date}`);
  res.json({ batchId, count: selected.length, scheduled });
});

app.get('/api/schedule', (req, res) => {
  const { date, status } = req.query;
  let sql = `
    SELECT st.*, p.FullName as PersonName, p.BadgeNumber, e.CompanyName as EmployerName, tt.Name as TestTypeName
    FROM ScheduledTest st
    JOIN Person p ON st.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON st.TestTypeID = tt.TestTypeID
    WHERE 1=1
  `;
  const params = [];
  if (date) { sql += ' AND st.ScheduledDate = ?'; params.push(date); }
  if (status) { sql += ' AND st.Status = ?'; params.push(status); }
  sql += ' ORDER BY st.ScheduledDate DESC, p.FullName';
  
  res.json(query(sql, params));
});

app.put('/api/schedule/:id', (req, res) => {
  try {
    const { status, notes, scheduledDate, scheduledTime, testTypeId, changeReason } = req.body;

    // Fetch current record to detect date change
    const current = queryOne('SELECT * FROM ScheduledTest WHERE ScheduleID = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Scheduled test not found' });

    const dateChanged = scheduledDate !== undefined && scheduledDate !== current.ScheduledDate;

    // Enforce note when date changes
    if (dateChanged && !changeReason?.trim()) {
      return res.status(400).json({ error: 'A reason is required when changing the scheduled date.' });
    }

    // Build dynamic update based on provided fields
    const updates = [];
    const params = [];

    if (status !== undefined) { updates.push('Status = ?'); params.push(status); }
    if (scheduledDate !== undefined) { updates.push('ScheduledDate = ?'); params.push(scheduledDate); }
    if (scheduledTime !== undefined) { updates.push('ScheduledTime = ?'); params.push(scheduledTime); }
    if (testTypeId !== undefined) { updates.push('TestTypeID = ?'); params.push(testTypeId); }

    // Build notes: append audit entry for date changes, otherwise use provided notes
    let finalNotes = notes !== undefined ? notes : (current.Notes || '');
    if (dateChanged) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const auditLine = `[${stamp}] Rescheduled from ${current.ScheduledDate} to ${scheduledDate}: ${changeReason.trim()}`;
      finalNotes = [current.Notes, auditLine].filter(Boolean).join('\n');
      updates.push('RescheduledFrom = ?');
      params.push(current.ScheduledDate);
    }
    updates.push('Notes = ?');
    params.push(finalNotes);
    updates.push('UpdatedAt = ?');
    params.push(new Date().toISOString());

    // If no fields to update, just return current state
    if (updates.length === 0) {
      return res.json({ message: 'No changes', scheduled: current });
    }

    params.push(req.params.id);
    const sql = `UPDATE ScheduledTest SET ${updates.join(', ')} WHERE ScheduleID = ?`;
    run(sql, params);

    // If DNA status, create attendance record
    if (status === 'DNA') {
      const sched = queryOne('SELECT * FROM ScheduledTest WHERE ScheduleID = ?', [req.params.id]);
      run(`
        INSERT INTO AttendanceRecord (PersonID, ScheduledDate, ScheduleID, Reason, CreatedBy)
        VALUES (?, ?, ?, ?, ?)
      `, [sched.PersonID, sched.ScheduledDate, req.params.id, notes, null]);
    }

    // Fetch updated record
    const updated = queryOne(`
      SELECT st.*, p.FullName as PersonName, p.BadgeNumber,
             e.CompanyName as EmployerName, tt.Name as TestTypeName
      FROM ScheduledTest st
      LEFT JOIN Person p ON st.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON st.TestTypeID = tt.TestTypeID
      WHERE st.ScheduleID = ?
    `, [req.params.id]);

    res.json({ message: 'Schedule updated', scheduled: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/schedule/:id', (req, res) => {
  try {
    const sched = queryOne('SELECT * FROM ScheduledTest WHERE ScheduleID = ?', [req.params.id]);
    if (!sched) return res.status(404).json({ error: 'Not found' });
    run('DELETE FROM ScheduledTest WHERE ScheduleID = ?', [req.params.id]);
    logAudit(null, 'DELETE', 'ScheduledTest', req.params.id, `Deleted scheduled test for PersonID ${sched.PersonID}`);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// AOD ANALYTICS â€” flexible date + employer filter
// ============================================

app.get('/api/reports/analytics', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const { filter: empFilter } = buildEmployerFilter(employers);

  const totals = queryOne(`
    SELECT
      COUNT(*) as TotalTests,
      SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegativeCount,
      SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PositiveBACCount,
      SUM(CASE WHEN t.RFT = 1 THEN 1 ELSE 0 END) as RFTCount,
      COUNT(DISTINCT t.PersonID) as UniquePersons
    FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
  `, [startDate, endDate]);

  const byType = query(`
    SELECT tt.Name, tt.Code, COUNT(*) as Count,
           SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegCount
    FROM AODTest t
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
    GROUP BY tt.TestTypeID ORDER BY Count DESC
  `, [startDate, endDate]);

  const drugOutcomes = query(`
    SELECT COALESCE(t.FinalDrugOutcome, 'Not Tested') as Outcome, COUNT(*) as Count
    FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
      AND (t.OralUndertaken = 1 OR t.UrineUndertaken = 1)
    GROUP BY t.FinalDrugOutcome ORDER BY Count DESC
  `, [startDate, endDate]);

  const bacOutcomes = query(`
    SELECT COALESCE(t.FinalBACOutcome, 'Not Tested') as Outcome, COUNT(*) as Count
    FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter} AND t.BACUndertaken = 1
    GROUP BY t.FinalBACOutcome ORDER BY Count DESC
  `, [startDate, endDate]);

  const byEmployer = query(`
    SELECT e.CompanyName, e.Category, COUNT(*) as TotalTests,
           SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegCount,
           SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PosBACCount,
           COUNT(DISTINCT t.PersonID) as UniquePersons
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
    GROUP BY p.EmployerID ORDER BY TotalTests DESC
  `, [startDate, endDate]);

  const byCategory = query(`
    SELECT COALESCE(e.Category, 'Unknown') as Category, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
    GROUP BY e.Category ORDER BY Count DESC
  `, [startDate, endDate]);

  const nonNegatives = query(`
    SELECT t.TestID, t.TestNumber, t.TestDate,
           t.FinalDrugOutcome, t.FinalBACOutcome, t.OralResult,
           t.BACInitialValue, t.BACFinalValue, t.ConfirmatoryResult,
           p.FullName, e.CompanyName, tt.Name as TestTypeName,
           nn.Status as CaseStatus
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN NonNegativeRecord nn ON t.TestID = nn.TestID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter} AND t.IsNonNegative = 1
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);

  const dnaTests = query(`
    SELECT t.TestDate, p.FullName, e.CompanyName, t.Notes
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter} AND tt.Code = 'DNA'
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);

  res.json({
    period: { startDate, endDate },
    totals,
    byType,
    drugOutcomes,
    bacOutcomes,
    byEmployer,
    byCategory,
    nonNegatives,
    dnaTests,
    dnaCount: dnaTests.length
  });
});

app.get('/api/reports/analytics.xlsx', async (req, res) => {
  const { startDate, endDate, employers } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const { filter: empFilter } = buildEmployerFilter(employers);

  const rawTests = query(`
    SELECT t.TestNumber, t.TestDate, t.TestTime,
           p.FullName as PersonName, e.CompanyName, e.Category as WorkerType,
           tt.Name as TestType,
           CASE WHEN t.OralUndertaken = 1 THEN t.OralResult ELSE 'N/A' END as OralResult,
           CASE WHEN t.BACUndertaken = 1 THEN COALESCE(t.BACFinalValue, t.BACInitialValue, 0) ELSE NULL END as BAC,
           CASE WHEN t.UrineUndertaken = 1 THEN t.UrineResult ELSE 'N/A' END as UrineResult,
           t.FinalDrugOutcome, t.FinalBACOutcome, t.ConfirmatoryResult,
           t.TestStatus, t.Notes
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}
    ORDER BY t.TestDate, e.CompanyName, p.FullName
  `, [startDate, endDate]);

  try {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    const ws = wb.addWorksheet('AOD Tests');
    ws.columns = [
      { header: 'Test #',       key: 'TestNumber',         width: 14 },
      { header: 'Date',         key: 'TestDate',           width: 12 },
      { header: 'Time',         key: 'TestTime',           width: 8  },
      { header: 'Name',         key: 'PersonName',         width: 24 },
      { header: 'Company',      key: 'CompanyName',        width: 22 },
      { header: 'Worker Type',  key: 'WorkerType',         width: 16 },
      { header: 'Test Type',    key: 'TestType',           width: 18 },
      { header: 'Oral Result',  key: 'OralResult',         width: 14 },
      { header: 'BAC',          key: 'BAC',                width: 8  },
      { header: 'Urine Result', key: 'UrineResult',        width: 14 },
      { header: 'Drug Outcome', key: 'FinalDrugOutcome',   width: 20 },
      { header: 'BAC Outcome',  key: 'FinalBACOutcome',    width: 14 },
      { header: 'Confirmatory', key: 'ConfirmatoryResult', width: 16 },
      { header: 'Status',       key: 'TestStatus',         width: 14 },
      { header: 'Notes',        key: 'Notes',              width: 30 },
    ];
    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle' };
    });
    rawTests.forEach(row => {
      const r = ws.addRow(row);
      if (row.FinalBACOutcome === 'Positive' || row.FinalDrugOutcome === 'Non-Negative' || row.FinalDrugOutcome === 'Pending Confirmation') {
        r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; });
      }
    });
    ws.autoFilter = { from: 'A1', to: `O${rawTests.length + 1}` };
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AOD_Analytics_${startDate}_${endDate}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Excel export failed: ' + err.message });
  }
});

// â”€â”€ DNA / NON-ATTENDANCE REPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/reports/dna', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const { filter: empFilter } = buildEmployerFilter(employers);

  const baseJoin = `FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
    WHERE tt.Code = 'DNA'
      AND t.TestDate BETWEEN ? AND ? ${empFilter}`;

  // Totals
  const totals = queryOne(`
    SELECT COUNT(t.TestID) as Total,
           SUM(CASE WHEN e.Category = 'SCJV Staff' THEN 1 ELSE 0 END) as SCJVCount,
           SUM(CASE WHEN e.Category = 'Contractor' THEN 1 ELSE 0 END) as ContractorCount,
           COUNT(DISTINCT t.PersonID) as UniquePersons
    ${baseJoin}`, [startDate, endDate]);

  // By company
  const byCompany = query(`
    SELECT e.CompanyName, e.Category, COUNT(t.TestID) as Count,
           COUNT(DISTINCT t.PersonID) as UniquePersons
    ${baseJoin}
    GROUP BY p.EmployerID ORDER BY Count DESC`, [startDate, endDate]);

  // By month
  const byMonth = query(`
    SELECT strftime('%Y-%m', t.TestDate) as Month,
           COUNT(t.TestID) as Total,
           SUM(CASE WHEN e.Category = 'SCJV Staff'  THEN 1 ELSE 0 END) as SCJV,
           SUM(CASE WHEN e.Category = 'Contractor'  THEN 1 ELSE 0 END) as Contractor
    ${baseJoin}
    GROUP BY Month ORDER BY Month ASC`, [startDate, endDate]);

  // Repeat DNA (2+ times within period)
  const repeatOffenders = query(`
    SELECT p.FullName, e.CompanyName, e.Category,
           COUNT(t.TestID) as DNACount,
           MIN(t.TestDate) as FirstDNA,
           MAX(t.TestDate) as LastDNA
    ${baseJoin}
    GROUP BY t.PersonID
    HAVING DNACount >= 2
    ORDER BY DNACount DESC, LastDNA DESC`, [startDate, endDate]);

  // Full detail list
  const detail = query(`
    SELECT t.TestID, t.TestNumber, t.TestDate, t.TestTime,
           p.FullName, e.CompanyName, e.Category as WorkerType,
           c.Name as ClinicianName, t.Notes
    ${baseJoin}
    ORDER BY t.TestDate DESC, e.CompanyName, p.FullName`, [startDate, endDate]);

  res.json({ totals, byCompany, byMonth, repeatOffenders, detail });
});

// â”€â”€ PENDING REPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/reports/pending', (req, res) => {
  const { employers } = req.query;
  const { filter: empFilter } = buildEmployerFilter(employers);

  const testCols = `t.TestID, t.TestNumber, t.TestDate, t.TestTime,
    p.FullName, e.CompanyName, e.Category as WorkerType,
    tt.Name as TestTypeName, c.Name as ClinicianName,
    t.FinalDrugOutcome, t.FinalBACOutcome, t.TestStatus,
    t.OralResult, t.BACFinalValue, t.BACInitialValue, t.UrineResult,
    t.SampleSentToLab, t.LabSentDate, t.LabReference,
    t.ConfirmatoryResult, t.IsNonNegative, t.Notes`;

  const testJoins = `FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID`;

  // 1. Pending Lab â€” sent to lab, awaiting confirmatory result
  const pendingLab = query(
    `SELECT ${testCols}, t.LabSentDate as SentDate ${testJoins}
     WHERE t.TestStatus = 'Pending Lab'
       AND t.SampleSentToLab = 1
       AND (t.ConfirmatoryResult IS NULL OR t.ConfirmatoryResult = '')
       ${empFilter}
     ORDER BY t.LabSentDate ASC, t.TestDate ASC`,
    []);

  // 2. Action Required
  const actionRequired = query(
    `SELECT ${testCols} ${testJoins}
     WHERE t.TestStatus = 'Action Required' ${empFilter}
     ORDER BY t.TestDate ASC`,
    []);

  // 3. Review Required
  const reviewRequired = query(
    `SELECT ${testCols} ${testJoins}
     WHERE t.TestStatus = 'Review Required' ${empFilter}
     ORDER BY t.TestDate ASC`,
    []);

  // 4. Open Non-Negatives (not yet Closed)
  const openNonNeg = query(
    `SELECT ${testCols},
            nn.Status as CaseStatus, nn.FollowUpAction, nn.DetectedSubstances as NNSubstances
     ${testJoins}
     LEFT JOIN NonNegativeRecord nn ON t.TestID = nn.TestID
     WHERE t.IsNonNegative = 1
       AND t.TestStatus NOT IN ('Closed') ${empFilter}
     ORDER BY t.TestDate ASC`,
    []);

  // 5. Overdue Scheduled Tests (scheduled date has passed, still Scheduled/Pending)
  const overdueScheduled = query(
    `SELECT s.ScheduleID, s.ScheduledDate, s.ScheduledTime, s.Status as ScheduleStatus, s.Notes,
            p.FullName, e.CompanyName, tt.Name as TestTypeName,
            c.Name as ClinicianName,
            CAST(julianday('now') - julianday(s.ScheduledDate) AS INTEGER) as DaysOverdue
     FROM ScheduledTest s
     JOIN Person p ON s.PersonID = p.PersonID
     LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
     LEFT JOIN TestType tt ON s.TestTypeID = tt.TestTypeID
     LEFT JOIN Clinician c ON s.AssignedClinicianID = c.ClinicianID
     WHERE s.ScheduledDate < date('now')
       AND s.Status IN ('Scheduled','Pending')
       ${empFilter.replace(/p\.EmployerID/g, 'p.EmployerID')}
     ORDER BY s.ScheduledDate ASC`,
    []);

  // 6. Awaiting Medication Review
  const medicationReview = query(
    `SELECT ${testCols}, t.DeclaredMedications, t.MedicationReviewStatus, t.MedicationReviewNotes
     ${testJoins}
     WHERE t.MedicationReviewStatus IN ('Inconsistent','Pending','Required')
       AND t.TestStatus NOT IN ('Closed') ${empFilter}
     ORDER BY t.TestDate ASC`,
    []);

  res.json({
    summary: {
      pendingLab:        pendingLab.length,
      actionRequired:    actionRequired.length,
      reviewRequired:    reviewRequired.length,
      openNonNeg:        openNonNeg.length,
      overdueScheduled:  overdueScheduled.length,
      medicationReview:  medicationReview.length,
    },
    pendingLab,
    actionRequired,
    reviewRequired,
    openNonNeg,
    overdueScheduled,
    medicationReview,
  });
});

// â”€â”€ VARIATION REPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/reports/variation', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const { filter: empFilter } = buildEmployerFilter(employers);

  const base = `FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${empFilter}`;

  const cols = `t.TestID, t.TestNumber, t.TestDate, t.TestTime,
    p.FullName, e.CompanyName, tt.Name as TestTypeName, tt.Code as TestTypeCode,
    t.OralUndertaken, t.OralResult, t.BACUndertaken, t.BACInitialValue, t.BACFinalValue,
    t.UrineUndertaken, t.UrineResult, t.FinalDrugOutcome, t.FinalBACOutcome,
    t.ConfirmatoryResult, t.TestStatus, t.Notes`;

  const dnaWithResults = query(
    `SELECT ${cols}, 'DNA with results recorded' as VariationReason ${base}
     AND tt.Code = 'DNA'
     AND (t.BACInitialValue > 0 OR (t.OralUndertaken = 1 AND t.OralResult IS NOT NULL)
          OR t.UrineUndertaken = 1)`,
    [startDate, endDate]);

  const noUndertakings = query(
    `SELECT ${cols}, 'No test undertakings recorded' as VariationReason ${base}
     AND tt.Code != 'DNA'
     AND (t.OralUndertaken = 0 OR t.OralUndertaken IS NULL)
     AND (t.BACUndertaken  = 0 OR t.BACUndertaken  IS NULL)
     AND (t.UrineUndertaken= 0 OR t.UrineUndertaken IS NULL)`,
    [startDate, endDate]);

  const missingNonNegFlag = query(
    `SELECT ${cols}, 'Non-negative outcome without IsNonNegative flag' as VariationReason ${base}
     AND (t.FinalDrugOutcome IN ('Non-Negative','Confirmed Positive','Confirmed - Pending Review','Pending Confirmation')
          OR t.FinalBACOutcome = 'Positive')
     AND (t.IsNonNegative = 0 OR t.IsNonNegative IS NULL)`,
    [startDate, endDate]);

  const bacMismatch = query(
    `SELECT ${cols}, 'Positive BAC value but Negative/null outcome' as VariationReason ${base}
     AND t.BACUndertaken = 1
     AND (t.BACInitialValue > 0 OR t.BACFinalValue > 0)
     AND (t.FinalBACOutcome = 'Negative' OR t.FinalBACOutcome IS NULL)`,
    [startDate, endDate]);

  const labNoResult = query(
    `SELECT ${cols}, 'Sample sent to lab â€” no result, not pending' as VariationReason ${base}
     AND t.SampleSentToLab = 1
     AND (t.ConfirmatoryResult IS NULL OR t.ConfirmatoryResult = '')
     AND t.TestStatus NOT IN ('Pending Lab','Action Required','Review Required')`,
    [startDate, endDate]);

  const oralMismatch = query(
    `SELECT ${cols}, 'Oral Non-Negative but final outcome Negative' as VariationReason ${base}
     AND t.OralResult IN ('Non-Negative','Non- Negative')
     AND t.FinalDrugOutcome = 'Negative'`,
    [startDate, endDate]);

  const seen = new Set();
  const all = [];
  for (const row of [...dnaWithResults, ...noUndertakings, ...missingNonNegFlag, ...bacMismatch, ...labNoResult, ...oralMismatch]) {
    if (!seen.has(row.TestID)) { seen.add(row.TestID); all.push(row); }
  }
  all.sort((a, b) => (a.TestDate < b.TestDate ? 1 : -1));

  res.json({
    total: all.length,
    breakdown: {
      dnaWithResults: dnaWithResults.length,
      noUndertakings: noUndertakings.length,
      missingNonNegFlag: missingNonNegFlag.length,
      bacMismatch: bacMismatch.length,
      labNoResult: labNoResult.length,
      oralMismatch: oralMismatch.length,
    },
    tests: all
  });
});

// â”€â”€ CUSTOM QUERY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCustomQueryConditions(q) {
  const {
    startDate, endDate, employers, testTypes,
    drugOutcome, bacOutcome, testStatus,
    oralUndertaken, bacUndertaken, urineUndertaken,
    nonNegOnly, sampleSentOnly, rftOnly,
    confirmatoryResult, overallResult,
    clinicianId, workerType,
    bacMin, bacMax,
    search
  } = q;

  const conditions = ['t.TestDate BETWEEN ? AND ?'];
  const params = [startDate, endDate];

  if (employers) {
    const ids = employers.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    if (ids.length) conditions.push(`p.EmployerID IN (${ids.join(',')})`);
  }
  if (testTypes) {
    const codes = testTypes.split(',').map(c => `'${c.replace(/'/g,"''")}'`);
    if (codes.length) conditions.push(`tt.Code IN (${codes.join(',')})`);
  }
  if (drugOutcome)           { conditions.push(`t.FinalDrugOutcome = ?`);    params.push(drugOutcome); }
  if (bacOutcome)            { conditions.push(`t.FinalBACOutcome = ?`);     params.push(bacOutcome); }
  if (testStatus)            { conditions.push(`t.TestStatus = ?`);          params.push(testStatus); }
  if (confirmatoryResult)    { conditions.push(`t.ConfirmatoryResult = ?`);  params.push(confirmatoryResult); }
  if (overallResult)         { conditions.push(`t.OverallAODResult = ?`);    params.push(overallResult); }
  if (clinicianId)           { conditions.push(`t.ClinicianID = ?`);         params.push(parseInt(clinicianId)); }
  if (workerType)            { conditions.push(`wt.Name = ?`);               params.push(workerType); }
  if (oralUndertaken==='1')  conditions.push(`t.OralUndertaken = 1`);
  if (bacUndertaken==='1')   conditions.push(`t.BACUndertaken = 1`);
  if (urineUndertaken==='1') conditions.push(`t.UrineUndertaken = 1`);
  if (nonNegOnly==='1')      conditions.push(`t.IsNonNegative = 1`);
  if (sampleSentOnly==='1')  conditions.push(`t.SampleSentToLab = 1`);
  if (rftOnly==='1')         conditions.push(`t.RFT = 1`);
  if (bacMin)                { conditions.push(`COALESCE(t.BACFinalValue, t.BACInitialValue, 0) >= ?`); params.push(parseFloat(bacMin)); }
  if (bacMax)                { conditions.push(`COALESCE(t.BACFinalValue, t.BACInitialValue, 0) <= ?`); params.push(parseFloat(bacMax)); }
  if (search) {
    conditions.push(`(LOWER(p.FullName) LIKE ? OR LOWER(t.TestNumber) LIKE ? OR LOWER(e.CompanyName) LIKE ? OR LOWER(COALESCE(c.Name,'')) LIKE ?)`);
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  return { conditions, params };
}

const CQ_SELECT = `
  SELECT t.TestID, t.TestNumber, t.TestDate, t.TestTime,
         p.FullName, p.DateOfBirth,
         e.CompanyName, e.Category as WorkerType,
         wt.Name as WorkerTypeName,
         tt.Name as TestTypeName, tt.Code as TestTypeCode,
         c.Name as ClinicianName,
         t.OralUndertaken, t.OralResult,
         t.BACUndertaken, t.BACInitialValue, t.BACFinalValue, t.BACInitialTime, t.BACFinalTime,
         t.UrineUndertaken, t.UrineResult,
         t.FinalDrugOutcome, t.FinalBACOutcome, t.OverallAODResult,
         t.ConfirmatoryResult, t.ConfirmatoryResultDate,
         t.TestStatus, t.RFT, t.SampleSentToLab, t.IsNonNegative,
         t.DeclaredMedications, t.DetectedSubstances, t.Notes
  FROM AODTest t
  JOIN Person p ON t.PersonID = p.PersonID
  LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
  LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
  JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
  LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID`;

app.get('/api/reports/custom-query', (req, res) => {
  if (!req.query.startDate || !req.query.endDate)
    return res.status(400).json({ error: 'startDate and endDate required' });

  const { conditions, params } = buildCustomQueryConditions(req.query);

  const rows = query(`${CQ_SELECT}
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.TestDate DESC, p.FullName
    LIMIT 2000`, params);

  // Summary stats over the filtered set
  const total = rows.length;
  const nonNeg = rows.filter(r => r.IsNonNegative).length;
  const posBAC = rows.filter(r => r.FinalBACOutcome === 'Positive').length;
  const rft    = rows.filter(r => r.RFT).length;
  const pendingLab = rows.filter(r => r.TestStatus === 'Pending Lab').length;

  res.json({ total, summary: { nonNeg, posBAC, rft, pendingLab }, rows });
});

app.get('/api/reports/custom-query.xlsx', async (req, res) => {
  if (!req.query.startDate || !req.query.endDate)
    return res.status(400).json({ error: 'startDate and endDate required' });

  const { conditions, params } = buildCustomQueryConditions(req.query);
  const rows = query(`${CQ_SELECT}
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.TestDate DESC, p.FullName
    LIMIT 5000`, params);

  try {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    const ws = wb.addWorksheet('Custom Query');
    ws.columns = [
      { header: 'Test #',          key: 'TestNumber',          width: 14 },
      { header: 'Date',            key: 'TestDate',            width: 12 },
      { header: 'Time',            key: 'TestTime',            width: 8  },
      { header: 'Person',          key: 'FullName',            width: 24 },
      { header: 'DOB',             key: 'DateOfBirth',         width: 12 },
      { header: 'Company',         key: 'CompanyName',         width: 22 },
      { header: 'Worker Type',     key: 'WorkerTypeName',      width: 14 },
      { header: 'Test Type',       key: 'TestTypeName',        width: 18 },
      { header: 'Clinician',       key: 'ClinicianName',       width: 18 },
      { header: 'Oral Result',     key: 'OralResult',          width: 14 },
      { header: 'BAC Initial',     key: 'BACInitialValue',     width: 10 },
      { header: 'BAC Final',       key: 'BACFinalValue',       width: 10 },
      { header: 'Urine Result',    key: 'UrineResult',         width: 14 },
      { header: 'Drug Outcome',    key: 'FinalDrugOutcome',    width: 20 },
      { header: 'BAC Outcome',     key: 'FinalBACOutcome',     width: 14 },
      { header: 'Overall Result',  key: 'OverallAODResult',    width: 14 },
      { header: 'Confirmatory',    key: 'ConfirmatoryResult',  width: 20 },
      { header: 'Status',          key: 'TestStatus',          width: 14 },
      { header: 'RFT',             key: 'RFT',                 width: 6  },
      { header: 'Lab Sent',        key: 'SampleSentToLab',     width: 8  },
      { header: 'Medications',     key: 'DeclaredMedications', width: 22 },
      { header: 'Notes',           key: 'Notes',               width: 30 },
    ];
    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle' };
    });
    rows.forEach(row => {
      const r = ws.addRow(row);
      if (row.IsNonNegative || row.FinalBACOutcome === 'Positive') {
        r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; });
      }
    });
    ws.autoFilter = { from: 'A1', to: `V${rows.length + 1}` };
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Custom_Query_${req.query.startDate}_${req.query.endDate}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

// ============================================
// REPORTS
// ============================================

app.get('/api/reports/weekly', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  
  // Parse employer IDs if provided
  const employerIds = employers ? employers.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : null;
  const employerFilter = employerIds && employerIds.length > 0 
    ? `AND p.EmployerID IN (${employerIds.join(',')})` 
    : '';
  
  // Test counts by type
  const byType = query(`
    SELECT tt.Name, tt.Code, COUNT(*) as Count
    FROM AODTest t
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY tt.TestTypeID
  `, [startDate, endDate]);
  
  // Total tests
  const totals = query(`
    SELECT 
      COUNT(*) as TotalTests,
      SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegativeCount,
      SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PositiveBACCount,
      SUM(CASE WHEN t.FinalDrugOutcome IN ('Non-Negative', 'Confirmed Positive') THEN 1 ELSE 0 END) as NonNegativeDrugCount
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // DNA count
  const dnaType = queryOne('SELECT TestTypeID FROM TestType WHERE Code = ?', ['DNA']);
  const dnaCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestTypeID = ? AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [dnaType?.TestTypeID, startDate, endDate]);
  
  // By worker type
  const byWorkerType = query(`
    SELECT wt.Name, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY wt.WorkerTypeID
  `, [startDate, endDate]);
  
  // By employer category (Employee/Contractor)
  const byEmployerCategory = query(`
    SELECT e.Category, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);
  
  // RFT count (Referred for Further Testing)
  const rftCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.RFT = 1 AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // Pending lab results
  const pendingLabCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestStatus = 'Pending Lab' AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);
  
  // Drug outcome breakdown
  const drugOutcomes = query(`
    SELECT t.FinalDrugOutcome as Outcome, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalDrugOutcome IS NOT NULL
    GROUP BY t.FinalDrugOutcome
  `, [startDate, endDate]);
  
  // Alcohol outcome breakdown
  const alcoholOutcomes = query(`
    SELECT t.FinalBACOutcome as Outcome, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalBACOutcome IS NOT NULL
    GROUP BY t.FinalBACOutcome
  `, [startDate, endDate]);
  
  res.json({
    period: { startDate, endDate },
    totals: totals[0] || { TotalTests: 0, NonNegativeCount: 0, PositiveBACCount: 0, NonNegativeDrugCount: 0 },
    byType,
    byWorkerType,
    byEmployerCategory,
    dnaCount: dnaCount?.Count || 0,
    rftCount: rftCount?.Count || 0,
    pendingLabCount: pendingLabCount?.Count || 0,
    drugOutcomes,
    alcoholOutcomes
  });
});

app.get('/api/reports/weekly.xlsx', (req, res) => {
  const { startDate, endDate, employers } = req.query;
  
  const { filter: employerFilter } = buildEmployerFilter(employers);
  
  // Reuse same queries as JSON endpoint
  const byType = query(`
    SELECT tt.Name, tt.Code, COUNT(*) as Count
    FROM AODTest t
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY tt.TestTypeID
  `, [startDate, endDate]);

  const totals = query(`
    SELECT 
      COUNT(*) as TotalTests,
      SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegativeCount,
      SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PositiveBACCount,
      SUM(CASE WHEN t.FinalDrugOutcome IN ('Non-Negative', 'Confirmed Positive') THEN 1 ELSE 0 END) as NonNegativeDrugCount
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const dnaType = queryOne('SELECT TestTypeID FROM TestType WHERE Code = ?', ['DNA']);
  const dnaCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestTypeID = ? AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [dnaType?.TestTypeID, startDate, endDate]);

  const byWorkerType = query(`
    SELECT wt.Name, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY wt.WorkerTypeID
  `, [startDate, endDate]);

  const byEmployerCategory = query(`
    SELECT e.Category, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);

  const rftCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.RFT = 1 AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const pendingLabCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestStatus = 'Pending Lab' AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const drugOutcomes = query(`
    SELECT t.FinalDrugOutcome as Outcome, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalDrugOutcome IS NOT NULL
    GROUP BY t.FinalDrugOutcome
  `, [startDate, endDate]);

  const alcoholOutcomes = query(`
    SELECT t.FinalBACOutcome as Outcome, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalBACOutcome IS NOT NULL
    GROUP BY t.FinalBACOutcome
  `, [startDate, endDate]);

  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ['Weekly AOD Report'],
    ['Period Start', startDate],
    ['Period End', endDate],
    [''],
    ['Metric', 'Value'],
    ['Total Tests', totals?.[0]?.TotalTests ?? 0],
    ['Non-Negative', totals?.[0]?.NonNegativeCount ?? 0],
    ['Positive BAC', totals?.[0]?.PositiveBACCount ?? 0],
    ['Non-Negative Drugs', totals?.[0]?.NonNegativeDrugCount ?? 0],
    ['Did Not Attend (DNA)', dnaCount?.Count ?? 0],
    ['RFT Count', rftCount?.Count ?? 0],
    ['Pending Lab Count', pendingLabCount?.Count ?? 0]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');

  const wsByType = XLSX.utils.json_to_sheet(byType || []);
  XLSX.utils.book_append_sheet(workbook, wsByType, 'By Test Type');

  const wsWorker = XLSX.utils.json_to_sheet(byWorkerType || []);
  XLSX.utils.book_append_sheet(workbook, wsWorker, 'By Worker Type');

  const wsEmpCat = XLSX.utils.json_to_sheet(byEmployerCategory || []);
  XLSX.utils.book_append_sheet(workbook, wsEmpCat, 'By Employer Category');

  const wsDrug = XLSX.utils.json_to_sheet(drugOutcomes || []);
  XLSX.utils.book_append_sheet(workbook, wsDrug, 'Drug Outcomes');

  const wsAlcohol = XLSX.utils.json_to_sheet(alcoholOutcomes || []);
  XLSX.utils.book_append_sheet(workbook, wsAlcohol, 'Alcohol Outcomes');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const filename = `Weekly_AOD_Report_${startDate}_to_${endDate}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

app.get('/api/reports/quarterly.xlsx', (req, res) => {
  const { year, quarter, employers } = req.query;
  
  const quarters = {
    1: { start: `${year}-01-01`, end: `${year}-03-31` },
    2: { start: `${year}-04-01`, end: `${year}-06-30` },
    3: { start: `${year}-07-01`, end: `${year}-09-30` },
    4: { start: `${year}-10-01`, end: `${year}-12-31` }
  };
  
  const { start, end } = quarters[quarter] || quarters[1];
  
  const employerIds = employers ? employers.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : null;
  const employerFilter = employerIds && employerIds.length > 0 
    ? `AND p.EmployerID IN (${employerIds.join(',')})` 
    : '';
  
  const tests = query(`
    SELECT t.TestNumber, t.TestDate, t.TestTime, tt.Name as TestTypeName,
           p.FullName as PersonName, e.CompanyName as EmployerName, e.Category as EmployerCategory,
           t.FinalDrugOutcome, t.FinalBACOutcome, t.TestStatus
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    ORDER BY t.TestDate
  `, [start, end]);

  const employerResults = query(`
    SELECT e.CompanyName, e.Category, COUNT(*) as TestCount
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.EmployerID
    ORDER BY e.Category, e.CompanyName
  `, [start, end]);

  const nonNegs = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName as PersonName, e.CompanyName as EmployerName,
           t.FinalDrugOutcome, t.FinalBACOutcome, t.DetectedSubstances,
           nn.FollowUpAction, nn.Status
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN NonNegativeRecord nn ON t.TestID = nn.TestID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.IsNonNegative = 1
    ORDER BY t.TestDate
  `, [start, end]);

  const pending = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName as PersonName, e.CompanyName as EmployerName,
           pr.Status
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    JOIN PendingResult pr ON t.TestID = pr.TestID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND pr.Status = 'Awaiting'
  `, [start, end]);

  const byType = query(`
    SELECT tt.Name, COUNT(*) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY tt.TestTypeID
  `, [start, end]);

  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ['Quarterly AOD Report'],
    ['Year', year],
    ['Quarter', quarter],
    ['Period Start', start],
    ['Period End', end],
    [''],
    ['Total Tests', tests.length],
    ['Unique Employers', employerResults.length]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(byType || []), 'By Test Type');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employerResults || []), 'Employers');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pending || []), 'Pending');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(nonNegs || []), 'Non-Negatives');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tests || []), 'Tests');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const filename = `Quarterly_AOD_Report_Q${quarter}_${year}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

app.get('/api/reports/quarterly.template.xlsx', (req, res) => {
  const { year, quarter, category } = req.query;
  const employerCategory = category === 'SCJV Staff' ? 'SCJV Staff' : 'Contractor';

  const quarters = {
    1: { start: `${year}-01-01`, end: `${year}-03-31`, periodLabel: 'Jan-Mar', quarterLabel: 'Q1' },
    2: { start: `${year}-04-01`, end: `${year}-06-30`, periodLabel: 'Apr-Jun', quarterLabel: 'Q2' },
    3: { start: `${year}-07-01`, end: `${year}-09-30`, periodLabel: 'Jul-Sep', quarterLabel: 'Q3' },
    4: { start: `${year}-10-01`, end: `${year}-12-31`, periodLabel: 'Oct-Dec', quarterLabel: 'Q4' }
  };

  const q = quarters[quarter] || quarters[1];

  const templateFile = employerCategory === 'SCJV Staff'
    ? 'quarterly_scjv_template.xlsx'
    : 'quarterly_contractors_template.xlsx';
  const templatePath = join(__dirname, '..', templateFile);
  if (!existsSync(templatePath)) {
    return res.status(500).json({ error: `Template file not found: ${templateFile}` });
  }
  const workbook = XLSX.readFile(templatePath, { cellDates: true });
  const sheetName = workbook.SheetNames.includes('Report') ? 'Report' : workbook.SheetNames.find(n => n.toLowerCase() === 'report') || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];

  // Update driver cells
  ws.B3 = { t: 'n', v: parseInt(year) };
  ws.B4 = { t: 's', v: q.periodLabel };

  // Find row numbers for each test type in column A
  const findRowByLabel = (label) => {
    const ref = ws['!ref'];
    if (!ref) return null;
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 0 });
      const v = ws[addr]?.v;
      if (typeof v === 'string' && v.trim().toLowerCase() === label.trim().toLowerCase()) {
        return r + 1;
      }
    }
    return null;
  };

  // Aggregate counts for a specific set of tests (by TestTypeID)
  const aggregateCounts = (testTypeIds = []) => {
    const typeFilter = testTypeIds.length > 0 ? `AND t.TestTypeID IN (${testTypeIds.join(',')})` : '';

    const baseSql = `
      FROM AODTest t
      JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE t.TestDate BETWEEN ? AND ?
        AND e.Category = ?
        ${typeFilter}
    `;

    // Alcohol tests: use FinalBACOutcome when available (template is alcohol testing summary)
    const alcoholTotal = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND t.FinalBACOutcome IS NOT NULL
        AND t.FinalBACOutcome != 'N/A'
    `, [q.start, q.end, employerCategory])?.Count || 0;

    const alcoholNeg = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND t.FinalBACOutcome = 'Negative'
    `, [q.start, q.end, employerCategory])?.Count || 0;

    const alcoholPos = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND t.FinalBACOutcome = 'Positive'
    `, [q.start, q.end, employerCategory])?.Count || 0;

    // Drug tests: use OralResult as a signal a drug test was undertaken
    const drugTotal = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND t.OralResult IS NOT NULL
        AND t.OralResult != 'N/A'
    `, [q.start, q.end, employerCategory])?.Count || 0;

    // Drug negative: oral negative OR confirmatory negative OR final drug outcome indicates negative
    const drugNeg = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND (
          t.OralResult = 'Negative'
          OR t.ConfirmatoryResult = 'Negative'
          OR t.FinalDrugOutcome IN ('Negative', 'Confirmed Negative')
        )
    `, [q.start, q.end, employerCategory])?.Count || 0;

    // Drug positive: action required OR final drug outcome inconsistent/positive
    const drugPos = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND (
          t.TestStatus = 'Action Required'
          OR t.FinalDrugOutcome IN ('Confirmed - Inconsistent', 'Confirmed Positive')
        )
    `, [q.start, q.end, employerCategory])?.Count || 0;

    // Pending/Other: pending lab + review required + refused/invalid/cancelled + any other residual non-negative cases
    const drugPendingOther = queryOne(`
      SELECT COUNT(*) as Count
      ${baseSql}
        AND (
          t.TestStatus IN ('Pending Lab', 'Review Required')
          OR t.OralResult IN ('Refused', 'Invalid')
          OR t.ConfirmatoryResult = 'Cancelled'
          OR (
            t.OralResult = 'Non-Negative'
            AND (
              t.ConfirmatoryResult IS NULL
              OR t.ConfirmatoryResult = ''
              OR t.ConfirmatoryResult = 'Pending'
            )
          )
        )
    `, [q.start, q.end, employerCategory])?.Count || 0;

    return {
      alcohol: { total: alcoholTotal, neg: alcoholNeg, pos: alcoholPos },
      drug: { total: drugTotal, neg: drugNeg, pos: drugPos, pendingOther: drugPendingOther }
    };
  };

  const testTypeLookup = query('SELECT TestTypeID, Name, Code FROM TestType');
  const byCode = Object.fromEntries(testTypeLookup.map(t => [t.Code, t.TestTypeID]));
  const byName = Object.fromEntries(testTypeLookup.map(t => [t.Name, t.TestTypeID]));

  const preEmploymentIds = [byCode.PRE].filter(Boolean);
  const randomIds = [byCode.RND].filter(Boolean);
  const postIncidentIds = [byCode.INC].filter(Boolean);
  const forCauseIds = [byCode.CAU].filter(Boolean);
  const didNotAttendIds = [byCode.DNA].filter(Boolean);
  const portAuthorityIds = [byCode.PA].filter(Boolean);
  const blanketIds = [byCode.BLK].filter(Boolean);

  // Map our types into template rows
  const rowMap = [
    { label: 'Pre-Employment', ids: preEmploymentIds },
    { label: 'Random Testing', ids: randomIds },
    { label: 'Post incident Testing', ids: postIncidentIds },
    { label: 'For cause/Reasonable Suspicion Testing', ids: forCauseIds },
    // Put anything not mapped into "Other type" (including PA/Blanket/DNA, plus any unknown types)
    { label: 'Other type (Please specify)', ids: [...portAuthorityIds, ...blanketIds, ...didNotAttendIds] }
  ];

  // Fill table cells for each mapped row
  // Columns: B C D = Alcohol (total/neg/pos), E F G H = Drug (total/neg/pos/pendingOther)
  for (const rm of rowMap) {
    const rowNum = findRowByLabel(rm.label);
    if (!rowNum) continue;
    const counts = aggregateCounts(rm.ids);

    ws[`B${rowNum}`] = { t: 'n', v: counts.alcohol.total };
    ws[`C${rowNum}`] = { t: 'n', v: counts.alcohol.neg };
    ws[`D${rowNum}`] = { t: 'n', v: counts.alcohol.pos };

    ws[`E${rowNum}`] = { t: 'n', v: counts.drug.total };
    ws[`F${rowNum}`] = { t: 'n', v: counts.drug.neg };
    ws[`G${rowNum}`] = { t: 'n', v: counts.drug.pos };
    ws[`H${rowNum}`] = { t: 'n', v: counts.drug.pendingOther };
  }

  // Total row
  const totalRow = findRowByLabel('Total');
  if (totalRow) {
    const counts = aggregateCounts([]);
    ws[`B${totalRow}`] = { t: 'n', v: counts.alcohol.total };
    ws[`C${totalRow}`] = { t: 'n', v: counts.alcohol.neg };
    ws[`D${totalRow}`] = { t: 'n', v: counts.alcohol.pos };
    ws[`E${totalRow}`] = { t: 'n', v: counts.drug.total };
    ws[`F${totalRow}`] = { t: 'n', v: counts.drug.neg };
    ws[`G${totalRow}`] = { t: 'n', v: counts.drug.pos };
    ws[`H${totalRow}`] = { t: 'n', v: counts.drug.pendingOther };
  }

  // Distinct people involved in alcohol/drug testing (D6 and G6)
  const distinctAlcoholPeople = queryOne(`
    SELECT COUNT(DISTINCT t.PersonID) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ?
      AND e.Category = ?
      AND t.FinalBACOutcome IS NOT NULL
      AND t.FinalBACOutcome != 'N/A'
  `, [q.start, q.end, employerCategory])?.Count || 0;

  const distinctDrugPeople = queryOne(`
    SELECT COUNT(DISTINCT t.PersonID) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ?
      AND e.Category = ?
      AND t.OralResult IS NOT NULL
      AND t.OralResult != 'N/A'
  `, [q.start, q.end, employerCategory])?.Count || 0;

  ws.D6 = { t: 'n', v: distinctAlcoholPeople };
  ws.G6 = { t: 'n', v: distinctDrugPeople };

  // Keep formulas/styles as-is, just write values.
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const filename = `AOD_Quarterly_${employerCategory === 'Contractor' ? 'Contractors' : 'SCJV'}_${q.quarterLabel}_${year}_Template.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

app.get('/api/reports/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const todayStats = queryOne(`
    SELECT COUNT(*) as count FROM AODTest WHERE TestDate = ?
  `, [today]);
  
  const weekStats = queryOne(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN IsNonNegative = 1 THEN 1 ELSE 0 END) as nonNegative,
      SUM(CASE WHEN IsPending = 1 THEN 1 ELSE 0 END) as pending
    FROM AODTest WHERE TestDate >= ?
  `, [weekAgo]);
  
  const pendingCount = queryOne(`SELECT COUNT(*) as count FROM PendingResult WHERE Status = 'Awaiting'`);
  // Count open non-negatives as any record not yet closed (includes Open, In Review, Confirmed, Cleared)
  const openNonNegs = queryOne(`SELECT COUNT(*) as count FROM NonNegativeRecord WHERE Status != 'Closed'`);
  // Count both scheduled tests AND imported random list entries for today
  const scheduledTestsToday = queryOne(`SELECT COUNT(*) as count FROM ScheduledTest WHERE ScheduledDate = ? AND Status = 'Scheduled'`, [today]);
  const randomListToday = queryOne(`SELECT COUNT(*) as count FROM RandomTestEntry rte JOIN RandomTestList rtl ON rte.ListID = rtl.ListID WHERE rtl.ListDate = ? AND rte.Status = 'Pending'`, [today]);
  const scheduledToday = { count: (scheduledTestsToday?.count || 0) + (randomListToday?.count || 0) };
  
  // Recent tests
  const recentTests = query(`
    SELECT t.TestID, t.TestNumber, t.TestDate, t.FinalBACOutcome, t.FinalDrugOutcome,
           p.FullName, tt.Name as TestTypeName
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    ORDER BY t.CreatedAt DESC LIMIT 10
  `);
  
  // Weekly trend
  const weeklyTrend = query(`
    SELECT TestDate, COUNT(*) as Count
    FROM AODTest
    WHERE TestDate >= ?
    GROUP BY TestDate
    ORDER BY TestDate
  `, [weekAgo]);
  
  res.json({
    today: todayStats.count,
    weekTotal: weekStats.total,
    weekNonNegative: weekStats.nonNegative,
    pendingResults: pendingCount.count,
    openNonNegatives: openNonNegs.count,
    scheduledToday: scheduledToday.count,
    recentTests,
    weeklyTrend
  });
});

// ============================================
// USER MANAGEMENT
// ============================================

app.get('/api/users', (req, res) => {
  const { includeInactive, cliniciansOnly } = req.query;
  let sql = USER_SELECT + ' WHERE 1=1';
  if (!includeInactive) sql += ' AND u.IsActive = 1';
  if (cliniciansOnly)   sql += ' AND u.IsClinician = 1';
  sql += ' ORDER BY u.LastName, u.FirstName, u.FullName';
  res.json(query(sql));
});

app.get('/api/users/roles', (req, res) => {
  res.json(query('SELECT * FROM Role ORDER BY RoleID'));
});

app.get('/api/users/:id', (req, res) => {
  const user = queryOne(USER_SELECT + ' WHERE u.UserID = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/api/users', (req, res) => {
  const { username, password, firstName, lastName, fullName, email, uniqueId,
          roleId, isClinician, credentials, isActive } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!password) return res.status(400).json({ error: 'password is required' });

  const derivedFullName = fullName || [firstName, lastName].filter(Boolean).join(' ') || username;

  const exists = queryOne('SELECT COUNT(*) as count FROM User WHERE Username = ?', [username]);
  if (exists.count > 0) return res.status(400).json({ error: 'Username already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = run(`
    INSERT INTO User (Username, PasswordHash, FullName, FirstName, LastName, Email,
                      UniqueID, RoleID, IsClinician, Credentials, IsActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [username, hash, derivedFullName, firstName || null, lastName || null, email || null,
      uniqueId || null, roleId || null, isClinician ? 1 : 0, credentials || null,
      isActive !== undefined ? (isActive ? 1 : 0) : 1]);

  logAudit(null, 'CREATE', 'User', result.lastInsertRowid, `Created user: ${username}`);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/users/:id', (req, res) => {
  const { firstName, lastName, fullName, email, uniqueId,
          roleId, isClinician, credentials, isActive, password } = req.body;

  const existing = queryOne('SELECT * FROM User WHERE UserID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const derivedFullName = fullName
    || [firstName ?? existing.FirstName, lastName ?? existing.LastName].filter(Boolean).join(' ')
    || existing.FullName;

  if (password) {
    run('UPDATE User SET PasswordHash=? WHERE UserID=?', [bcrypt.hashSync(password, 10), req.params.id]);
  }

  run(`UPDATE User SET FullName=?, FirstName=?, LastName=?, Email=?, UniqueID=?,
       RoleID=?, IsClinician=?, Credentials=?, IsActive=? WHERE UserID=?`,
    [derivedFullName,
     firstName !== undefined ? firstName : existing.FirstName,
     lastName  !== undefined ? lastName  : existing.LastName,
     email     !== undefined ? email     : existing.Email,
     uniqueId  !== undefined ? uniqueId  : existing.UniqueID,
     roleId    !== undefined ? roleId    : existing.RoleID,
     isClinician !== undefined ? (isClinician ? 1 : 0) : existing.IsClinician,
     credentials !== undefined ? credentials : existing.Credentials,
     isActive  !== undefined ? (isActive ? 1 : 0) : existing.IsActive,
     req.params.id]);

  logAudit(null, 'UPDATE', 'User', req.params.id, `Updated user: ${existing.Username}`);
  res.json({ message: 'User updated' });
});

app.delete('/api/users/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM User WHERE UserID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (existing.Username === 'admin') return res.status(400).json({ error: 'Cannot delete the admin user' });
  run('UPDATE User SET IsActive = 0 WHERE UserID = ?', [req.params.id]);
  logAudit(null, 'DELETE', 'User', req.params.id, `Deactivated user: ${existing.Username}`);
  res.json({ message: 'User deactivated' });
});

// ============================================
// AUDIT LOG
// ============================================

app.get('/api/audit', (req, res) => {
  const { limit = 100, recordType, userId } = req.query;
  
  let sql = `
    SELECT a.*, u.FullName as UserName
    FROM AuditLog a
    LEFT JOIN User u ON a.UserID = u.UserID
    WHERE 1=1
  `;
  const params = [];
  
  if (recordType) { sql += ' AND a.RecordType = ?'; params.push(recordType); }
  if (userId) { sql += ' AND a.UserID = ?'; params.push(userId); }
  
  sql += ` ORDER BY a.Timestamp DESC LIMIT ${parseInt(limit)}`;
  
  res.json(query(sql, params));
});

// ============================================
// PATIENT EVENTS ROUTES
// ============================================

app.get('/api/patient-events', (req, res) => {
  const { date, startDate, endDate, eventType, personId } = req.query;
  
  let sql = `
    SELECT pe.*, 
           COALESCE(pe.PatientName, p.FullName) as PersonName, 
           p.BadgeNumber, 
           COALESCE(pe.Workgroup, e.CompanyName) as EmployerName,
           c.Name as ClinicianName
    FROM PatientEvent pe
    LEFT JOIN Person p ON pe.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN Clinician c ON pe.ClinicianID = c.ClinicianID
    WHERE 1=1
  `;
  const params = [];
  
  if (date) { sql += ' AND pe.EventDate = ?'; params.push(date); }
  if (startDate) { sql += ' AND pe.EventDate >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND pe.EventDate <= ?'; params.push(endDate); }
  if (eventType) { sql += ' AND pe.WrNwr = ?'; params.push(eventType); }
  if (personId) { sql += ' AND pe.PersonID = ?'; params.push(personId); }
  
  sql += ' ORDER BY pe.EventDate DESC, pe.EventTime DESC';
  res.json(query(sql, params));
});

app.post('/api/patient-events', (req, res) => {
  const { 
    eventDate, eventTime, personId, patientName, workgroup, wrNwr,
    bodyLocation, injuryType, classification, rtwPlan, drConsult,
    referral, comment, endOfWeekTracker
  } = req.body;
  
  try {
    const result = run(`
      INSERT INTO PatientEvent (EventDate, EventTime, PersonID, PatientName, Workgroup, WrNwr,
        BodyLocation, InjuryType, Classification, RtwPlan, DrConsult, Referral, Comment, EndOfWeekTracker, CreatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [eventDate, eventTime, personId || null, patientName || null, workgroup || null, wrNwr,
        bodyLocation || null, injuryType || null, classification || null, rtwPlan || null, drConsult ? 1 : 0, 
        referral || null, comment || null, endOfWeekTracker ? 1 : 0, null]);
    
    logAudit(null, 'CREATE', 'PatientEvent', result.lastInsertRowid, `Created patient event: ${wrNwr}`);
    res.json({ id: result.lastInsertRowid, message: 'Event created' });
  } catch (err) {
    logger.error('Failed to create patient event', { error: err.message });
    res.status(500).json({ error: 'Failed to create event: ' + err.message });
  }
});

app.put('/api/patient-events/:id', (req, res) => {
  const { eventDate, eventTime, personId, patientName, workgroup, wrNwr,
          bodyLocation, injuryType, classification, rtwPlan, drConsult,
          referral, comment, endOfWeekTracker, clinicianId } = req.body;

  const existing = queryOne('SELECT * FROM PatientEvent WHERE EventID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  try {
    run(`UPDATE PatientEvent SET
      EventDate=?, EventTime=?, PersonID=?, PatientName=?, Workgroup=?, WrNwr=?,
      BodyLocation=?, InjuryType=?, Classification=?, RtwPlan=?, DrConsult=?,
      Referral=?, Comment=?, EndOfWeekTracker=?, ClinicianID=?, UpdatedAt=CURRENT_TIMESTAMP
      WHERE EventID=?`,
      [eventDate, eventTime, personId || null, patientName || null, workgroup || null, wrNwr,
       bodyLocation || null, injuryType || null, classification || null, rtwPlan || null,
       drConsult ? 1 : 0, referral || null, comment || null, endOfWeekTracker ? 1 : 0,
       clinicianId || null, req.params.id]);

    logAudit(null, 'UPDATE', 'PatientEvent', req.params.id, `Updated patient event: ${wrNwr}`);
    res.json({ message: 'Event updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update event: ' + String(err) });
  }
});

app.delete('/api/patient-events/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM PatientEvent WHERE EventID = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  try {
    run('DELETE FROM PatientEvent WHERE EventID = ?', [req.params.id]);
    logAudit(null, 'DELETE', 'PatientEvent', req.params.id, 'Deleted patient event');
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete event: ' + String(err) });
  }
});

// ÔöÇÔöÇ Referral Options ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
app.get('/api/referral-options', (req, res) => {
  try { res.json(query(`SELECT * FROM ReferralOption WHERE IsActive = 1 ORDER BY SortOrder, Name`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/referral-options', (req, res) => {
  const { name, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = run(`INSERT INTO ReferralOption (Name, SortOrder) VALUES (?, ?)`, [name, sortOrder ?? 0]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/referral-options/:id', (req, res) => {
  const { name, sortOrder, isActive } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    run(`UPDATE ReferralOption SET Name=?, SortOrder=?, IsActive=? WHERE OptionID=?`,
      [name, sortOrder ?? 0, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/referral-options/:id', (req, res) => {
  try { run(`DELETE FROM ReferralOption WHERE OptionID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// TRAINING TRACKER ROUTES
// ============================================

app.get('/api/training', (req, res) => {
  const { trainerId, type, startDate, endDate } = req.query;
  let sql = `
    SELECT tr.*, t.Name as TrainerName,
      (SELECT GROUP_CONCAT(tr2.Name, ', ')
       FROM TrainingAttendee ta
       JOIN Trainer tr2 ON ta.TrainerID = tr2.TrainerID
       WHERE ta.TrainingID = tr.TrainingID) as AttendeeNames,
      (SELECT GROUP_CONCAT(ta.TrainerID, ',')
       FROM TrainingAttendee ta
       WHERE ta.TrainingID = tr.TrainingID) as AttendeeIDs
    FROM TrainingRecord tr
    LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
    WHERE 1=1
  `;
  const params = [];
  if (trainerId) { sql += ' AND tr.TrainerID = ?'; params.push(trainerId); }
  if (type) { sql += ' AND tr.TrainingType = ?'; params.push(type); }
  if (startDate) { sql += ' AND tr.TrainingDate >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND tr.TrainingDate <= ?'; params.push(endDate); }
  sql += ' ORDER BY tr.TrainingDate DESC';
  try {
    res.json(query(sql, params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/training', (req, res) => {
  const { trainingDate, trainingType, title, category, hours, expiryDate, passed, notes,
          competencyUnit, secondaryUnit, trainingPackage, cpdType, disciplines,
          interactive, clinicalVsNonClinical, trainerVerification, learningOutcome, trainerId,
          attendeeIds, durationMinutes } = req.body;
  if (!trainingDate) return res.status(400).json({ error: 'trainingDate required' });
  try {
    const result = run(`
      INSERT INTO TrainingRecord (TrainingDate, TrainingType, Title, Category, Hours, DurationMinutes, ExpiryDate, Passed, Notes,
        CompetencyUnit, SecondaryUnit, TrainingPackage, CPDType, Disciplines, Interactive, ClinicalVsNonClinical, TrainerVerification, LearningOutcome, TrainerID)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [trainingDate, trainingType, title || disciplines || competencyUnit || '', category || null,
        parseFloat(hours) || 0, parseInt(durationMinutes) || 0, expiryDate || null, passed !== false ? 1 : 0, notes || null,
        competencyUnit || null, secondaryUnit || null, trainingPackage || null, cpdType || null,
        disciplines || null, interactive || null, clinicalVsNonClinical || null,
        trainerVerification ? 1 : 0, learningOutcome || null, trainerId || null]);
    const trainingId = result.lastInsertRowid;
    if (Array.isArray(attendeeIds)) {
      for (const aid of attendeeIds) {
        try { run(`INSERT OR IGNORE INTO TrainingAttendee (TrainingID, TrainerID) VALUES (?, ?)`, [trainingId, aid]); } catch {}
      }
    }
    logAudit(null, 'CREATE', 'TrainingRecord', trainingId, `Training: ${competencyUnit || title}`);
    res.json({ id: trainingId, message: 'Training record created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/training/:id', (req, res) => {
  const { trainingDate, trainingType, title, category, hours, expiryDate, passed, notes,
          competencyUnit, secondaryUnit, trainingPackage, cpdType, disciplines,
          interactive, clinicalVsNonClinical, trainerVerification, learningOutcome, trainerId,
          attendeeIds, durationMinutes } = req.body;
  try {
    run(`UPDATE TrainingRecord SET TrainingDate=?, TrainingType=?, Title=?,
         Category=?, Hours=?, DurationMinutes=?, ExpiryDate=?, Passed=?, Notes=?,
         CompetencyUnit=?, SecondaryUnit=?, TrainingPackage=?, CPDType=?, Disciplines=?,
         Interactive=?, ClinicalVsNonClinical=?, TrainerVerification=?, LearningOutcome=?, TrainerID=?
         WHERE TrainingID=?`,
      [trainingDate, trainingType, title || disciplines || competencyUnit || '', category || null,
       parseFloat(hours) || 0, parseInt(durationMinutes) || 0, expiryDate || null, passed !== false ? 1 : 0, notes || null,
       competencyUnit || null, secondaryUnit || null, trainingPackage || null, cpdType || null,
       disciplines || null, interactive || null, clinicalVsNonClinical || null,
       trainerVerification ? 1 : 0, learningOutcome || null, trainerId || null, req.params.id]);
    if (Array.isArray(attendeeIds)) {
      run(`DELETE FROM TrainingAttendee WHERE TrainingID = ?`, [req.params.id]);
      for (const aid of attendeeIds) {
        try { run(`INSERT OR IGNORE INTO TrainingAttendee (TrainingID, TrainerID) VALUES (?, ?)`, [req.params.id, aid]); } catch {}
      }
    }
    logAudit(null, 'UPDATE', 'TrainingRecord', req.params.id, `Updated training: ${competencyUnit || title}`);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/training/:id', (req, res) => {
  try {
    run('DELETE FROM TrainingAttendee WHERE TrainingID = ?', [req.params.id]);
    run('DELETE FROM TrainingRecord WHERE TrainingID = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/training/:id/attendees', (req, res) => {
  try {
    res.json(query(`SELECT ta.*, t.Name, t.Qualifications, t.IsTrainer
      FROM TrainingAttendee ta JOIN Trainer t ON ta.TrainerID = t.TrainerID
      WHERE ta.TrainingID = ?`, [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training/:id/attendees', (req, res) => {
  const { trainerId } = req.body;
  if (!trainerId) return res.status(400).json({ error: 'trainerId required' });
  try {
    run(`INSERT OR IGNORE INTO TrainingAttendee (TrainingID, TrainerID) VALUES (?, ?)`, [req.params.id, trainerId]);
    res.json({ message: 'Attendee added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/training/:id/attendees/:aid', (req, res) => {
  try {
    run(`DELETE FROM TrainingAttendee WHERE TrainingID = ? AND AttendeeID = ?`, [req.params.id, req.params.aid]);
    res.json({ message: 'Removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/training/summary', (req, res) => {
  try {
    const totalHours = queryOne("SELECT COALESCE(SUM(Hours),0) as h FROM TrainingRecord WHERE TrainingType = 'CPD'")?.h || 0;
    const expiringSoon = query(`SELECT tr.*, t.Name as TrainerName FROM TrainingRecord tr
      LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
      WHERE tr.ExpiryDate IS NOT NULL AND tr.ExpiryDate BETWEEN date('now') AND date('now','+60 days')
      ORDER BY tr.ExpiryDate`);
    const overdue = query(`SELECT tr.*, t.Name as TrainerName FROM TrainingRecord tr
      LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
      WHERE tr.ExpiryDate IS NOT NULL AND tr.ExpiryDate < date('now')
      ORDER BY tr.ExpiryDate`);
    const byType = query(`SELECT TrainingType, COUNT(*) as Count, COALESCE(SUM(Hours),0) as Hours
      FROM TrainingRecord GROUP BY TrainingType`);
    res.json({ totalCPDHours: totalHours, expiringSoon, overdue, byType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TRAINING LOOKUP CRUD ÔÇö TrainingUnit, Trainer, CPDType
// ============================================

// Training duplicate detection and cleanup
app.get('/api/training/duplicates', (req, res) => {
  try {
    const dupes = query(`
      SELECT TrainingDate, Title, TrainerID, COUNT(*) as cnt,
             GROUP_CONCAT(TrainingID) as ids
      FROM TrainingRecord
      GROUP BY TrainingDate, Title, TrainerID
      HAVING COUNT(*) > 1
      ORDER BY TrainingDate DESC
    `);
    res.json(dupes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training/cleanup-duplicates', (req, res) => {
  try {
    const dupes = query(`
      SELECT TrainingDate, Title, TrainerID, GROUP_CONCAT(TrainingID) as ids
      FROM TrainingRecord
      GROUP BY TrainingDate, Title, TrainerID
      HAVING COUNT(*) > 1
    `);
    let removed = 0;
    for (const d of dupes) {
      const ids = d.ids.split(',').map(Number);
      const keep = ids[0]; // keep the first, delete the rest
      for (let i = 1; i < ids.length; i++) {
        run('DELETE FROM TrainingAttendee WHERE TrainingID = ?', [ids[i]]);
        run('DELETE FROM TrainingRecord WHERE TrainingID = ?', [ids[i]]);
        removed++;
      }
    }
    logAudit(null, 'CLEANUP', 'TrainingRecord', null, `Removed ${removed} duplicate training records`);
    res.json({ removed, duplicateGroups: dupes.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Training Units
app.get('/api/training-units', (req, res) => {
  try { res.json(query(`SELECT * FROM TrainingUnit ORDER BY TrainingPackage, Name`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/training-units', (req, res) => {
  const { code, name, trainingPackage, category } = req.body;
  if (!name || !trainingPackage) return res.status(400).json({ error: 'Name and package required' });
  try {
    const existing = queryOne(`SELECT TrainingUnitID FROM TrainingUnit WHERE LOWER(Name)=LOWER(?) AND TrainingPackage=?`, [name, trainingPackage]);
    if (existing) return res.status(409).json({ error: 'A unit with this name already exists in that package', existingId: existing.TrainingUnitID });
    const r = run(`INSERT INTO TrainingUnit (Code, Name, TrainingPackage, Category) VALUES (?, ?, ?, ?)`,
      [code || '', name, trainingPackage, category || null]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/training-units/:id', (req, res) => {
  const { code, name, trainingPackage, category, isActive } = req.body;
  try {
    const conflict = queryOne(`SELECT TrainingUnitID FROM TrainingUnit WHERE LOWER(Name)=LOWER(?) AND TrainingPackage=? AND TrainingUnitID!=?`, [name, trainingPackage, req.params.id]);
    if (conflict) return res.status(409).json({ error: 'Another unit with this name already exists in that package' });
    run(`UPDATE TrainingUnit SET Code=?, Name=?, TrainingPackage=?, Category=?, IsActive=? WHERE TrainingUnitID=?`,
      [code || '', name, trainingPackage, category || null, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/training-units/:id', (req, res) => {
  try { run(`DELETE FROM TrainingUnit WHERE TrainingUnitID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Trainers
app.get('/api/trainers', (req, res) => {
  try { res.json(query(`SELECT * FROM Trainer ORDER BY Name`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/trainers', (req, res) => {
  const { name, qualifications, email, phone, isTrainer } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = run(`INSERT INTO Trainer (Name, Qualifications, Email, Phone, IsTrainer) VALUES (?, ?, ?, ?, ?)`,
      [name, qualifications || null, email || null, phone || null, isTrainer ? 1 : 0]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/trainers/:id', (req, res) => {
  const { name, qualifications, email, phone, isActive, isTrainer } = req.body;
  try {
    run(`UPDATE Trainer SET Name=?, Qualifications=?, Email=?, Phone=?, IsTrainer=?, IsActive=? WHERE TrainerID=?`,
      [name, qualifications || null, email || null, phone || null, isTrainer ? 1 : 0, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/trainers/:id', (req, res) => {
  try { run(`DELETE FROM Trainer WHERE TrainerID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// CPD Types
app.get('/api/cpd-types', (req, res) => {
  try { res.json(query(`SELECT * FROM CPDType WHERE IsActive=1 ORDER BY Name`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/cpd-types', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = run(`INSERT INTO CPDType (Name) VALUES (?)`, [name]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/cpd-types/:id', (req, res) => {
  const { name, isActive } = req.body;
  try {
    run(`UPDATE CPDType SET Name=?, IsActive=? WHERE CPDTypeID=?`,
      [name, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/cpd-types/:id', (req, res) => {
  try { run(`DELETE FROM CPDType WHERE CPDTypeID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// ESO CERTIFICATE UNITS (CRUD)
// ============================================
app.get('/api/eso-cert-units', (req, res) => {
  try { res.json(query(`SELECT * FROM ESOCertUnit ORDER BY SortOrder, Name`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/eso-cert-units', (req, res) => {
  const { name, displayName, groupName, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = run(`INSERT INTO ESOCertUnit (Name, DisplayName, GroupName, SortOrder) VALUES (?, ?, ?, ?)`,
      [name, displayName || null, groupName || 'Standard', sortOrder || 0]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/eso-cert-units/:id', (req, res) => {
  const { name, displayName, groupName, sortOrder, isActive } = req.body;
  try {
    run(`UPDATE ESOCertUnit SET Name=?, DisplayName=?, GroupName=?, SortOrder=?, IsActive=? WHERE UnitID=?`,
      [name, displayName || null, groupName || 'Standard', sortOrder || 0, isActive !== false ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/eso-cert-units/:id', (req, res) => {
  try { run(`DELETE FROM ESOCertUnit WHERE UnitID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// ESO CERTIFICATE REPORT
// ============================================
app.get('/api/reports/eso-certificate', (req, res) => {
  const { clinicianId, startDate, endDate } = req.query;
  if (!clinicianId || !startDate || !endDate) {
    return res.status(400).json({ error: 'clinicianId, startDate and endDate are required' });
  }

  const clinician = queryOne(`SELECT * FROM Clinician WHERE ClinicianID = ?`, [clinicianId]);
  if (!clinician) return res.status(404).json({ error: 'Clinician not found' });

  const esoUnits = query(`SELECT * FROM ESOCertUnit WHERE IsActive = 1 ORDER BY SortOrder, Name`);

  const sessions = query(`
    SELECT tr.TrainingID, tr.TrainingDate, tr.Hours, tr.CompetencyUnit, tr.SecondaryUnit,
           tr.Disciplines, tr.Title, t.Name as TrainerName
    FROM TrainingRecord tr
    LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
    WHERE tr.ClinicianID = ? AND tr.TrainingDate BETWEEN ? AND ?
    ORDER BY tr.TrainingDate
  `, [clinicianId, startDate, endDate]);

  // Build ordered unit groups
  const groupMap = new Map();
  for (const unit of esoUnits) {
    const key = unit.GroupName === 'Standard' ? unit.Name : unit.GroupName;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        displayName: unit.GroupName === 'Standard' ? (unit.DisplayName || unit.Name) : unit.GroupName,
        groupName: unit.GroupName,
        sortOrder: unit.SortOrder,
        matchNames: [],
        sessions: [],
        totalHours: 0,
      });
    }
    groupMap.get(key).matchNames.push(unit.Name);
  }

  // Match sessions to units
  for (const session of sessions) {
    const unitName = session.CompetencyUnit || '';
    const secondaryUnit = session.SecondaryUnit || '';
    for (const [, unitData] of groupMap) {
      if (unitData.matchNames.includes(unitName) || unitData.matchNames.includes(secondaryUnit)) {
        unitData.sessions.push(session);
        unitData.totalHours = Math.round((unitData.totalHours + (parseFloat(session.Hours) || 0)) * 100) / 100;
        break;
      }
    }
  }

  const units = Array.from(groupMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));

  const totalHours = Math.round(units.reduce((s, u) => s + u.totalHours, 0) * 100) / 100;

  res.json({ clinician, period: { startDate, endDate }, units, totalHours });
});

app.get('/api/reports/weekly-events', (req, res) => {
  const { startDate, endDate } = req.query;
  
  const events = query(`
    SELECT pe.*, COALESCE(pe.PatientName, p.FullName) as PersonName, e.CompanyName as EmployerName
    FROM PatientEvent pe
    LEFT JOIN Person p ON pe.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE pe.EventDate BETWEEN ? AND ?
    ORDER BY pe.EventDate, pe.EventTime
  `, [startDate, endDate]);
  
  const byType = query(`
    SELECT WrNwr as EventType, COUNT(*) as Count
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
    GROUP BY WrNwr
    ORDER BY Count DESC
  `, [startDate, endDate]);
  
  const byOutcome = query(`
    SELECT Classification as Outcome, COUNT(*) as Count
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ? AND Classification IS NOT NULL
    GROUP BY Classification
  `, [startDate, endDate]);
  
  res.json({
    period: { startDate, endDate },
    totalEvents: events.length,
    events,
    byType,
    byOutcome
  });
});


app.get('/api/reports/quarterly', (req, res) => {
  const { year, quarter, employers } = req.query;

  const quarters = {
    1: { start: `${year}-01-01`, end: `${year}-03-31` },
    2: { start: `${year}-04-01`, end: `${year}-06-30` },
    3: { start: `${year}-07-01`, end: `${year}-09-30` },
    4: { start: `${year}-10-01`, end: `${year}-12-31` },
  };
  const range = quarters[parseInt(quarter)] || quarters[1];
  const { start: startDate, end: endDate } = range;

  const { filter: employerFilter } = buildEmployerFilter(employers);

  const byType = query(`
    SELECT tt.Name, tt.Code, COUNT(*) as Count
    FROM AODTest t JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY tt.TestTypeID
  `, [startDate, endDate]);

  const totals = query(`
    SELECT COUNT(*) as TotalTests,
      SUM(CASE WHEN t.IsNonNegative = 1 THEN 1 ELSE 0 END) as NonNegativeCount,
      SUM(CASE WHEN t.FinalBACOutcome = 'Positive' THEN 1 ELSE 0 END) as PositiveBACCount,
      SUM(CASE WHEN t.FinalDrugOutcome IN ('Non-Negative', 'Confirmed Positive') THEN 1 ELSE 0 END) as NonNegativeDrugCount
    FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const dnaType = queryOne('SELECT TestTypeID FROM TestType WHERE Code = ?', ['DNA']);
  const dnaCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestTypeID = ? AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [dnaType?.TestTypeID, startDate, endDate]);

  const byWorkerType = query(`
    SELECT wt.Name, COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY wt.WorkerTypeID
  `, [startDate, endDate]);

  const byEmployerCategory = query(`
    SELECT e.Category, COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);

  const rftCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.RFT = 1 AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const pendingLabCount = queryOne(`
    SELECT COUNT(*) as Count FROM AODTest t JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestStatus = 'Pending Lab' AND t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate]);

  const drugOutcomes = query(`
    SELECT t.FinalDrugOutcome as Outcome, COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalDrugOutcome IS NOT NULL
    GROUP BY t.FinalDrugOutcome
  `, [startDate, endDate]);

  const alcoholOutcomes = query(`
    SELECT t.FinalBACOutcome as Outcome, COUNT(*) as Count FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} AND t.FinalBACOutcome IS NOT NULL
    GROUP BY t.FinalBACOutcome
  `, [startDate, endDate]);

  res.json({
    period: { startDate, endDate, year, quarter },
    totals: totals[0] || { TotalTests: 0, NonNegativeCount: 0, PositiveBACCount: 0, NonNegativeDrugCount: 0 },
    byType, byWorkerType, byEmployerCategory,
    dnaCount: dnaCount?.Count || 0,
    rftCount: rftCount?.Count || 0,
    pendingLabCount: pendingLabCount?.Count || 0,
    drugOutcomes, alcoholOutcomes,
  });
});

app.get('/api/reports/quarterly.template.xlsx', (req, res) => {
  res.json({ message: 'Quarterly template not configured' });
});

function generateDailyActivityReport(startDate, endDate, employerFilter) {
  const totalTests = query(`
    SELECT COUNT(*) as Total,
           SUM(CASE WHEN tt.Code = 'Random' THEN 1 ELSE 0 END) as Random,
           SUM(CASE WHEN tt.Code = 'Pre-Employment' THEN 1 ELSE 0 END) as PreEmployment,
           SUM(CASE WHEN tt.Code = 'For Cause' THEN 1 ELSE 0 END) as ForCause,
           SUM(CASE WHEN tt.Code = 'Post Incident' THEN 1 ELSE 0 END) as PostIncident,
           SUM(CASE WHEN e.Category = 'SCJV Staff' THEN 1 ELSE 0 END) as SCJV,
           SUM(CASE WHEN e.Category = 'Contractor' THEN 1 ELSE 0 END) as Contractor,
           SUM(CASE WHEN t.TestStatus = 'Completed' THEN 1 ELSE 0 END) as Completed,
           SUM(CASE WHEN t.TestStatus = 'DNA' THEN 1 ELSE 0 END) as DNA
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate])[0];
  
  const byDate = query(`
    SELECT t.TestDate, COUNT(*) as Count,
           SUM(CASE WHEN t.TestStatus = 'DNA' THEN 1 ELSE 0 END) as DNA
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY t.TestDate
    ORDER BY t.TestDate
  `, [startDate, endDate]);
  
  return {
    summary: {
      totalTests: totalTests.Total,
      random: totalTests.Random,
      preEmployment: totalTests.PreEmployment,
      forCause: totalTests.ForCause,
      postIncident: totalTests.PostIncident,
      scjvStaff: totalTests.SCJV,
      contractors: totalTests.Contractor,
      completed: totalTests.Completed,
      dna: totalTests.DNA
    },
    details: byDate
  };
}

function generateNonNegativeSummary(startDate, endDate, employerFilter) {
  const summary = query(`
    SELECT 
      SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1 ELSE 0 END) as DrugNonNegative,
      SUM(CASE WHEN t.BACInitialValue > 0 OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) as AlcoholPositive,
      SUM(CASE WHEN t.IsPending = 1 THEN 1 ELSE 0 END) as PendingLab,
      0 as Overrides
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate])[0];
  
  const details = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           t.OralResult, t.BACInitialValue, t.BACFinalValue, t.TestStatus
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult = 'Non-Negative' OR t.BACInitialValue > 0 OR t.BACFinalValue > 0)
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return { summary, details };
}

function generateTestingComplianceReport(startDate, endDate, employerFilter) {
  const scheduled = query(`
    SELECT COUNT(*) as Scheduled
    FROM RandomTestEntry rte
    JOIN RandomTestList rtl ON rte.ListID = rtl.ListID
    WHERE rtl.ListDate BETWEEN ? AND ?
  `, [startDate, endDate])[0]?.Scheduled || 0;
  
  const completed = query(`
    SELECT COUNT(*) as Completed
    FROM RandomTestEntry rte
    JOIN RandomTestList rtl ON rte.ListID = rtl.ListID
    WHERE rtl.ListDate BETWEEN ? AND ? AND rte.Status = 'Tested'
  `, [startDate, endDate])[0]?.Completed || 0;
  
  const dnaCount = query(`
    SELECT COUNT(*) as DNA
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? AND t.TestStatus = 'DNA' ${employerFilter}
  `, [startDate, endDate])[0]?.DNA || 0;
  
  const complianceRate = scheduled > 0 ? ((completed / scheduled) * 100).toFixed(1) : 0;
  
  return {
    summary: {
      scheduled,
      completed,
      complianceRate: `${complianceRate}%`,
      dnaCount
    },
    details: []
  };
}

function generateRFTRegister(startDate, endDate, employerFilter) {
  const rftCases = query(`
    SELECT t.TestNumber, t.TestDate, t.TestTime, p.FullName, e.CompanyName,
           t.OralResult, t.LabReference as LabSampleID, t.LabSentDate,
           t.ConfirmatoryResult, t.TestStatus
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND t.OralResult = 'Non-Negative'
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'OralResult', label: 'Initial Result' },
      { key: 'LabSampleID', label: 'Lab Sample ID' },
      { key: 'LabSentDate', label: 'Sent to Lab', type: 'date' },
      { key: 'ConfirmatoryResult', label: 'Lab Result' },
      { key: 'TestStatus', label: 'Status' }
    ],
    rows: rftCases
  };
}

function generateLabReconciliation(startDate, endDate, employerFilter) {
  const cases = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           t.OralResult, t.ConfirmatoryResult, t.MedicationReviewStatus as MedicationReview,
           CASE 
             WHEN t.OralResult = 'Non-Negative' AND t.ConfirmatoryResult = 'Negative' THEN 'False Positive'
             WHEN t.OralResult = 'Non-Negative' AND t.ConfirmatoryResult = 'Substance Confirmed' AND t.MedicationReviewStatus = 'Consistent' THEN 'Consistent'
             WHEN t.OralResult = 'Non-Negative' AND t.ConfirmatoryResult = 'Substance Confirmed' AND t.MedicationReviewStatus = 'Inconsistent' THEN 'Inconsistent'
             ELSE 'Pending'
           END as Outcome
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND t.OralResult = 'Non-Negative'
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'OralResult', label: 'Initial' },
      { key: 'ConfirmatoryResult', label: 'Lab Result' },
      { key: 'MedicationReview', label: 'Med Review' },
      { key: 'Outcome', label: 'Outcome' }
    ],
    rows: cases
  };
}

function generatePendingResultsReport(startDate, endDate, employerFilter) {
  const pending = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           t.OralResult, t.LabSentDate,
           CAST(julianday('now') - julianday(t.LabSentDate) AS INTEGER) as DaysPending
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.IsPending = 1 ${employerFilter}
    ORDER BY t.LabSentDate ASC
  `, []);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Test Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'OralResult', label: 'Initial Result' },
      { key: 'LabSentDate', label: 'Sent to Lab', type: 'date' },
      { key: 'DaysPending', label: 'Days Pending', type: 'number' }
    ],
    rows: pending
  };
}

function generateComplianceDashboard(startDate, endDate, employerFilter) {
  const totalWorkforce = query(`SELECT COUNT(*) as Count FROM Person WHERE IsActive = 1`)[0]?.Count || 0;
  const testedCount = query(`
    SELECT COUNT(DISTINCT t.PersonID) as Count
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate])[0]?.Count || 0;
  
  const byCategory = query(`
    SELECT e.Category, COUNT(DISTINCT t.PersonID) as Tested,
           (SELECT COUNT(*) FROM Person p2 JOIN Employer e2 ON p2.EmployerID = e2.EmployerID WHERE e2.Category = e.Category AND p2.IsActive = 1) as Total
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);
  
  return {
    summary: {
      totalWorkforce,
      testedCount,
      coverageRate: totalWorkforce > 0 ? `${((testedCount / totalWorkforce) * 100).toFixed(1)}%` : '0%'
    },
    details: byCategory
  };
}

function generatePolicyBreachRegister(startDate, endDate, employerFilter) {
  const breaches = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           CASE 
             WHEN t.OralResult = 'Refused' THEN 'Refusal'
             WHEN t.OralResult = 'Invalid' THEN 'Invalid Sample'
             WHEN t.ConfirmatoryResult = 'Substance Confirmed' AND t.MedicationReviewStatus = 'Inconsistent' THEN 'Confirmed Positive'
             WHEN t.BACFinalValue > 0 THEN 'Alcohol Positive'
           END as BreachType,
           t.Notes
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult IN ('Refused', 'Invalid') 
           OR (t.ConfirmatoryResult = 'Substance Confirmed' AND t.MedicationReviewStatus = 'Inconsistent')
           OR t.BACFinalValue > 0)
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'BreachType', label: 'Breach Type' },
      { key: 'Notes', label: 'Notes' }
    ],
    rows: breaches
  };
}

function generateAuditTrailReport(startDate, endDate, employerFilter) {
  const audits = query(`
    SELECT a.Timestamp, a.Action, a.TableName, a.RecordID, a.Details, a.UserID
    FROM AuditLog a
    WHERE DATE(a.Timestamp) BETWEEN ? AND ?
    ORDER BY a.Timestamp DESC
    LIMIT 500
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'Timestamp', label: 'Time', type: 'datetime' },
      { key: 'Action', label: 'Action' },
      { key: 'TableName', label: 'Table' },
      { key: 'RecordID', label: 'Record ID' },
      { key: 'Details', label: 'Details' },
      { key: 'UserID', label: 'User' }
    ],
    rows: audits
  };
}

function generateSubstanceTrends(startDate, endDate, employerFilter) {
  const byMonth = query(`
    SELECT strftime('%Y-%m', t.TestDate) as Month,
           SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1 ELSE 0 END) as NonNegative,
           SUM(CASE WHEN t.BACFinalValue > 0 THEN 1 ELSE 0 END) as AlcoholPositive,
           COUNT(*) as TotalTests
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY strftime('%Y-%m', t.TestDate)
    ORDER BY Month
  `, [startDate, endDate]);
  
  const byDayOfWeek = query(`
    SELECT 
      CASE CAST(strftime('%w', t.TestDate) AS INTEGER)
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
      END as DayOfWeek,
      SUM(CASE WHEN t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) as Positives,
      COUNT(*) as TotalTests
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY strftime('%w', t.TestDate)
    ORDER BY CAST(strftime('%w', t.TestDate) AS INTEGER)
  `, [startDate, endDate]);
  
  return {
    summary: { monthlyTrend: byMonth.length, dayOfWeekAnalysis: byDayOfWeek.length },
    details: [...byMonth.map(r => ({ ...r, Type: 'Monthly' })), ...byDayOfWeek.map(r => ({ ...r, Type: 'DayOfWeek' }))]
  };
}

function generateHighRiskSegmentation(startDate, endDate, employerFilter) {
  const byEmployerCategory = query(`
    SELECT e.Category,
           COUNT(*) as TotalTests,
           SUM(CASE WHEN t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) as Positives,
           ROUND(100.0 * SUM(CASE WHEN t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as PositiveRate
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY e.Category
  `, [startDate, endDate]);
  
  const repeatOffenders = query(`
    SELECT p.PersonID, COUNT(*) as NonNegativeCount
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0)
    GROUP BY p.PersonID
    HAVING COUNT(*) > 1
  `, [startDate, endDate]);
  
  return {
    summary: {
      repeatIndividuals: repeatOffenders.length
    },
    details: byEmployerCategory
  };
}

function generateTestTypeEffectiveness(startDate, endDate, employerFilter) {
  const byType = query(`
    SELECT tt.Name as TestType,
           COUNT(*) as TotalTests,
           SUM(CASE WHEN t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) as Positives,
           ROUND(100.0 * SUM(CASE WHEN t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as YieldRate
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY t.TestTypeID
    ORDER BY YieldRate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestType', label: 'Test Type' },
      { key: 'TotalTests', label: 'Total Tests', type: 'number' },
      { key: 'Positives', label: 'Positives', type: 'number' },
      { key: 'YieldRate', label: 'Yield Rate %', type: 'number' }
    ],
    rows: byType
  };
}

function generateDailyPresentationReport(startDate, endDate) {
  const summary = query(`
    SELECT COUNT(*) as Total,
           SUM(CASE WHEN WrNwr LIKE 'WR%' THEN 1 ELSE 0 END) as WorkRelated,
           SUM(CASE WHEN WrNwr LIKE 'NWR%' OR WrNwr = 'Camp' THEN 1 ELSE 0 END) as NonWorkRelated
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
  `, [startDate, endDate])[0];
  
  const byDate = query(`
    SELECT EventDate, COUNT(*) as Count,
           SUM(CASE WHEN WrNwr LIKE 'WR%' THEN 1 ELSE 0 END) as WR,
           SUM(CASE WHEN WrNwr LIKE 'NWR%' OR WrNwr = 'Camp' THEN 1 ELSE 0 END) as NWR
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
    GROUP BY EventDate
    ORDER BY EventDate
  `, [startDate, endDate]);
  
  return { summary, details: byDate };
}

function generateWeeklyEventReport(startDate, endDate) {
  const events = query(`
    SELECT pe.*, p.FullName, e.CompanyName
    FROM PatientEvent pe
    JOIN Person p ON pe.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE pe.EventDate BETWEEN ? AND ?
    ORDER BY pe.EventDate, pe.EventTime
  `, [startDate, endDate]);
  
  const byType = query(`
    SELECT WrNwr as EventType, COUNT(*) as Count
    FROM PatientEvent WHERE EventDate BETWEEN ? AND ?
    GROUP BY WrNwr ORDER BY Count DESC
  `, [startDate, endDate]);
  
  return {
    summary: { totalEvents: events.length },
    details: events,
    byType
  };
}

function generateClinicalWorkloadReport(startDate, endDate) {
  const byShift = query(`
    SELECT 
      CASE 
        WHEN CAST(substr(EventTime, 1, 2) AS INTEGER) < 12 THEN 'Morning (00:00-11:59)'
        WHEN CAST(substr(EventTime, 1, 2) AS INTEGER) < 18 THEN 'Afternoon (12:00-17:59)'
        ELSE 'Night (18:00-23:59)'
      END as Shift,
      COUNT(*) as Count
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ? AND EventTime IS NOT NULL
    GROUP BY Shift
  `, [startDate, endDate]);
  
  const byDay = query(`
    SELECT EventDate, COUNT(*) as Count
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
    GROUP BY EventDate
    ORDER BY EventDate
  `, [startDate, endDate]);
  
  return {
    summary: { peakAnalysis: byShift.length },
    details: byDay,
    byShift
  };
}

function generateDataQualityReport(startDate, endDate, employerFilter) {
  const issues = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName,
           CASE 
             WHEN t.OralResult IS NULL OR t.OralResult = '' THEN 'Missing Oral Result'
             WHEN t.OralResult = 'Non-Negative' AND t.LabReference IS NULL THEN 'Non-Negative without Lab Reference'
             WHEN t.TestTime IS NULL THEN 'Missing Test Time'
             WHEN t.ClinicianID IS NULL THEN 'Missing Clinician'
           END as Issue
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult IS NULL OR t.OralResult = ''
           OR (t.OralResult = 'Non-Negative' AND t.LabReference IS NULL)
           OR t.TestTime IS NULL
           OR t.ClinicianID IS NULL)
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'Issue', label: 'Data Quality Issue' }
    ],
    rows: issues
  };
}

function generateLogicExceptionReport(startDate, endDate, employerFilter) {
  const exceptions = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           t.OralResult, t.ConfirmatoryResult,
           CASE 
             WHEN t.OralResult = 'Non-Negative' AND t.ConfirmatoryResult IS NULL AND t.IsPending = 0 THEN 'Non-Negative without lab follow-up'
             WHEN t.OralResult = 'Negative' AND t.BACFinalValue > 0 THEN 'Drug negative but alcohol positive'
           END as Exception
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND ((t.OralResult = 'Non-Negative' AND t.ConfirmatoryResult IS NULL AND t.IsPending = 0)
           OR (t.OralResult = 'Negative' AND t.BACFinalValue > 0))
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'Exception', label: 'Exception Type' }
    ],
    rows: exceptions
  };
}

function generateNearMissReport(startDate, endDate, employerFilter) {
  const nearMisses = query(`
    SELECT t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
           t.OralResult, t.ConfirmatoryResult
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND t.OralResult = 'Non-Negative'
      AND t.ConfirmatoryResult = 'Negative'
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  
  return {
    summary: { nearMissCount: nearMisses.length },
    columns: [
      { key: 'TestNumber', label: 'Test #' },
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'FullName', label: 'Name' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'OralResult', label: 'Initial Result' },
      { key: 'ConfirmatoryResult', label: 'Lab Result' }
    ],
    rows: nearMisses
  };
}

function generateRepeatRiskReport(startDate, endDate, employerFilter) {
  const repeats = query(`
    SELECT p.PersonID, 
           'Person ' || p.PersonID as DeIdentified,
           e.CompanyName,
           COUNT(*) as IncidentCount,
           GROUP_CONCAT(t.TestDate) as Dates
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0 OR t.OralResult = 'Refused')
    GROUP BY p.PersonID
    HAVING COUNT(*) > 1
    ORDER BY IncidentCount DESC
  `, [startDate, endDate]);
  
  return {
    summary: { repeatIndividuals: repeats.length },
    columns: [
      { key: 'DeIdentified', label: 'Individual (De-identified)' },
      { key: 'CompanyName', label: 'Employer' },
      { key: 'IncidentCount', label: 'Incident Count', type: 'number' },
      { key: 'Dates', label: 'Dates' }
    ],
    rows: repeats
  };
}

// ÔöÇÔöÇ Patient Governance ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function generateAcuityCasemix(startDate, endDate) {
  const rows = query(`
    SELECT Classification,
           WrNwr,
           COUNT(*) as Total,
           SUM(CASE WHEN DrConsult = 1 THEN 1 ELSE 0 END) as DrConsults,
           SUM(CASE WHEN Referral LIKE '%ED%' THEN 1 ELSE 0 END) as EDReferrals
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
    GROUP BY Classification, WrNwr
    ORDER BY Total DESC
  `, [startDate, endDate]);
  return {
    summary: { totalPresentations: rows.reduce((s, r) => s + r.Total, 0) },
    columns: [
      { key: 'Classification', label: 'Classification' },
      { key: 'WrNwr', label: 'WR / NWR' },
      { key: 'Total', label: 'Total', type: 'number' },
      { key: 'DrConsults', label: 'Dr Consults', type: 'number' },
      { key: 'EDReferrals', label: 'ED Referrals', type: 'number' },
    ],
    rows,
  };
}

function generateDispositionReport(startDate, endDate) {
  const rows = query(`
    SELECT COALESCE(NULLIF(Referral,''), 'Self Care / No Referral') as Disposition,
           WrNwr,
           COUNT(*) as Total
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
    GROUP BY Disposition, WrNwr
    ORDER BY Total DESC
  `, [startDate, endDate]);
  return {
    summary: { dispositionCategories: rows.length },
    columns: [
      { key: 'Disposition', label: 'Disposition / Referral' },
      { key: 'WrNwr', label: 'WR / NWR' },
      { key: 'Total', label: 'Total', type: 'number' },
    ],
    rows,
  };
}

function generateEdReferralReport(startDate, endDate) {
  const rows = query(`
    SELECT EventDate as Date, PatientName, WrNwr, Classification,
           BodyLocation, Referral, Comment
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
      AND Referral LIKE '%ED%'
    ORDER BY EventDate DESC
  `, [startDate, endDate]);
  const total = query(`SELECT COUNT(*) as Total FROM PatientEvent WHERE EventDate BETWEEN ? AND ?`, [startDate, endDate])[0] || {};
  return {
    summary: { edReferrals: rows.length, totalPresentations: total.Total || 0 },
    columns: [
      { key: 'Date', label: 'Date', type: 'date' },
      { key: 'PatientName', label: 'Patient' },
      { key: 'WrNwr', label: 'WR/NWR' },
      { key: 'Classification', label: 'Classification' },
      { key: 'BodyLocation', label: 'Body Location' },
      { key: 'Referral', label: 'Referral' },
      { key: 'Comment', label: 'Comment' },
    ],
    rows,
  };
}

// ÔöÇÔöÇ Patient Safety / WHS ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function generateWriAnalysis(startDate, endDate) {
  const rows = query(`
    SELECT BodyLocation, InjuryType, COUNT(*) as Total,
           SUM(CASE WHEN Referral LIKE '%ED%' THEN 1 ELSE 0 END) as EDReferrals
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
      AND WrNwr IN ('WR','WR Review')
    GROUP BY BodyLocation, InjuryType
    ORDER BY Total DESC
  `, [startDate, endDate]);
  return {
    summary: { wrIncidents: rows.reduce((s, r) => s + r.Total, 0) },
    columns: [
      { key: 'BodyLocation', label: 'Body Location' },
      { key: 'InjuryType', label: 'Injury Type' },
      { key: 'Total', label: 'Count', type: 'number' },
      { key: 'EDReferrals', label: 'ED Referrals', type: 'number' },
    ],
    rows,
  };
}

function generateLostTimeReport(startDate, endDate) {
  const rows = query(`
    SELECT EventDate as Date, PatientName, WrNwr, Classification,
           BodyLocation, InjuryType, RtwPlan, Comment
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
      AND WrNwr IN ('WR','WR Review')
      AND (RtwPlan IS NOT NULL AND RtwPlan != '' AND RtwPlan NOT LIKE '%RTW%')
    ORDER BY EventDate DESC
  `, [startDate, endDate]);
  return {
    summary: { modifiedDutyCount: rows.length },
    columns: [
      { key: 'Date', label: 'Date', type: 'date' },
      { key: 'PatientName', label: 'Patient' },
      { key: 'WrNwr', label: 'WR/NWR' },
      { key: 'Classification', label: 'Classification' },
      { key: 'BodyLocation', label: 'Body Location' },
      { key: 'InjuryType', label: 'Injury Type' },
      { key: 'RtwPlan', label: 'RTW Plan' },
      { key: 'Comment', label: 'Comment' },
    ],
    rows,
  };
}

function generateNwrHospital(startDate, endDate) {
  const rows = query(`
    SELECT EventDate as Date, PatientName, Classification,
           BodyLocation, Referral, Comment
    FROM PatientEvent
    WHERE EventDate BETWEEN ? AND ?
      AND WrNwr IN ('NWR','NWR Review','Camp','Camp Review')
      AND Referral LIKE '%ED%'
    ORDER BY EventDate DESC
  `, [startDate, endDate]);
  return {
    summary: { nwrHospitalisations: rows.length },
    columns: [
      { key: 'Date', label: 'Date', type: 'date' },
      { key: 'PatientName', label: 'Patient' },
      { key: 'Classification', label: 'Classification' },
      { key: 'BodyLocation', label: 'Body Location' },
      { key: 'Referral', label: 'Referral' },
      { key: 'Comment', label: 'Comment' },
    ],
    rows,
  };
}

// ÔöÇÔöÇ Integrated AOD + Patient ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function generatePostIncidentLinkage(startDate, endDate, employerFilter) {
  const rows = query(`
    SELECT t.TestDate, p.FullName as Worker, e.CompanyName as Employer,
           tt.Name as TestType, t.OverallAODResult, t.TestStatus
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND tt.Code = 'Post-Incident'
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  return {
    summary: { postIncidentTests: rows.length },
    columns: [
      { key: 'TestDate', label: 'Date', type: 'date' },
      { key: 'Worker', label: 'Worker' },
      { key: 'Employer', label: 'Employer' },
      { key: 'TestType', label: 'Test Type' },
      { key: 'OverallAODResult', label: 'AOD Result' },
      { key: 'TestStatus', label: 'Status' },
    ],
    rows,
  };
}

function generateInjuryAodCorrelation(startDate, endDate, employerFilter) {
  const rows = query(`
    SELECT p.FullName as Worker, e.CompanyName as Employer,
           COUNT(DISTINCT t.TestID) as AodTests,
           GROUP_CONCAT(DISTINCT t.OverallAODResult) as AodResults
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND (t.OralResult = 'Non-Negative' OR t.BACFinalValue > 0)
    GROUP BY p.PersonID
    ORDER BY AodTests DESC
  `, [startDate, endDate]);
  return {
    summary: { workersWithNonNegative: rows.length },
    columns: [
      { key: 'Worker', label: 'Worker (De-identified)' },
      { key: 'Employer', label: 'Employer' },
      { key: 'AodTests', label: 'AOD Tests', type: 'number' },
      { key: 'AodResults', label: 'Results' },
    ],
    rows: rows.map(r => ({ ...r, Worker: `Worker #${rows.indexOf(r) + 1}` })),
  };
}

// ÔöÇÔöÇ Training Reports ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function generateEsoTrainingReport(startDate, endDate) {
  const rows = query(`
    SELECT tr.TrainingDate as Date, tr.TrainingType, tr.Topic,
           t.FullName as Trainer, tr.Hours,
           COUNT(ta.AttendeeID) as Attendees,
           SUM(CASE WHEN ta.Passed = 1 THEN 1 ELSE 0 END) as Passed
    FROM TrainingRecord tr
    LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
    LEFT JOIN TrainingAttendee ta ON tr.TrainingID = ta.TrainingID
    WHERE tr.TrainingDate BETWEEN ? AND ?
      AND (tr.TrainingType LIKE '%ESO%' OR tr.TrainingType LIKE '%Cert%')
    GROUP BY tr.TrainingID
    ORDER BY tr.TrainingDate DESC
  `, [startDate, endDate]);
  return {
    summary: { sessions: rows.length, totalAttendees: rows.reduce((s, r) => s + (r.Attendees || 0), 0) },
    columns: [
      { key: 'Date', label: 'Date', type: 'date' },
      { key: 'TrainingType', label: 'Type' },
      { key: 'Topic', label: 'Topic' },
      { key: 'Trainer', label: 'Trainer' },
      { key: 'Hours', label: 'Hours', type: 'number' },
      { key: 'Attendees', label: 'Attendees', type: 'number' },
      { key: 'Passed', label: 'Passed', type: 'number' },
    ],
    rows,
  };
}

function generateCpdSummaryReport(startDate, endDate) {
  const rows = query(`
    SELECT ta.FullName as Clinician,
           SUM(CASE WHEN tr.Passed = 1 THEN tr.Hours ELSE 0 END) as CpdHours,
           COUNT(DISTINCT tr.TrainingID) as Sessions,
           GROUP_CONCAT(DISTINCT tr.TrainingType) as Types
    FROM TrainingAttendee ta
    JOIN TrainingRecord tr ON ta.TrainingID = tr.TrainingID
    WHERE tr.TrainingDate BETWEEN ? AND ?
    GROUP BY ta.AttendeeID
    ORDER BY CpdHours DESC
  `, [startDate, endDate]);
  return {
    summary: { clinicians: rows.length, totalCpdHours: rows.reduce((s, r) => s + (r.CpdHours || 0), 0) },
    columns: [
      { key: 'Clinician', label: 'Clinician' },
      { key: 'CpdHours', label: 'CPD Hours', type: 'number' },
      { key: 'Sessions', label: 'Sessions', type: 'number' },
      { key: 'Types', label: 'Training Types' },
    ],
    rows,
  };
}

function generateWorkforceCertReport(startDate, endDate) {
  const rows = query(`
    SELECT TrainingType as Certification,
           COUNT(*) as Records,
           MIN(TrainingDate) as EarliestDate,
           MAX(TrainingDate) as LatestDate
    FROM TrainingRecord
    WHERE TrainingDate BETWEEN ? AND ?
    GROUP BY TrainingType
    ORDER BY Certification
  `, [startDate, endDate]);
  return {
    summary: { certificationTypes: rows.length },
    columns: [
      { key: 'Certification', label: 'Certification / Training Type' },
      { key: 'Records', label: 'Records', type: 'number' },
      { key: 'EarliestDate', label: 'First Date', type: 'date' },
      { key: 'LatestDate', label: 'Latest Date', type: 'date' },
    ],
    rows,
  };
}

// ÔöÇÔöÇ Executive ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function generateQuarterlyAodReport(startDate, endDate, employerFilter) {
  const byMonth = query(`
    SELECT strftime('%Y-%m', t.TestDate) as Month,
           COUNT(*) as Total,
           SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1 ELSE 0 END) as NonNegative,
           SUM(CASE WHEN t.BACFinalValue > 0 THEN 1 ELSE 0 END) as AlcoholPositive,
           ROUND(SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as NonNegRate
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
    GROUP BY Month ORDER BY Month
  `, [startDate, endDate]);
  const totals = query(`
    SELECT COUNT(*) as TotalTests,
           SUM(CASE WHEN OralResult='Non-Negative' THEN 1 ELSE 0 END) as TotalNonNeg
    FROM AODTest t JOIN Person p ON t.PersonID=p.PersonID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
  `, [startDate, endDate])[0] || {};
  return {
    summary: {
      totalTests: totals.TotalTests || 0,
      nonNegative: totals.TotalNonNeg || 0,
      nonNegRate: totals.TotalTests > 0 ? `${((totals.TotalNonNeg / totals.TotalTests) * 100).toFixed(1)}%` : '0%',
    },
    columns: [
      { key: 'Month', label: 'Month' },
      { key: 'Total', label: 'Total Tests', type: 'number' },
      { key: 'NonNegative', label: 'Non-Negative', type: 'number' },
      { key: 'AlcoholPositive', label: 'Alcohol Positive', type: 'number' },
      { key: 'NonNegRate', label: 'Non-Neg Rate %', type: 'number' },
    ],
    rows: byMonth,
  };
}

function generateIncidentAodReport(startDate, endDate, employerFilter) {
  const rows = query(`
    SELECT t.TestDate as Date, p.FullName as Worker, e.CompanyName as Employer,
           tt.Name as TestType, t.OralResult, t.OverallAODResult, t.Notes
    FROM AODTest t
    JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    WHERE t.TestDate BETWEEN ? AND ? ${employerFilter}
      AND tt.Code IN ('Post-Incident','For-Cause','Incident')
    ORDER BY t.TestDate DESC
  `, [startDate, endDate]);
  return {
    summary: { incidentTriggeredTests: rows.length },
    columns: [
      { key: 'Date', label: 'Date', type: 'date' },
      { key: 'Worker', label: 'Worker' },
      { key: 'Employer', label: 'Employer' },
      { key: 'TestType', label: 'Trigger Type' },
      { key: 'OralResult', label: 'Drug Result' },
      { key: 'OverallAODResult', label: 'Overall Result' },
      { key: 'Notes', label: 'Notes' },
    ],
    rows,
  };
}


app.post('/api/reports/export/:reportId', async (req, res) => {
  const { reportId } = req.params;
  res.json({ message: 'Export functionality coming soon', reportId });
});

// ============================================
// FILE ATTACHMENT ROUTES
// ============================================

// Test helper endpoints (for E2E testing only)
// Clear test data - only works in test/development mode
app.post('/api/test/cleanup', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Cleanup not allowed in production' });
  }
  try {
    // Delete test data (keep lookup tables)
    run('DELETE FROM AODTest WHERE TestNumber LIKE \'TEST-%\' OR TestNumber LIKE \'E2E-%\'');
    run('DELETE FROM NonNegativeRecord WHERE TypeOfTest = \'Test\'');
    run('DELETE FROM PendingResult');
    run('DELETE FROM PatientEvent WHERE EventDate > date(\'now\', \'-1 day\')');
    res.json({ message: 'Test data cleaned up' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias for POST /api/tests (used by E2E helpers)
app.post('/api/aod-tests', (req, res) => {
  // Forward to the main tests endpoint
  req.url = '/api/tests';
  // The actual endpoint will handle it
  res.redirect(307, '/api/tests');
});

// Upload attachment(s) for a test record
// Categories: 'Initial Test Record', 'Lab Results', 'Chain of Custody', 'Other'
app.post('/api/tests/:testId/attachments', upload.array('files', 10), (req, res) => {
  const { testId } = req.params;
  const { category, description } = req.body;
  
  const test = queryOne('SELECT * FROM AODTest WHERE TestID = ?', [testId]);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  const attachments = [];
  for (const file of req.files) {
    const result = run(`
      INSERT INTO Attachment (RecordType, RecordID, Category, FileName, OriginalFileName, FilePath, FileSize, MimeType, Description, UploadedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['AODTest', testId, category || 'Other', file.filename, file.originalname, file.path, file.size, file.mimetype, description || null, null]);
    
    attachments.push({
      id: result.lastInsertRowid,
      fileName: file.filename,
      originalFileName: file.originalname,
      category,
      size: file.size,
      mimeType: file.mimetype
    });
  }
  
  logAudit(null, 'UPLOAD', 'Attachment', testId, `Uploaded ${req.files.length} file(s) to test ${test.TestNumber}`);
  res.json({ message: `${req.files.length} file(s) uploaded`, attachments });
});

// List attachments for a test
app.get('/api/tests/:testId/attachments', (req, res) => {
  const { testId } = req.params;
  const { category } = req.query;
  
  let sql = `
    SELECT AttachmentID, Category, FileName, OriginalFileName, FileSize, MimeType, Description, UploadedAt
    FROM Attachment
    WHERE RecordType = 'AODTest' AND RecordID = ?
  `;
  const params = [testId];
  
  if (category) {
    sql += ' AND Category = ?';
    params.push(category);
  }
  
  sql += ' ORDER BY UploadedAt DESC';
  
  res.json(query(sql, params));
});

// Download/view an attachment
app.get('/api/attachments/:attachmentId/download', (req, res) => {
  const attachment = queryOne('SELECT * FROM Attachment WHERE AttachmentID = ?', [req.params.attachmentId]);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  
  const filePath = attachment.FilePath;
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  res.setHeader('Content-Type', attachment.MimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${attachment.OriginalFileName || attachment.FileName}"`);
  res.sendFile(filePath);
});

// Delete an attachment
app.delete('/api/attachments/:attachmentId', (req, res) => {
  const attachment = queryOne('SELECT * FROM Attachment WHERE AttachmentID = ?', [req.params.attachmentId]);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  
  // Delete file from disk
  if (existsSync(attachment.FilePath)) {
    try {
      unlinkSync(attachment.FilePath);
    } catch (err) {
      logger.error('Error deleting attachment file', { error: err.message, path: attachment.FilePath });
    }
  }
  
  // Delete from database
  run('DELETE FROM Attachment WHERE AttachmentID = ?', [req.params.attachmentId]);
  
  logAudit(null, 'DELETE', 'Attachment', req.params.attachmentId, `Deleted attachment: ${attachment.OriginalFileName}`);
  res.json({ message: 'Attachment deleted' });
});

// Get attachment categories summary for a test
app.get('/api/tests/:testId/attachments/summary', (req, res) => {
  const summary = query(`
    SELECT Category, COUNT(*) as Count
    FROM Attachment
    WHERE RecordType = 'AODTest' AND RecordID = ?
    GROUP BY Category
  `, [req.params.testId]);
  
  res.json(summary);
});

// ============================================
// RANDOM TEST LIST ROUTES
// ============================================

// Configure multer for PDF uploads (temporary storage)
const pdfUploadDir = join(__dirname, 'uploads', 'temp');
if (!existsSync(pdfUploadDir)) mkdirSync(pdfUploadDir, { recursive: true });

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pdfUploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.pdf`)
});

const pdfUpload = multer({
  storage: pdfStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Preview PDF content (for debugging/understanding structure)
app.post('/api/random-lists/preview-pdf', pdfUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
  
  try {
    const dataBuffer = readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    
    // Clean up temp file
    unlinkSync(req.file.path);
    
    res.json({
      text: pdfData.text,
      numPages: pdfData.numpages,
      info: pdfData.info
    });
  } catch (err) {
    if (existsSync(req.file.path)) unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
});

// Import PDF and create random test list
app.post('/api/random-lists/import', pdfUpload.single('file'), async (req, res) => {
  logger.info('PDF import request received', { 
    hasFile: !!req.file, 
    body: req.body,
    fileInfo: req.file ? { originalname: req.file.originalname, size: req.file.size, path: req.file.path } : null
  });
  
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
  
  const { listDate, shift, employerId: defaultEmployerId, testTypeId } = req.body;
  if (!listDate || !shift) {
    unlinkSync(req.file.path);
    return res.status(400).json({ error: 'listDate and shift are required' });
  }
  
  try {
    const dataBuffer = readFileSync(req.file.path);
    logger.info('PDF file read', { size: dataBuffer.length });
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;
    logger.info('PDF parsed', { textLength: text.length, preview: text.substring(0, 200) });
    
    // Parse the PDF text to extract employee entries
    // This parser handles various formats - adjust based on actual PDF structure
    const entries = parseRandomListPDF(text);
    logger.info('PDF entries parsed', { count: entries.length, entries: entries.slice(0, 3) });
    
    if (entries.length === 0) {
      unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'No entries found in PDF', 
        rawText: text.substring(0, 2000) // Return sample for debugging
      });
    }
    
    // Create the list record
    let listId;
    try {
      const listResult = run(`
        INSERT INTO RandomTestList (ListDate, Shift, SourceFileName, ImportedBy, DefaultEmployerID, TestTypeID)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [listDate, shift, req.file.originalname, null, defaultEmployerId ? parseInt(defaultEmployerId) : null, testTypeId ? parseInt(testTypeId) : null]);
      listId = listResult.lastInsertRowid;
      logger.info('Created RandomTestList', { listId });
    } catch (err) {
      logger.error('Failed to create RandomTestList', { error: err.message });
      throw err;
    }
    
    // Insert entries with employer classification
    let insertedCount = 0;
    for (const entry of entries) {
      try {
        // Try to match with existing person by name or employee number
        let matchedPersonId = null;
        if (entry.employeeNumber) {
          const person = queryOne('SELECT PersonID FROM Person WHERE BadgeNumber = ?', [entry.employeeNumber]);
          if (person) matchedPersonId = person.PersonID;
        }
        if (!matchedPersonId && entry.employeeName) {
          // Try exact match first
          let person = queryOne('SELECT PersonID FROM Person WHERE LOWER(TRIM(FullName)) = LOWER(TRIM(?))', [entry.employeeName]);
          if (!person) {
            // Try surname-based match (unambiguous only)
            const surname = getSurname(entry.employeeName);
            if (surname.length > 1) {
              const candidates = query('SELECT PersonID, FullName FROM Person WHERE IsActive = 1', []);
              const matched = candidates.filter(p => getSurname(p.FullName) === surname);
              if (matched.length === 1) person = matched[0];
            }
          }
          if (person) matchedPersonId = person.PersonID;
        }
        
        // Get or create employer with automatic SCJV/Contractor classification
        let employerId = null;
        let employerCategory = null;
        if (entry.department) {
          const employer = getOrCreateEmployer(entry.department);
          if (employer) {
            employerId = employer.EmployerID;
            employerCategory = employer.Category;
          }
        }
        
        run(`
          INSERT INTO RandomTestEntry (ListID, EmployeeNumber, EmployeeName, Department, Position, StatusNote, EmployerID, EmployerCategory, MatchedPersonID)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [listId, entry.employeeNumber, entry.employeeName, entry.department, entry.position, entry.note || null, employerId, employerCategory, matchedPersonId]);
        insertedCount++;
      } catch (err) {
        logger.error('Failed to insert entry', { entry, error: err.message });
      }
    }
    
    logger.info('Entries inserted', { insertedCount, total: entries.length });
    
    // Auto-schedule entries with matched persons as ScheduledTest entries
    let scheduledCount = 0;
    const importedEntries = query(`
      SELECT EntryID, MatchedPersonID, EmployerID FROM RandomTestEntry WHERE ListID = ? AND MatchedPersonID IS NOT NULL
    `, [listId]);
    
    for (const entry of importedEntries) {
      try {
        run(`
          INSERT INTO ScheduledTest (PersonID, EmployerID, ScheduledDate, ScheduledTime, TestTypeID, SourceType, SourceID, Status, Notes)
          VALUES (?, ?, ?, NULL, ?, 'RandomList', ?, 'Scheduled', 'Auto-scheduled from imported list')
        `, [entry.MatchedPersonID, entry.EmployerID || null, listDate, testTypeId || null, entry.EntryID]);
        scheduledCount++;
        
        // Mark the RandomTestEntry as scheduled
        run(`UPDATE RandomTestEntry SET Status = 'Scheduled' WHERE EntryID = ?`, [entry.EntryID]);
      } catch (err) {
        logger.error('Failed to auto-schedule entry', { entryId: entry.EntryID, error: err.message });
      }
    }
    
    logger.info('Auto-scheduled entries', { scheduledCount });
    
    // Clean up temp file
    unlinkSync(req.file.path);
    
    logAudit(null, 'IMPORT', 'RandomTestList', listId, `Imported ${entries.length} entries, auto-scheduled ${scheduledCount}`);
    
    res.json({
      message: `Imported ${entries.length} entries`,
      listId,
      entriesCount: entries.length,
      scheduledCount,
      entries
    });
  } catch (err) {
    if (existsSync(req.file.path)) unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to import PDF: ' + err.message });
  }
});

// Helper function to parse random list PDF text
// Handles Clough/Perdaman format: Name concatenated with workgroup/employer/status
function parseRandomListPDF(text) {
  const entries = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Pattern for Clough/Perdaman format with PCH Civil:
  // "NAME45826 Perdaman CeresPCH Civil45826 - WORK_STATUS"
  // "NAME45826 Perdaman CeresEMPLOYER45826 - WORK_STATUS"
  const cloughFullPattern = /^([A-Z][A-Z\-\' ]+,\s*[A-Za-z\-\' ]+?)(\d{5})\s*Perdaman\s*Ceres(.+?)(\d{5})\s*-\s*(.+)$/i;
  
  // Pattern for name with PCH Civil directly after (no space between Ceres and PCH)
  const cloughPCHPattern = /^([A-Z][A-Z\-\' ]+,\s*[A-Za-z\-\' ]+?)(\d{5})\s*Perdaman\s*CeresPCH\s*Civil(.+?)$/i;
  
  // Partial pattern (name + project code but employer may be on next line)
  const cloughPartialPattern = /^([A-Z][A-Z\-\' ]+,\s*[A-Za-z\-\' ]+?)(\d{5})\s*Perdaman\s*Ceres$/i;
  
  // Pattern for name ending with "Perdaman Ceres" but no space after (PCH Civil case)
  const cloughPartialPCHPattern = /^([A-Z][A-Z\-\' ]+,\s*[A-Za-z\-\' ]+?)(\d{5})\s*Perdaman\s*CeresPCH$/i;
  
  // Pattern for standard "LASTNAME, Firstname" format
  const standardNamePattern = /^([A-Z][A-Z\-\']+,\s*[A-Za-z\s\-\']+)$/;

  // Pattern for lines that are just employer + work status (continuation)
  const continuationPattern = /^(.+?)(\d{5})\s*-\s*(.+)$/;
  
  // Pattern for PCH Civil continuation (employer part + code + status)
  const pchCivilPattern = /^PCH\s*Civil(.+?)(\d{5})\s*-\s*(.+)$/i;
  
  let pendingEntry = null;
  let debugLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    debugLines.push(line);
    
    // Skip header/footer lines (but not if we have a pending entry - might be employer continuation)
    const isHeaderFooter = 
      lowerLine.includes('random test selection') ||
      lowerLine.includes('nameworkgroup') || 
      lowerLine.includes('name workgroup') ||
      (lowerLine.includes('page ') && /\d+\s*of\s*\d+/.test(lowerLine)) ||
      /^\d{2}-[a-z]{3}-\d{4}/i.test(line) ||
      /^\d{1,2}:\d{2}:\d{2}/.test(line);
    
    if (isHeaderFooter && !pendingEntry) continue;
    if (isHeaderFooter && pendingEntry) {
      entries.push(pendingEntry);
      pendingEntry = null;
      continue;
    }
    
    // Skip standalone "Clough" header (but allow "CLOUGH PROJECTS" as employer)
    if (lowerLine === 'clough' && !pendingEntry) continue;
    if (line.length < 5) continue;
    
    // Try full Clough format first (all on one line)
    const fullMatch = line.match(cloughFullPattern);
    if (fullMatch) {
      if (pendingEntry) {
        entries.push(pendingEntry);
        pendingEntry = null;
      }
      
      entries.push({
        employeeNumber: fullMatch[2],
        employeeName: fullMatch[1].trim(),
        department: fullMatch[3].trim(),
        position: fullMatch[5].trim(),
        note: null
      });
      continue;
    }
    
    // Try PCH Civil pattern (no space between Ceres and PCH)
    const pchMatch = line.match(cloughPCHPattern);
    if (pchMatch) {
      if (pendingEntry) {
        entries.push(pendingEntry);
        pendingEntry = null;
      }
      
      entries.push({
        employeeNumber: pchMatch[2],
        employeeName: pchMatch[1].trim(),
        department: 'PCH Civil',
        position: pchMatch[3].trim(),
        note: null
      });
      continue;
    }
    
    // Try partial pattern (name ends with "Perdaman Ceres" but employer is on next line)
    const partialMatch = line.match(cloughPartialPattern);
    if (partialMatch) {
      if (pendingEntry) {
        entries.push(pendingEntry);
      }
      
      pendingEntry = {
        employeeNumber: partialMatch[2],
        employeeName: partialMatch[1].trim(),
        department: null,
        position: null,
        note: null
      };
      continue;
    }
    
    // Try partial pattern ending with "Perdaman CeresPCH"
    const partialPCHMatch = line.match(cloughPartialPCHPattern);
    if (partialPCHMatch) {
      if (pendingEntry) {
        entries.push(pendingEntry);
      }
      
      pendingEntry = {
        employeeNumber: partialPCHMatch[2],
        employeeName: partialPCHMatch[1].trim(),
        department: null,
        position: null,
        _isPCH: true,
        note: null
      };
      continue;
    }
    
    // Check if this line is a continuation for PCH Civil entries
    if (pendingEntry && pendingEntry._isPCH) {
      const pchContMatch = line.match(pchCivilPattern);
      if (pchContMatch) {
        pendingEntry.department = 'PCH Civil' + (pchContMatch[1] ? ' ' + pchContMatch[1].trim() : '');
        pendingEntry.position = pchContMatch[3].trim();
        delete pendingEntry._isPCH;
        entries.push(pendingEntry);
        pendingEntry = null;
        continue;
      }
    }
    
    // Check if this line is a continuation (employer + work status)
    if (pendingEntry) {
      const contMatch = line.match(continuationPattern);
      if (contMatch) {
        pendingEntry.department = contMatch[1].trim();
        pendingEntry.position = contMatch[3].trim();
        entries.push(pendingEntry);
        pendingEntry = null;
        continue;
      }
      
      // Check for multi-line employer (no digits)
      if (!pendingEntry.department && /^[A-Z][A-Za-z\s\&]+$/.test(line) && !line.includes('45826')) {
        pendingEntry._partialEmployer = (pendingEntry._partialEmployer || '') + ' ' + line;
        continue;
      }
      
      // Check if this line is just the work status part
      const statusOnlyMatch = line.match(/^(\d{5})\s*-\s*(.+)$/);
      if (statusOnlyMatch) {
        pendingEntry.department = (pendingEntry._partialEmployer || '').trim();
        pendingEntry.position = statusOnlyMatch[2].trim();
        delete pendingEntry._partialEmployer;
        entries.push(pendingEntry);
        pendingEntry = null;
        continue;
      }
      
      entries.push(pendingEntry);
      pendingEntry = null;
    }
    
    // Try standard "LASTNAME, Firstname" format
    const standardMatch = line.match(standardNamePattern);
    if (standardMatch && standardMatch[1].length >= 5 && standardMatch[1].length <= 50) {
      entries.push({
        employeeNumber: null,
        employeeName: standardMatch[1].trim(),
        department: null,
        position: null,
        note: null
      });
      continue;
    }
    
    // Try numbered entries
    const numberedMatch = line.match(/^\d+[\.\)]\s*([A-Z][A-Za-z\s\-\',]+)/);
    if (numberedMatch) {
      entries.push({
        employeeNumber: null,
        employeeName: numberedMatch[1].trim(),
        department: null,
        position: null,
        note: null
      });
      continue;
    }
    
    // Try employee number + name format
    const empMatch = line.match(/^([A-Z]*\d+)\s+([A-Z][A-Za-z\s\-\',]+)/i);
    if (empMatch && empMatch[2].length > 3) {
      entries.push({
        employeeNumber: empMatch[1],
        employeeName: empMatch[2].trim(),
        department: null,
        position: null,
        note: null
      });
    }
  }
  
  if (pendingEntry) {
    entries.push(pendingEntry);
  }
  
  logger.info('PDF parsed', { totalLines: lines.length, entriesFound: entries.length, sample: entries.slice(0, 3) });
  return entries;
}

// Get all random test lists
app.get('/api/random-lists', (req, res) => {
  const { date, shift } = req.query;
  
  let sql = `
    SELECT l.*, 
           (SELECT COUNT(*) FROM RandomTestEntry WHERE ListID = l.ListID) as TotalEntries,
           (SELECT COUNT(*) FROM RandomTestEntry WHERE ListID = l.ListID AND Status = 'Pending') as PendingCount,
           (SELECT COUNT(*) FROM RandomTestEntry WHERE ListID = l.ListID AND Status = 'Tested') as TestedCount
    FROM RandomTestList l
    WHERE 1=1
  `;
  const params = [];
  
  if (date) { sql += ' AND l.ListDate = ?'; params.push(date); }
  if (shift) { sql += ' AND l.Shift = ?'; params.push(shift); }
  
  sql += ' ORDER BY l.ListDate DESC, l.Shift';
  
  res.json(query(sql, params));
});

// Get all entries for a specific date (across all lists for that date)
app.get('/api/random-lists/for-date/:date', (req, res) => {
  const date = req.params.date;
  const entries = query(`
    SELECT e.*, l.Shift, l.ListDate, l.ListID, l.TestTypeID as ListTestTypeID,
           COALESCE(e.EmployerID, l.DefaultEmployerID) as ResolvedEmployerID,
           COALESCE(p.FullName, e.EmployeeName) as DisplayName,
           p.BadgeNumber as MatchedBadge,
           t.TestNumber, t.TestDate as TestedDate,
           emp.CompanyName as MatchedEmployerName,
           defEmp.CompanyName as DefaultEmployerName
    FROM RandomTestEntry e
    JOIN RandomTestList l ON e.ListID = l.ListID
    LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
    LEFT JOIN Employer emp ON p.EmployerID = emp.EmployerID
    LEFT JOIN Employer defEmp ON l.DefaultEmployerID = defEmp.EmployerID
    LEFT JOIN AODTest t ON e.TestID = t.TestID
    WHERE l.ListDate = ?
    ORDER BY l.Shift, e.EmployeeName
  `, [date]);
  res.json(entries);
});

// Update a random test entry status
app.put('/api/random-lists/entries/:entryId', (req, res) => {
  const { status, testId } = req.body;
  run('UPDATE RandomTestEntry SET Status = ?, TestID = ? WHERE EntryID = ?',
    [status, testId || null, req.params.entryId]);
  res.json({ message: 'Entry updated' });
});

// Delete a single random list entry
app.delete('/api/random-lists/entries/:entryId', (req, res) => {
  try {
    const entry = queryOne('SELECT * FROM RandomTestEntry WHERE EntryID = ?', [req.params.entryId]);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    
    // Delete any associated scheduled test
    if (entry.Status === 'Scheduled') {
      run('DELETE FROM ScheduledTest WHERE SourceType = ? AND SourceID = ?', ['RandomList', entry.EntryID]);
    }
    
    run('DELETE FROM RandomTestEntry WHERE EntryID = ?', [req.params.entryId]);
    logAudit(null, 'DELETE', 'RandomTestEntry', req.params.entryId, `Deleted entry: ${entry.EmployeeName}`);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full edit of imported entry (name, department, position, rematch person)
app.put('/api/random-lists/entries/:entryId/edit', (req, res) => {
  try {
    const { employeeName, department, position, matchedPersonId, matchedEmployerId, displayName } = req.body;
    const entryId = req.params.entryId;

    // Get current entry to preserve ListID for rematching
    const entry = queryOne('SELECT * FROM RandomTestEntry WHERE EntryID = ?', [entryId]);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // Build update fields
    const updates = [];
    const params = [];

    if (employeeName !== undefined) { updates.push('EmployeeName = ?'); params.push(employeeName); }
    if (department !== undefined) { updates.push('Department = ?'); params.push(department); }
    if (position !== undefined) { updates.push('Position = ?'); params.push(position); }
    if (displayName !== undefined) { updates.push('DisplayName = ?'); params.push(displayName); }

    // Handle person rematching
    if (matchedPersonId !== undefined) {
      if (matchedPersonId) {
        const person = queryOne('SELECT * FROM Person WHERE PersonID = ?', [matchedPersonId]);
        if (person) {
          updates.push('MatchedPersonID = ?');
          params.push(matchedPersonId);
          updates.push('MatchedBadge = ?');
          params.push(person.BadgeNumber || null);
          updates.push('MatchedEmployerID = ?');
          params.push(person.EmployerID || null);
          updates.push('MatchedEmployerName = ?');
          const emp = person.EmployerID ? queryOne('SELECT CompanyName FROM Employer WHERE EmployerID = ?', [person.EmployerID]) : null;
          params.push(emp?.CompanyName || null);
        }
      } else {
        // Clear matching
        updates.push('MatchedPersonID = NULL');
        updates.push('MatchedBadge = NULL');
        updates.push('MatchedEmployerID = NULL');
        updates.push('MatchedEmployerName = NULL');
      }
    } else if (matchedEmployerId !== undefined && entry.MatchedPersonID) {
      // Just update employer name if person is matched
      const emp = matchedEmployerId ? queryOne('SELECT CompanyName FROM Employer WHERE EmployerID = ?', [matchedEmployerId]) : null;
      updates.push('MatchedEmployerID = ?');
      params.push(matchedEmployerId || null);
      updates.push('MatchedEmployerName = ?');
      params.push(emp?.CompanyName || null);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No changes', entry: queryOne('SELECT * FROM RandomTestEntry WHERE EntryID = ?', [entryId]) });
    }

    params.push(entryId);
    const sql = `UPDATE RandomTestEntry SET ${updates.join(', ')} WHERE EntryID = ?`;
    run(sql, params);

    // Fetch updated entry
    const updated = queryOne(`
      SELECT e.*, p.FullName as MatchedPersonName, p.BadgeNumber as MatchedBadge
      FROM RandomTestEntry e
      LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
      WHERE e.EntryID = ?
    `, [entryId]);

    res.json({ message: 'Entry updated', entry: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific list with its entries
app.get('/api/random-lists/:listId', (req, res) => {
  const list = queryOne('SELECT * FROM RandomTestList WHERE ListID = ?', [req.params.listId]);
  if (!list) return res.status(404).json({ error: 'List not found' });
  
  const entries = query(`
    SELECT e.*, p.FullName as MatchedPersonName, p.BadgeNumber as MatchedBadge,
           t.TestNumber, t.TestDate as TestedDate
    FROM RandomTestEntry e
    LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
    LEFT JOIN AODTest t ON e.TestID = t.TestID
    WHERE e.ListID = ?
    ORDER BY e.EntryID
  `, [req.params.listId]);
  
  res.json({ list, entries });
});

// Get entries for a specific list
app.get('/api/random-lists/:listId/entries', (req, res) => {
  const entries = query(`
    SELECT e.*, p.FullName as MatchedPersonName, p.BadgeNumber as MatchedBadge,
           t.TestNumber, t.TestDate as TestedDate
    FROM RandomTestEntry e
    LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
    LEFT JOIN AODTest t ON e.TestID = t.TestID
    WHERE e.ListID = ?
    ORDER BY e.EntryID
  `, [req.params.listId]);
  
  res.json(entries);
});

// Get today's pending random tests (combined day/night)
app.get('/api/random-lists/today/pending', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const entries = query(`
    SELECT e.*, l.Shift, l.ListDate, p.FullName as MatchedPersonName
    FROM RandomTestEntry e
    JOIN RandomTestList l ON e.ListID = l.ListID
    LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
    WHERE l.ListDate = ? AND e.Status = 'Pending'
    ORDER BY l.Shift, e.EmployeeName
  `, [today]);
  
  res.json(entries);
});

// Add manual entry to a list
app.post('/api/random-lists/:listId/entries', (req, res) => {
  const { employeeNumber, employeeName, department, position } = req.body;
  
  if (!employeeName) return res.status(400).json({ error: 'employeeName is required' });
  
  const list = queryOne('SELECT * FROM RandomTestList WHERE ListID = ?', [req.params.listId]);
  if (!list) return res.status(404).json({ error: 'List not found' });
  
  // Try to match with existing person
  let matchedPersonId = null;
  if (employeeNumber) {
    const person = queryOne('SELECT PersonID FROM Person WHERE BadgeNumber = ?', [employeeNumber]);
    if (person) matchedPersonId = person.PersonID;
  }
  if (!matchedPersonId) {
    const person = queryOne('SELECT PersonID FROM Person WHERE FullName LIKE ?', [`%${employeeName}%`]);
    if (person) matchedPersonId = person.PersonID;
  }
  
  const result = run(`
    INSERT INTO RandomTestEntry (ListID, EmployeeNumber, EmployeeName, Department, Position, MatchedPersonID, ManualEntry)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `, [req.params.listId, employeeNumber, employeeName, department, position, matchedPersonId]);
  
  res.json({ id: result.lastInsertRowid, message: 'Entry added' });
});

// Create a new empty list (for manual entry only)
app.post('/api/random-lists', (req, res) => {
  const { listDate, shift, notes } = req.body;
  
  if (!listDate || !shift) return res.status(400).json({ error: 'listDate and shift are required' });
  
  const result = run(`
    INSERT INTO RandomTestList (ListDate, Shift, Notes, ImportedBy)
    VALUES (?, ?, ?, ?)
  `, [listDate, shift, notes, null]);
  
  res.json({ id: result.lastInsertRowid, message: 'List created' });
});

// Update entry status
app.put('/api/random-entries/:entryId/status', (req, res) => {
  const { status, statusNote, testId } = req.body;
  // status: 'Pending', 'Tested', 'Not Available', 'Deferred', 'Cancelled'
  
  const entry = queryOne('SELECT * FROM RandomTestEntry WHERE EntryID = ?', [req.params.entryId]);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  
  run(`
    UPDATE RandomTestEntry 
    SET Status = ?, StatusNote = ?, TestID = ?, StatusUpdatedAt = CURRENT_TIMESTAMP, StatusUpdatedBy = ?
    WHERE EntryID = ?
  `, [status, statusNote, testId || null, null, req.params.entryId]);
  
  res.json({ message: 'Entry status updated' });
});

// Delete an entry
app.delete('/api/random-entries/:entryId', (req, res) => {
  const entry = queryOne('SELECT * FROM RandomTestEntry WHERE EntryID = ?', [req.params.entryId]);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  
  run('DELETE FROM RandomTestEntry WHERE EntryID = ?', [req.params.entryId]);
  res.json({ message: 'Entry deleted' });
});

// Delete a list and all its entries
app.delete('/api/random-lists/:listId', (req, res) => {
  const list = queryOne('SELECT * FROM RandomTestList WHERE ListID = ?', [req.params.listId]);
  if (!list) return res.status(404).json({ error: 'List not found' });
  
  run('DELETE FROM RandomTestEntry WHERE ListID = ?', [req.params.listId]);
  run('DELETE FROM RandomTestList WHERE ListID = ?', [req.params.listId]);
  
  res.json({ message: 'List and entries deleted' });
});

// ============================================
// EMPLOYER IMPORT & MANAGEMENT
// ============================================

// Import employers from Excel file (AOD Tracker V2.xlsx Data tab)
app.post('/api/employers/import-excel', pdfUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = req.body.sheet || 'Data';
    const ws = workbook.Sheets[sheetName];
    
    if (!ws) {
      unlinkSync(req.file.path);
      return res.status(400).json({ error: `Sheet "${sheetName}" not found`, sheets: workbook.SheetNames });
    }
    
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    // Extract unique employer names from column E (index 4)
    const employerNames = new Set();
    data.slice(1).forEach(row => {
      if (row[4] && typeof row[4] === 'string') {
        employerNames.add(row[4].trim());
      }
    });
    
    // Import each employer with classification
    const imported = [];
    const skipped = [];
    
    for (const name of employerNames) {
      const existing = queryOne('SELECT * FROM Employer WHERE LOWER(CompanyName) = LOWER(?)', [name]);
      if (existing) {
        skipped.push({ name, reason: 'Already exists' });
      } else {
        const category = classifyEmployer(name);
        run(`INSERT INTO Employer (CompanyName, Category, IsActive) VALUES (?, ?, 1)`, [name, category]);
        imported.push({ name, category });
      }
    }
    
    unlinkSync(req.file.path);
    
    res.json({
      message: `Imported ${imported.length} employers, skipped ${skipped.length}`,
      imported,
      skipped
    });
  } catch (err) {
    if (existsSync(req.file.path)) unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to import: ' + err.message });
  }
});

// Bulk import employers from JSON array
app.post('/api/employers/bulk-import', (req, res) => {
  const { employers } = req.body; // Array of employer names
  
  if (!employers || !Array.isArray(employers)) {
    return res.status(400).json({ error: 'employers array required' });
  }
  
  const imported = [];
  const skipped = [];
  
  for (const name of employers) {
    if (!name || typeof name !== 'string') continue;
    
    const trimmed = name.trim();
    const existing = queryOne('SELECT * FROM Employer WHERE LOWER(CompanyName) = LOWER(?)', [trimmed]);
    
    if (existing) {
      skipped.push({ name: trimmed, reason: 'Already exists', category: existing.Category });
    } else {
      const category = classifyEmployer(trimmed);
      run(`INSERT INTO Employer (CompanyName, Category, IsActive) VALUES (?, ?, 1)`, [trimmed, category]);
      imported.push({ name: trimmed, category });
    }
  }
  
  res.json({
    message: `Imported ${imported.length} employers, skipped ${skipped.length}`,
    imported,
    skipped
  });
});


// Update employer category
app.put('/api/employers/:id/category', (req, res) => {
  const { category } = req.body;
  const categories = getEmployerCategories();
  
  if (!categories.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${categories.join(', ')}` });
  }
  
  run('UPDATE Employer SET Category = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE EmployerID = ?', 
    [category, req.params.id]);
  res.json({ message: 'Category updated' });
});

// Reclassify all employers based on SCJV patterns
app.post('/api/employers/reclassify', (req, res) => {
  const employers = query('SELECT * FROM Employer');
  let updated = 0;
  
  for (const emp of employers) {
    const newCategory = classifyEmployer(emp.CompanyName);
    if (newCategory !== emp.Category) {
      run('UPDATE Employer SET Category = ? WHERE EmployerID = ?', [newCategory, emp.EmployerID]);
      updated++;
    }
  }
  
  res.json({ message: `Reclassified ${updated} employers`, total: employers.length });
});

// ============================================
// ADMIN ROUTES (Password Protected)
// ============================================

// Verify admin password
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    logger.auth('Admin login', true, { ip: req.ip });
    res.json({ success: true, message: 'Admin access granted' });
  } else {
    logger.auth('Admin login failed', false, { ip: req.ip });
    res.status(401).json({ success: false, error: 'Invalid admin password' });
  }
});

// Public app config (no auth needed — employee label, etc.)
app.get('/api/app-config', (req, res) => {
  try {
    const empLabel = queryOne("SELECT ConfigValue FROM SystemConfig WHERE ConfigKey = 'employee_label'");
    res.json({ employeeLabel: empLabel?.ConfigValue || 'Employees' });
  } catch { res.json({ employeeLabel: 'Employees' }); }
});

// Get system settings (adminAuth required)
app.get('/api/admin/settings', adminAuth, (req, res) => {
  try {
    const settings = query('SELECT * FROM SystemConfig ORDER BY ConfigKey');
    res.json(settings);
  } catch (err) {
    logger.error('Failed to get system settings', { error: err.message });
    res.json([]);
  }
});

// Update system setting
app.put('/api/admin/settings/:key', adminAuth, (req, res) => {
  const { value } = req.body;
  const key = req.params.key;
  
  const existing = queryOne('SELECT * FROM SystemConfig WHERE ConfigKey = ?', [key]);
  if (existing) {
    run('UPDATE SystemConfig SET ConfigValue = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE ConfigKey = ?', [value, key]);
  } else {
    run('INSERT INTO SystemConfig (ConfigKey, ConfigValue) VALUES (?, ?)', [key, value]);
  }
  
  logger.info('System setting updated', { key, value });
  logAudit(null, 'UPDATE', 'SystemConfig', key, `Setting updated: ${key} = ${value}`);
  res.json({ message: 'Setting updated', key, value });
});

// Get Employee/Contractor classification patterns
app.get('/api/admin/classification-patterns', adminAuth, (req, res) => {
  const patterns = queryOne("SELECT ConfigValue FROM SystemConfig WHERE ConfigKey = 'EMPLOYEE_PATTERNS'");
  res.json({
    patterns: patterns?.ConfigValue ? JSON.parse(patterns.ConfigValue) : ['saipem', 'clough', 'scjv'],
    description: 'Company names containing these patterns (case-insensitive) are classified as "Employee". Others are "Contractor".'
  });
});

// Update Employee/Contractor classification patterns
app.put('/api/admin/classification-patterns', adminAuth, (req, res) => {
  const { patterns } = req.body;
  if (!Array.isArray(patterns)) {
    return res.status(400).json({ error: 'Patterns must be an array' });
  }
  
  const existing = queryOne("SELECT * FROM SystemConfig WHERE ConfigKey = 'EMPLOYEE_PATTERNS'");
  if (existing) {
    run("UPDATE SystemConfig SET ConfigValue = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE ConfigKey = 'EMPLOYEE_PATTERNS'", 
      [JSON.stringify(patterns)]);
  } else {
    run("INSERT INTO SystemConfig (ConfigKey, ConfigValue, Description) VALUES ('EMPLOYEE_PATTERNS', ?, 'Patterns for Employee classification')", 
      [JSON.stringify(patterns)]);
  }
  
  logger.info('Classification patterns updated', { patterns });
  res.json({ message: 'Patterns updated', patterns });
});

// â”€â”€ EMAIL RULES HELPER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Evaluate email rules against a newly created/updated test.
 * trigger: 'new_test' | 'lab_result'
 * testRow: the full AODTest row (after inserts/updates) with joined fields
 */
async function fireEmailRules(trigger, testId) {
  try {
    const rules = getEmailRules();
    if (!rules.length) return;
    // Load current test state
    const test = queryOne(`
      SELECT t.*, p.FullName as PersonName, p.BadgeNumber, p.EmployeeNumber,
             e.CompanyName as EmployerName, tt.Name as TestTypeName, c.Name as ClinicianName
      FROM AODTest t
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
      WHERE t.TestID = ?
    `, [testId]);
    if (!test) return;

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.trigger !== trigger) continue;
      if (!rule.recipients || !rule.recipients.length) continue;

      // Evaluate conditions
      let match = true;
      if (rule.condition === 'non_negative'  && !test.IsNonNegative) match = false;
      if (rule.condition === 'bac_positive'  && test.FinalBACOutcome !== 'Positive') match = false;
      if (rule.condition === 'drug_confirmed'&& !test.FinalDrugOutcome?.includes('Confirmed')) match = false;
      if (rule.condition === 'pending_lab'   && test.TestStatus !== 'Pending Lab') match = false;
      if (rule.condition === 'all')          { /* always */ }
      if (!match) continue;

      // Build subject using rule template or default
      const subject = (rule.subjectTemplate || 'AOD Test Report â€” {TestNumber} â€” {Result}')
        .replace('{TestNumber}', test.TestNumber || '')
        .replace('{PersonName}',  test.PersonName  || '')
        .replace('{Result}',      test.OverallAODResult || 'Pending')
        .replace('{Employer}',    test.EmployerName || '');

      // Send (non-blocking â€” log failures but don't throw)
      sendTestEmail({
        testId,
        to: rule.recipients,
        subject,
        triggerLabel: rule.label || trigger,
      }).catch(err => logger.warn('Auto-email failed', { ruleId: rule.id, testId, error: err.message }));
    }
  } catch (err) {
    logger.warn('fireEmailRules error', { trigger, testId, error: err.message });
  }
}

// â”€â”€ SMTP / EMAIL SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET smtp settings (password masked â€” read is open; write requires adminAuth)
app.get('/api/admin/smtp', (req, res) => {
  try {
    const cfg = getSmtpConfig();
    res.json({ ...cfg, pass: cfg.pass ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT smtp settings
app.put('/api/admin/smtp', (req, res) => {
  try {
    const { host, port, secure, user, pass, fromName, fromAddress, enabled, rejectUnauthorized } = req.body;
    // Preserve existing password if masked placeholder sent
    const existing = getSmtpConfig();
    const resolvedPass = (pass && pass !== 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢') ? pass : (existing.pass || '');
    const cfg = {
      host:               host || '',
      port:               parseInt(port || '587', 10),
      secure:             !!secure,
      user:               user || '',
      pass:               resolvedPass,
      fromName:           fromName || '',
      fromAddress:        fromAddress || '',
      enabled:            !!enabled,
      rejectUnauthorized: rejectUnauthorized !== false,
    };
    saveSmtpConfig(cfg);
    logger.info('SMTP settings updated', { host, port, user, enabled });
    res.json({ message: 'SMTP settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST test smtp connection (uses request body config, not saved)
app.post('/api/admin/smtp/test', async (req, res) => {
  try {
    const { host, port, secure, user, pass, fromAddress, sendTo, rejectUnauthorized } = req.body;
    // Resolve password â€” accept masked placeholder as "use saved"
    const existing = getSmtpConfig();
    const resolvedPass = (pass && pass !== 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢') ? pass : (existing.pass || '');
    const cfg = { host, port, secure, user, pass: resolvedPass, rejectUnauthorized, fromAddress };
    await testSmtp(cfg);
    // Optionally send a test email
    if (sendTo) {
      const transporter = (await import('nodemailer')).default.createTransport({
        host, port: parseInt(port || '587', 10),
        secure: !!secure,
        auth: user ? { user, pass: resolvedPass } : undefined,
        tls: { rejectUnauthorized: rejectUnauthorized !== false },
      });
      const from = fromAddress || user;
      await transporter.sendMail({
        from, to: sendTo,
        subject: 'AOD Tracker â€” SMTP Test',
        text: 'This is a test email from your AOD Tracker SMTP configuration. If you received this, your settings are correct.',
        html: '<p>This is a test email from your <strong>AOD Tracker</strong> SMTP configuration.</p><p>If you received this, your settings are correct. âœ“</p>',
      });
      res.json({ success: true, message: `Connection verified and test email sent to ${sendTo}.` });
    } else {
      res.json({ success: true, message: 'SMTP connection verified successfully.' });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// â”€â”€ EMAIL NOTIFICATION RULES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/admin/email-rules', (req, res) => {
  try {
    res.json(getEmailRules());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/email-rules', (req, res) => {
  try {
    const rules = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'Expected array of rules' });
    saveEmailRules(rules);
    res.json({ message: 'Email rules saved', count: rules.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual send of a test record via email
app.post('/api/tests/:id/send-email', async (req, res) => {
  const testId = parseInt(req.params.id);
  const { to, subject } = req.body;
  if (!to || (Array.isArray(to) ? to.length === 0 : !to.trim())) {
    return res.status(400).json({ error: 'Recipient email(s) required' });
  }
  try {
    const result = await sendTestEmail({ testId, to, subject, triggerLabel: 'Manual' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get audit logs
app.get('/api/admin/audit-logs', adminAuth, (req, res) => {
  const { limit = 100, offset = 0, recordType, action } = req.query;
  
  let sql = 'SELECT * FROM AuditLog WHERE 1=1';
  const params = [];
  
  if (recordType) {
    sql += ' AND RecordType = ?';
    params.push(recordType);
  }
  if (action) {
    sql += ' AND Action = ?';
    params.push(action);
  }
  
  sql += ' ORDER BY Timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const logs = query(sql, params);
  const total = queryOne('SELECT COUNT(*) as count FROM AuditLog')?.count || 0;
  
  res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// Client-side error reporting (no auth â€” browser errors before login)
app.post('/api/log-client-error', (req, res) => {
  const { message, source, lineno, colno, stack, url: pageUrl, userAgent } = req.body || {};
  logger.client({ message, source, lineno, colno, stack, pageUrl, userAgent, ip: req.ip });
  res.json({ ok: true });
});

// Get logs (error or app log, with level filter)
app.get('/api/admin/error-logs', adminAuth, (req, res) => {
  const { date, level, type = 'error' } = req.query;
  const logDate = date || new Date().toISOString().split('T')[0];
  const prefix = type === 'app' ? 'app' : type === 'access' ? 'access' : 'error';
  const logPath = join(__dirname, 'logs', `${prefix}-${logDate}.log`);

  try {
    if (!existsSync(logPath)) {
      return res.json({ date: logDate, logs: [], total: 0 });
    }
    const content = readFileSync(logPath, 'utf-8');
    let lines = content.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return { raw: l, level: 'UNKNOWN', timestamp: null }; }
    });
    if (level) lines = lines.filter(l => l.level === level.toUpperCase());
    lines.reverse();
    // Summary counts
    const counts = lines.reduce((acc, l) => {
      acc[l.level] = (acc[l.level] || 0) + 1;
      return acc;
    }, {});
    res.json({ date: logDate, logs: lines.slice(0, 500), total: lines.length, counts });
  } catch (err) {
    logger.error('Failed to read logs', { error: err.message });
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// List available log dates
app.get('/api/admin/log-dates', adminAuth, (req, res) => {
  try {
    const LOG_DIR = join(__dirname, 'logs');
    const files = existsSync(LOG_DIR) ? readdirSync(LOG_DIR) : [];
    const dates = new Set();
    for (const f of files) {
      const m = f.match(/(\d{4}-\d{2}-\d{2})\.log$/);
      if (m) dates.add(m[1]);
    }
    res.json([...dates].sort().reverse());
  } catch { res.json([]); }
});

// Database statistics
app.get('/api/admin/stats', adminAuth, (req, res) => {
  const categories = getEmployerCategories();
  const stats = {
    tests: queryOne('SELECT COUNT(*) as count FROM AODTest')?.count || 0,
    persons: queryOne('SELECT COUNT(*) as count FROM Person')?.count || 0,
    employers: queryOne('SELECT COUNT(*) as count FROM Employer')?.count || 0,
    employeeEmployers: queryOne(`SELECT COUNT(*) as count FROM Employer WHERE Category = ?`, [categories[0]])?.count || 0,
    contractorEmployers: queryOne(`SELECT COUNT(*) as count FROM Employer WHERE Category = ?`, [categories[1]])?.count || 0,
    pendingTests: queryOne("SELECT COUNT(*) as count FROM AODTest WHERE TestStatus = 'Pending Lab'")?.count || 0,
    attachments: queryOne('SELECT COUNT(*) as count FROM Attachment')?.count || 0,
    auditLogs: queryOne('SELECT COUNT(*) as count FROM AuditLog')?.count || 0,
    patientEvents: queryOne('SELECT COUNT(*) as count FROM PatientEvent')?.count || 0
  };
  res.json(stats);
});

// ============================================
// SPA FALLBACK (must be before error handler)
// ============================================
if (SERVE_FRONTEND) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(join(FRONTEND_DIST_PATH, 'index.html'));
  });
}

// ============================================
// DNA / ATTENDANCE RECORDS
// ============================================

app.get('/api/attendance', (req, res) => {
  const { dateFrom, dateTo, personId } = req.query;
  let sql = `
    SELECT a.*, p.FullName as PersonName, p.BadgeNumber, p.EmployeeNumber,
           e.CompanyName as EmployerName, tt.Name as TestTypeName
    FROM AttendanceRecord a
    LEFT JOIN Person p ON a.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON a.TestTypeID = tt.TestTypeID
    WHERE 1=1
  `;
  const params = [];
  if (dateFrom)  { sql += ' AND a.ScheduledDate >= ?'; params.push(dateFrom); }
  if (dateTo)    { sql += ' AND a.ScheduledDate <= ?'; params.push(dateTo); }
  if (personId)  { sql += ' AND a.PersonID = ?';       params.push(personId); }
  sql += ' ORDER BY a.RecordedAt DESC, a.ScheduledDate DESC';
  try { res.json(query(sql, params)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/attendance', (req, res) => {
  const { personId, personName, scheduledDate, scheduledTime, reasonCategory, reason,
          testTypeId, randomEntryId, notes, followUpRequired } = req.body;
  if (!scheduledDate) return res.status(400).json({ error: 'scheduledDate required' });
  try {
    const now = new Date().toISOString();
    const r = run(`
      INSERT INTO AttendanceRecord
        (PersonID, ScheduledDate, ScheduledTime, ReasonCategory, Reason, TestTypeID,
         RandomEntryID, Notes, FollowUpRequired, Status, RecordedAt, CreatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [personId || null, scheduledDate, scheduledTime || null, reasonCategory || null,
        reason || null, testTypeId || null, randomEntryId || null, notes || null,
        followUpRequired ? 1 : 0, 'Did Not Attend', now, now]);

    // If linked to a random entry, mark that entry as DNA
    if (randomEntryId) {
      run(`UPDATE RandomTestEntry SET Status='DNA', StatusNote=?, StatusUpdatedAt=? WHERE EntryID=?`,
        [reason || 'Did not attend', now, randomEntryId]);
    }
    // If linked to a scheduled test, mark it DNA
    const schedId = req.body.scheduleId;
    if (schedId) {
      run(`UPDATE ScheduledTest SET Status='DNA', Notes=? WHERE ScheduleID=?`, [reason || 'DNA', schedId]);
    }
    logAudit(null, 'CREATE', 'AttendanceRecord', r.lastInsertRowid,
      `DNA recorded for ${personName || personId} on ${scheduledDate}`);
    res.json({ id: r.lastInsertRowid, message: 'DNA recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/attendance/:id', (req, res) => {
  const { reasonCategory, reason, notes, followUpRequired, followUpNotes, status } = req.body;
  try {
    run(`UPDATE AttendanceRecord SET ReasonCategory=?,Reason=?,Notes=?,
         FollowUpRequired=?,FollowUpNotes=?,Status=? WHERE AttendanceID=?`,
      [reasonCategory || null, reason || null, notes || null,
       followUpRequired ? 1 : 0, followUpNotes || null, status || 'Did Not Attend', req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/attendance/:id', (req, res) => {
  try { run('DELETE FROM AttendanceRecord WHERE AttendanceID=?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// PENDING MEDICALS
// ============================================

app.get('/api/pending-medicals', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT m.*, p.FullName as PersonName2, p.BadgeNumber, e.CompanyName as EmployerName
    FROM PendingMedical m
    LEFT JOIN Person p ON m.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND m.Status = ?'; params.push(status); }
  sql += ' ORDER BY m.DueDate ASC, m.Priority DESC';
  try { res.json(query(sql, params)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pending-medicals', (req, res) => {
  const { personId, personName, medicalType, dueDate, scheduledDate, priority, notes } = req.body;
  if (!medicalType) return res.status(400).json({ error: 'medicalType required' });
  try {
    const r = run(`INSERT INTO PendingMedical (PersonID,PersonName,MedicalType,DueDate,ScheduledDate,Priority,Notes)
                   VALUES (?,?,?,?,?,?,?)`,
      [personId || null, personName || null, medicalType, dueDate || null,
       scheduledDate || null, priority || 'Normal', notes || null]);
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/pending-medicals/:id', (req, res) => {
  const { medicalType, dueDate, scheduledDate, priority, notes, status, completedDate } = req.body;
  try {
    run(`UPDATE PendingMedical SET MedicalType=?,DueDate=?,ScheduledDate=?,Priority=?,Notes=?,
         Status=?,CompletedDate=? WHERE MedicalID=?`,
      [medicalType, dueDate || null, scheduledDate || null, priority || 'Normal',
       notes || null, status || 'Pending', completedDate || null, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/pending-medicals/:id', (req, res) => {
  try { run('DELETE FROM PendingMedical WHERE MedicalID=?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// REVIEWS CALENDAR (Review Appointments)
// ============================================

// Get appointments by date range
app.get('/api/review-appointments', (req, res) => {
  const { dateFrom, dateTo, status, personId } = req.query;
  let sql = `
    SELECT ra.*, 
           COALESCE(p.FullName, ra.PatientName) as FullName,
           p.BadgeNumber, p.EmployeeNumber,
           e.CompanyName as EmployerName, e.EmployerID
    FROM ReviewAppointment ra
    LEFT JOIN Person p ON ra.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE 1=1
  `;
  const params = [];
  
  if (dateFrom) { sql += ' AND ra.AppointmentDate >= ?'; params.push(dateFrom); }
  if (dateTo) { sql += ' AND ra.AppointmentDate <= ?'; params.push(dateTo); }
  if (status) { sql += ' AND ra.Status = ?'; params.push(status); }
  else { sql += " AND ra.Status != 'Cancelled'"; }
  if (personId) { sql += ' AND ra.PersonID = ?'; params.push(personId); }
  
  sql += ' ORDER BY ra.AppointmentDate, ra.TimeSlot, COALESCE(p.FullName, ra.PatientName)';
  
  try { res.json(query(sql, params)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Get upcoming reviews for dashboard (next 7 days by default)
app.get('/api/review-appointments/upcoming', (req, res) => {
  const { days = 7, date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + parseInt(days));
  
  try {
    const appointments = query(`
      SELECT ra.*, 
             COALESCE(p.FullName, ra.PatientName) as FullName,
             p.BadgeNumber, p.EmployeeNumber,
             e.CompanyName as EmployerName, e.EmployerID
      FROM ReviewAppointment ra
      LEFT JOIN Person p ON ra.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE ra.AppointmentDate >= ? AND ra.AppointmentDate <= ?
        AND ra.Status = 'Scheduled'
      ORDER BY ra.AppointmentDate, ra.TimeSlot, p.FullName
    `, [targetDate, endDate.toISOString().split('T')[0]]);
    res.json(appointments);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single appointment
app.get('/api/review-appointments/:id', (req, res) => {
  const apt = queryOne(`
    SELECT ra.*, 
           COALESCE(p.FullName, ra.PatientName) as FullName,
           p.BadgeNumber, p.EmployeeNumber,
           e.CompanyName as EmployerName
    FROM ReviewAppointment ra
    LEFT JOIN Person p ON ra.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    WHERE ra.AppointmentID = ?
  `, [req.params.id]);
  if (!apt) return res.status(404).json({ error: 'Appointment not found' });
  res.json(apt);
});

// Create new appointment
app.post('/api/review-appointments', (req, res) => {
  const { personId, patientName, appointmentDate, timeSlot, comment, showCommentOnDashboard, status } = req.body;
  if (!appointmentDate) {
    return res.status(400).json({ error: 'appointmentDate is required' });
  }
  if (!personId && !patientName) {
    return res.status(400).json({ error: 'Either personId or patientName is required' });
  }
  try {
    const r = run(`INSERT INTO ReviewAppointment 
      (PersonID, PatientName, AppointmentDate, TimeSlot, Comment, ShowCommentOnDashboard, Status, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [personId || null, patientName || null, appointmentDate, timeSlot || null, comment || null, 
       showCommentOnDashboard !== false ? 1 : 0, status || 'Scheduled']);
    res.json({ id: r.lastInsertRowid, message: 'Appointment created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update appointment
app.put('/api/review-appointments/:id', (req, res) => {
  const { personId, patientName, appointmentDate, timeSlot, comment, showCommentOnDashboard, status } = req.body;
  try {
    run(`UPDATE ReviewAppointment SET
      PersonID = COALESCE(?, PersonID),
      PatientName = COALESCE(?, PatientName),
      AppointmentDate = COALESCE(?, AppointmentDate),
      TimeSlot = ?,
      Comment = ?,
      ShowCommentOnDashboard = ?,
      Status = COALESCE(?, Status),
      UpdatedAt = CURRENT_TIMESTAMP
      WHERE AppointmentID = ?`,
      [personId, patientName, appointmentDate, timeSlot || null, comment || null, 
       showCommentOnDashboard !== false ? 1 : 0, status, req.params.id]);
    res.json({ message: 'Appointment updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete appointment
app.delete('/api/review-appointments/:id', (req, res) => {
  try {
    run('DELETE FROM ReviewAppointment WHERE AppointmentID = ?', [req.params.id]);
    res.json({ message: 'Appointment deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// SCHEDULE MATCH â€” find pending scheduled tests AND imported entries for a person / test type / employer / date
// ============================================

app.get('/api/schedule/match', (req, res) => {
  try {
    const { personId, donorName, testTypeId, employerId, testDate } = req.query;
    if (!donorName && !personId && !testDate) return res.json({ scheduledMatch: null, importedMatch: null });

    const results = { scheduledMatch: null, importedMatch: null, hasMatch: false };

    // Build flexible name patterns if donorName provided
    const namePatterns = donorName ? buildNameSearchPatterns(donorName) : null;

    // 1. Check ScheduledTest table (manual scheduled tests)
    let schedSql = `
      SELECT st.*, p.FullName as PersonName, p.BadgeNumber,
             e.CompanyName as EmployerName, tt.Name as TestTypeName,
             'ScheduledTest' as SourceType
      FROM ScheduledTest st
      LEFT JOIN Person p ON st.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON st.TestTypeID = tt.TestTypeID
      WHERE st.Status IN ('Scheduled','Pending')
    `;
    const schedParams = [];

    if (personId) {
      schedSql += ' AND st.PersonID = ?';
      schedParams.push(parseInt(personId));
    } else if (donorName && namePatterns) {
      const nameSearch = buildNameSearchSQL('p.FullName', namePatterns);
      schedSql += ` AND ${nameSearch.sql}`;
      schedParams.push(...nameSearch.params);
    }

    if (testTypeId) { schedSql += ' AND st.TestTypeID = ?'; schedParams.push(parseInt(testTypeId)); }
    if (employerId) { schedSql += ' AND p.EmployerID = ?'; schedParams.push(parseInt(employerId)); }
    if (testDate) { schedSql += ' AND st.ScheduledDate = ?'; schedParams.push(testDate); }

    schedSql += ' ORDER BY st.ScheduledDate DESC LIMIT 1';
    const schedMatch = queryOne(schedSql, schedParams);
    if (schedMatch) {
      results.scheduledMatch = schedMatch;
      results.hasMatch = true;
    }

    // 2. Check RandomTestEntry table (imported PDF entries)
    let importSql = `
      SELECT e.*, l.ListDate, l.Shift, l.TestTypeID as ListTestTypeID, tt.Name as TestTypeName,
             p.FullName as MatchedPersonName, p.BadgeNumber as MatchedBadge,
             emp.CompanyName as MatchedEmployerName,
             'RandomTestEntry' as SourceType, e.EntryID as ScheduleID
      FROM RandomTestEntry e
      JOIN RandomTestList l ON e.ListID = l.ListID
      LEFT JOIN TestType tt ON l.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
      LEFT JOIN Employer emp ON e.MatchedEmployerID = emp.EmployerID
      WHERE e.Status IN ('Pending','Scheduled')
    `;
    const importParams = [];

    if (personId) {
      importSql += ' AND e.MatchedPersonID = ?';
      importParams.push(parseInt(personId));
    } else if (donorName && namePatterns) {
      // Use flexible search on all name fields
      const employeeNameSearch = buildNameSearchSQL('e.EmployeeName', namePatterns);
      const displayNameSearch = buildNameSearchSQL('e.DisplayName', namePatterns);
      const personNameSearch = buildNameSearchSQL('p.FullName', namePatterns);
      importSql += ` AND (${employeeNameSearch.sql} OR ${displayNameSearch.sql} OR ${personNameSearch.sql})`;
      importParams.push(...employeeNameSearch.params, ...displayNameSearch.params, ...personNameSearch.params);
    }

    if (testTypeId) {
      importSql += ' AND (l.TestTypeID = ? OR e.ListTestTypeID = ?)';
      importParams.push(parseInt(testTypeId), parseInt(testTypeId));
    }
    if (employerId) {
      importSql += ' AND (e.MatchedEmployerID = ? OR p.EmployerID = ?)';
      importParams.push(parseInt(employerId), parseInt(employerId));
    }
    if (testDate) {
      importSql += ' AND l.ListDate = ?';
      importParams.push(testDate);
    }

    importSql += ' ORDER BY l.ListDate DESC LIMIT 1';
    const importMatch = queryOne(importSql, importParams);
    if (importMatch) {
      results.importedMatch = importMatch;
      results.hasMatch = true;
    }

    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// MANUAL SCHEDULED TEST CREATION
// ============================================

app.post('/api/schedule', (req, res) => {
  const { personId, scheduledDate, scheduledTime, testTypeId, notes } = req.body;
  if (!personId || !scheduledDate) return res.status(400).json({ error: 'personId and scheduledDate required' });
  try {
    const testNumber = generateTestNumber();
    const r = run(`INSERT INTO ScheduledTest (PersonID, ScheduledDate, ScheduledTime, TestTypeID, Notes, Status, TestNumber)
                   VALUES (?,?,?,?,?,'Scheduled',?)`,
      [personId, scheduledDate, scheduledTime || null, testTypeId || null, notes || null, testNumber]);
    res.json({ id: r.lastInsertRowid, testNumber, message: 'Scheduled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// PERSON SIMPLE CSV IMPORT (Name + Employer + optional DOB)
// ============================================

app.post('/api/persons/import/simple', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });

  const employers = query('SELECT EmployerID, CompanyName FROM Employer');

  let created = 0, updated = 0, skipped = 0;
  const errors = [];
  const warnings = [];

  rows.forEach((row, idx) => {
    // Accept Name or FullName column
    const fullName = (row.Name || row.FullName || row['Full Name'] || '').trim();
    if (!fullName) { errors.push({ row: idx + 1, error: 'Missing Name' }); skipped++; return; }

    // Accept DOB, DateOfBirth, or Date of Birth column
    const dob = (row.DOB || row.DateOfBirth || row['Date of Birth'] || '').trim() || null;

    // Accept Employer or Company column
    const employerRaw = (row.Employer || row.Company || row['Employer Name'] || '').trim();
    let employerId = null;
    if (employerRaw) {
      const match = employers.find(e => e.CompanyName?.toLowerCase() === employerRaw.toLowerCase());
      if (match) {
        employerId = match.EmployerID;
      } else {
        // Employer not found â€” create it and add to local list
        try {
          const r = run('INSERT INTO Employer (CompanyName, IsActive) VALUES (?, 1)', [employerRaw]);
          employerId = r.lastInsertRowid;
          employers.push({ EmployerID: employerId, CompanyName: employerRaw });
          warnings.push({ row: idx + 1, name: fullName, warning: `New employer created: "${employerRaw}"` });
        } catch (e) {
          errors.push({ row: idx + 1, name: fullName, error: `Failed to create employer "${employerRaw}": ${e.message}` });
          skipped++; return;
        }
      }
    }

    // Deduplication: name+DOB â†’ name alone
    let existing = null;
    if (dob) existing = queryOne('SELECT PersonID, FullName FROM Person WHERE LOWER(FullName)=LOWER(?) AND DateOfBirth=?', [fullName, dob]);
    if (!existing) existing = queryOne('SELECT PersonID, FullName FROM Person WHERE LOWER(FullName)=LOWER(?)', [fullName]);

    try {
      if (existing) {
        // Only update employer/DOB if provided
        const sets = ['UpdatedAt=CURRENT_TIMESTAMP'];
        const params = [];
        if (employerId !== null) { sets.push('EmployerID=?'); params.push(employerId); }
        if (dob)                 { sets.push('DateOfBirth=?'); params.push(dob); }
        params.push(existing.PersonID);
        run(`UPDATE Person SET ${sets.join(', ')} WHERE PersonID=?`, params);
        updated++;
      } else {
        run('INSERT INTO Person (FullName, DateOfBirth, EmployerID, IsActive) VALUES (?, ?, ?, 1)',
          [fullName, dob, employerId]);
        created++;
      }
    } catch (e) {
      errors.push({ row: idx + 1, name: fullName, error: e.message });
      skipped++;
    }
  });

  logAudit(null, 'IMPORT', 'Person', null, `Simple CSV import: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, errors, warnings, total: rows.length });
});

// ============================================
// EMPLOYERS CSV IMPORT / EXPORT
// ============================================

app.get('/api/employers/export/csv', (req, res) => {
  try {
    const rows = query(`SELECT CompanyName, Category, ContactName, ContactEmail, ContactPhone, Address FROM Employer WHERE MergedIntoEmployerID IS NULL ORDER BY CompanyName`);
    const headers = ['CompanyName','Category','ContactName','ContactEmail','ContactPhone','Address'];
    const esc = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s; };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h] ?? '')).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="employers.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employers/import/csv', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });
  let created = 0, updated = 0, skipped = 0;
  const errors = [];
  rows.forEach((row, idx) => {
    const name = (row.CompanyName || row.Name || '').trim();
    if (!name) { errors.push({ row: idx+1, error: 'Missing CompanyName' }); skipped++; return; }
    const existing = queryOne('SELECT EmployerID FROM Employer WHERE LOWER(CompanyName)=LOWER(?)', [name]);
    try {
      if (existing) {
        run(`UPDATE Employer SET Category=COALESCE(?,Category), ContactName=COALESCE(?,ContactName),
             ContactEmail=COALESCE(?,ContactEmail), ContactPhone=COALESCE(?,ContactPhone),
             Address=COALESCE(?,Address) WHERE EmployerID=?`,
          [row.Category||null, row.ContactName||null, row.ContactEmail||null, row.ContactPhone||null, row.Address||null, existing.EmployerID]);
        updated++;
      } else {
        run(`INSERT INTO Employer (CompanyName,Category,ContactName,ContactEmail,ContactPhone,Address,IsActive) VALUES (?,?,?,?,?,?,1)`,
          [name, row.Category||null, row.ContactName||null, row.ContactEmail||null, row.ContactPhone||null, row.Address||null]);
        created++;
      }
    } catch(e) { errors.push({ row: idx+1, name, error: e.message }); skipped++; }
  });
  logAudit(null,'IMPORT','Employer',null,`CSV import: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, errors, total: rows.length });
});

// ============================================
// CLINICIANS CSV IMPORT (User-table backed)
// ============================================

app.post('/api/clinicians/import/csv', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });
  let created = 0, updated = 0, skipped = 0;
  const errors = [];
  const userRoleId = queryOne(`SELECT RoleID FROM Role WHERE LOWER(Name) = 'user'`)?.RoleID || 2;
  const dummyHash = bcrypt.hashSync('changeme1', 10);
  rows.forEach((row, idx) => {
    const name = (row.Name || '').trim();
    if (!name) { errors.push({ row: idx+1, error: 'Missing Name' }); skipped++; return; }
    const parts = name.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';
    try {
      const existing = queryOne(`SELECT UserID FROM User WHERE IsClinician=1 AND LOWER(FullName)=LOWER(?)`, [name]);
      if (existing) {
        run(`UPDATE User SET Credentials=COALESCE(?,Credentials), Email=COALESCE(?,Email),
             UniqueID=COALESCE(?,UniqueID) WHERE UserID=?`,
          [row.Credentials||null, row.Email||null, row.EmployeeNumber||null, existing.UserID]);
        updated++;
      } else {
        const baseUser = `${firstName.charAt(0).toLowerCase()}${lastName.replace(/\s+/g,'').toLowerCase()}` || 'clinician';
        let username = baseUser; let suffix = 1;
        while (queryOne('SELECT 1 FROM User WHERE Username=?', [username])) username = `${baseUser}${suffix++}`;
        run(`INSERT INTO User (Username,PasswordHash,FullName,FirstName,LastName,Email,UniqueID,RoleID,IsClinician,Credentials,IsActive)
             VALUES (?,?,?,?,?,?,?,?,1,?,1)`,
          [username, dummyHash, name, firstName, lastName,
           row.Email||null, row.EmployeeNumber||null, userRoleId, row.Credentials||null]);
        created++;
      }
    } catch(e) { errors.push({ row: idx+1, name, error: e.message }); skipped++; }
  });
  logAudit(null,'IMPORT','Clinician',null,`CSV import: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, errors, total: rows.length });
});

// ============================================
// TRAINING UNITS CSV IMPORT / EXPORT
// ============================================

app.get('/api/training-units/export/csv', (req, res) => {
  try {
    const rows = query(`SELECT Code, Name, TrainingPackage, Category FROM TrainingUnit WHERE IsActive=1 ORDER BY TrainingPackage, Name`);
    const headers = ['Code','Name','TrainingPackage','Category'];
    const esc = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s; };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h] ?? '')).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="training_units.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training-units/import/csv', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });
  let created = 0, updated = 0, skipped = 0;
  const errors = [];
  rows.forEach((row, idx) => {
    const name = (row.Name || '').trim();
    const pkg  = (row.TrainingPackage || row.Package || '').trim();
    if (!name || !pkg) { errors.push({ row: idx+1, error: 'Missing Name or TrainingPackage' }); skipped++; return; }
    const existing = queryOne('SELECT TrainingUnitID FROM TrainingUnit WHERE LOWER(Name)=LOWER(?) AND TrainingPackage=?', [name, pkg]);
    try {
      if (existing) {
        run(`UPDATE TrainingUnit SET Code=COALESCE(?,Code), Category=COALESCE(?,Category) WHERE TrainingUnitID=?`,
          [row.Code||null, row.Category||null, existing.TrainingUnitID]);
        updated++;
      } else {
        run(`INSERT INTO TrainingUnit (Code,Name,TrainingPackage,Category,IsActive) VALUES (?,?,?,?,1)`,
          [row.Code||null, name, pkg, row.Category||null]);
        created++;
      }
    } catch(e) { errors.push({ row: idx+1, name, error: e.message }); skipped++; }
  });
  logAudit(null,'IMPORT','TrainingUnit',null,`CSV import: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, errors, total: rows.length });
});

// ============================================
// GLOBAL PATIENT SEARCH
// ============================================

app.get('/api/patient-search', (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ persons: [], tests: [], events: [] });
  const s = `%${q.trim()}%`;
  try {
    const persons = query(`
      SELECT p.PersonID, p.FullName, p.BadgeNumber, p.DateOfBirth,
             e.CompanyName as EmployerName, wt.Name as WorkerTypeName,
             COUNT(t.TestID) as TestCount
      FROM Person p
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
      LEFT JOIN AODTest t ON t.PersonID = p.PersonID
      WHERE p.FullName LIKE ? OR p.BadgeNumber LIKE ? OR p.EmployeeNumber LIKE ?
      GROUP BY p.PersonID
      ORDER BY p.FullName LIMIT 30`, [s, s, s]);

    const tests = query(`
      SELECT t.TestID, t.TestNumber, t.TestDate, t.TestTime,
             p.FullName as PersonName,
             p.PersonID, p.BadgeNumber,
             e.CompanyName as EmployerName,
             tt.Name as TestTypeName, tt.Code as TestTypeCode,
             t.IsPending
      FROM AODTest t
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.TestNumber LIKE ? OR p.FullName LIKE ? OR p.BadgeNumber LIKE ?
      ORDER BY t.TestDate DESC LIMIT 20`, [s, s, s]);

    const events = query(`
      SELECT pe.EventID, pe.EventDate, pe.InjuryType as EventType, pe.InjuryType, pe.WrNwr,
             pe.Comment, pe.Referral,
             COALESCE(p.FullName, pe.PatientName) as PersonName,
             p.PersonID, e.CompanyName as EmployerName
      FROM PatientEvent pe
      LEFT JOIN Person p ON pe.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE p.FullName LIKE ? OR pe.PersonName LIKE ? OR p.BadgeNumber LIKE ?
      ORDER BY pe.EventDate DESC LIMIT 20`, [s, s, s]);

    res.json({ persons, tests, events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// PERSON CSV IMPORT / EXPORT
// ============================================

app.get('/api/persons/export/csv', (req, res) => {
  try {
    const persons = query(`
      SELECT p.EmployeeNumber, p.FullName, p.BadgeNumber, p.Department, p.Position,
             e.CompanyName as Employer, wt.Name as WorkerType, s.Name as Sex,
             p.DateOfBirth, p.IsActive
      FROM Person p
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN WorkerType wt ON p.WorkerTypeID = wt.WorkerTypeID
      LEFT JOIN Sex s ON p.SexID = s.SexID
      ORDER BY p.FullName
    `);
    const headers = ['EmployeeNumber','FullName','BadgeNumber','Department','Position',
                     'Employer','WorkerType','Sex','DateOfBirth','IsActive'];
    const rows = persons.map(p => headers.map(h => {
      const v = p[h] ?? '';
      return String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : String(v);
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Disposition', `attachment; filename="persons-${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CSV import for persons (multer text upload)
app.post('/api/persons/import/csv', pdfUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + data rows' });
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const nameIdx   = headers.findIndex(h => /fullname|name/i.test(h));
    const empNumIdx = headers.findIndex(h => /employee.?number|empno/i.test(h));
    const badgeIdx  = headers.findIndex(h => /badge/i.test(h));
    if (nameIdx === -1) return res.status(400).json({ error: 'CSV must have a FullName column' });

    let created = 0, updated = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const fullName    = cols[nameIdx]   || '';
      const empNumber   = empNumIdx > -1 ? cols[empNumIdx] || null : null;
      const badgeNumber = badgeIdx  > -1 ? cols[badgeIdx]  || null : null;
      if (!fullName) { skipped++; continue; }

      const existing = empNumber
        ? queryOne('SELECT PersonID FROM Person WHERE EmployeeNumber=?', [empNumber])
        : queryOne('SELECT PersonID FROM Person WHERE FullName=? AND IsActive=1', [fullName]);

      if (existing) {
        run('UPDATE Person SET FullName=?, BadgeNumber=COALESCE(?,BadgeNumber) WHERE PersonID=?',
          [fullName, badgeNumber, existing.PersonID]);
        updated++;
      } else {
        run('INSERT INTO Person (FullName, EmployeeNumber, BadgeNumber, IsActive) VALUES (?,?,?,1)',
          [fullName, empNumber, badgeNumber]);
        created++;
      }
    }
    res.json({ message: 'Import complete', created, updated, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// RANDOM LIST GENERATION (from system persons)
// ============================================

app.post('/api/random-lists/generate', (req, res) => {
  const { listDate, shift, count, employerId, workerTypeId, notes } = req.body;
  if (!listDate || !shift) return res.status(400).json({ error: 'listDate and shift required' });
  const n = Math.max(1, parseInt(count) || 10);
  try {
    let sql = `SELECT p.PersonID, p.FullName, p.EmployeeNumber, p.BadgeNumber,
                      p.Department, p.Position, e.CompanyName
               FROM Person p
               LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
               WHERE p.IsActive = 1`;
    const params = [];
    if (employerId)   { sql += ' AND p.EmployerID = ?';   params.push(employerId); }
    if (workerTypeId) { sql += ' AND p.WorkerTypeID = ?'; params.push(workerTypeId); }
    const pool = query(sql, params);
    if (!pool.length) return res.status(400).json({ error: 'No eligible persons found' });

    // Fisher-Yates shuffle then take n
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(n, shuffled.length));

    const listResult = run(`INSERT INTO RandomTestList (ListDate, Shift, Notes, ImportedBy) VALUES (?,?,?,?)`,
      [listDate, shift, notes || `System-generated random selection (${n})`, null]);
    const listId = listResult.lastInsertRowid;

    for (const p of selected) {
      run(`INSERT INTO RandomTestEntry (ListID, EmployeeNumber, EmployeeName, Department, Position, MatchedPersonID, Status)
           VALUES (?,?,?,?,?,?,'Pending')`,
        [listId, p.EmployeeNumber || '', p.FullName, p.Department || '', p.Position || '', p.PersonID]);
    }

    const entries = query(`SELECT * FROM RandomTestEntry WHERE ListID=?`, [listId]);
    res.json({ listId, count: selected.length, entries });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate random list from uploaded CSV of names
app.post('/api/random-lists/from-csv', pdfUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { listDate, shift, count, notes } = req.body;
  if (!listDate || !shift) return res.status(400).json({ error: 'listDate and shift required' });
  try {
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + data rows' });
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const nameIdx   = headers.findIndex(h => /fullname|name/i.test(h));
    const empNumIdx = headers.findIndex(h => /employee.?number|empno/i.test(h));
    const deptIdx   = headers.findIndex(h => /department|dept/i.test(h));
    const posIdx    = headers.findIndex(h => /position|role/i.test(h));
    if (nameIdx === -1) return res.status(400).json({ error: 'CSV must have a Name or FullName column' });

    const all = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const name = cols[nameIdx] || '';
      if (!name) continue;
      all.push({
        name,
        empNum: empNumIdx > -1 ? cols[empNumIdx] || '' : '',
        dept:   deptIdx   > -1 ? cols[deptIdx]   || '' : '',
        pos:    posIdx    > -1 ? cols[posIdx]     || '' : '',
      });
    }

    // Random selection from the CSV pool
    const n = count ? Math.min(parseInt(count), all.length) : all.length;
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, n);

    const listResult = run(`INSERT INTO RandomTestList (ListDate, Shift, Notes) VALUES (?,?,?)`,
      [listDate, shift, notes || `CSV import (${all.length} names, ${n} selected)`]);
    const listId = listResult.lastInsertRowid;

    for (const p of selected) {
      // Try to match to existing person
      const match = p.empNum
        ? queryOne('SELECT PersonID FROM Person WHERE EmployeeNumber=?', [p.empNum])
        : queryOne('SELECT PersonID FROM Person WHERE FullName=? AND IsActive=1', [p.name]);
      run(`INSERT INTO RandomTestEntry (ListID, EmployeeNumber, EmployeeName, Department, Position, MatchedPersonID, Status)
           VALUES (?,?,?,?,?,?,'Pending')`,
        [listId, p.empNum, p.name, p.dept, p.pos, match?.PersonID || null]);
    }

    const entries = query(`SELECT * FROM RandomTestEntry WHERE ListID=?`, [listId]);
    res.json({ listId, totalInFile: all.length, selected: n, entries });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export random list as Excel
app.get('/api/random-lists/:listId/export/excel', (req, res) => {
  try {
    const list = queryOne('SELECT * FROM RandomTestList WHERE ListID=?', [req.params.listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });
    const entries = query(`
      SELECT e.EmployeeNumber, e.EmployeeName, e.Department, e.Position,
             e.Status, p.BadgeNumber, p.FullName as MatchedName
      FROM RandomTestEntry e
      LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
      WHERE e.ListID=? ORDER BY e.EmployeeName
    `, [req.params.listId]);

    const wb = XLSX.utils.book_new();
    const infoWs = XLSX.utils.aoa_to_sheet([
      ['Random Test List'],
      ['Date', list.ListDate],
      ['Shift', list.Shift],
      ['Notes', list.Notes || ''],
      ['Generated', new Date().toLocaleString('en-AU')],
      [],
    ]);
    XLSX.utils.book_append_sheet(wb, infoWs, 'Info');

    const headers = ['#', 'Employee #', 'Name', 'Department', 'Position', 'Badge', 'Status', 'Signature'];
    const rows = entries.map((e, i) => [
      i + 1, e.EmployeeNumber || '', e.EmployeeName || e.MatchedName || '',
      e.Department || '', e.Position || '', e.BadgeNumber || '',
      e.Status || 'Pending', ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [4,12,22,18,16,10,10,16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Random List');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="random-list-${list.ListDate}-${list.Shift}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export random list as print-ready HTML
app.get('/api/random-lists/:listId/export/pdf', (req, res) => {
  try {
    const list = queryOne('SELECT * FROM RandomTestList WHERE ListID=?', [req.params.listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });
    const entries = query(`
      SELECT e.EmployeeNumber, e.EmployeeName, e.Department, e.Position, e.Status, p.BadgeNumber
      FROM RandomTestEntry e
      LEFT JOIN Person p ON e.MatchedPersonID = p.PersonID
      WHERE e.ListID=? ORDER BY e.EmployeeName
    `, [req.params.listId]);

    const rows = entries.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.EmployeeNumber || ''}</td>
        <td><strong>${e.EmployeeName || ''}</strong></td>
        <td>${e.Department || ''}</td>
        <td>${e.Position || ''}</td>
        <td>${e.BadgeNumber || ''}</td>
        <td style="width:80px"></td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Random Test List</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;padding:16px}
h1{font-size:14pt;margin-bottom:4px}
.meta{font-size:9pt;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:9pt}
th{background:#1e3a5f;color:#fff;padding:5px 6px;text-align:left}
td{padding:5px 6px;border-bottom:1px solid #ddd}
tr:nth-child(even) td{background:#f9f9f9}
button{margin:8px 0;padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer}
@media print{button{display:none}}
</style></head>
<body>
<h1>Random Drug & Alcohol Test List</h1>
<div class="meta">Date: ${list.ListDate} &nbsp;|&nbsp; Shift: ${list.Shift} &nbsp;|&nbsp; ${entries.length} persons selected &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-AU')}</div>
<button onclick="window.print()">ðŸ–¨ Print / Save PDF</button>
<table>
<thead><tr><th>#</th><th>Emp #</th><th>Name</th><th>Department</th><th>Position</th><th>Badge</th><th>Signature</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add all entries from a random list to ScheduledTest (pending queue)
app.post('/api/random-lists/:listId/add-to-pending', (req, res) => {
  try {
    const list = queryOne('SELECT * FROM RandomTestList WHERE ListID=?', [req.params.listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });
    const entries = query(`SELECT * FROM RandomTestEntry WHERE ListID=? AND Status='Pending'`, [req.params.listId]);
    const randomTypeId = queryOne('SELECT TestTypeID FROM TestType WHERE Code=?', ['RND'])?.TestTypeID;
    let added = 0;
    for (const e of entries) {
      if (!e.MatchedPersonID) continue;
      run(`INSERT INTO ScheduledTest (PersonID, ScheduledDate, TestTypeID, Notes, Status)
           VALUES (?,?,?,?,'Scheduled')`,
        [e.MatchedPersonID, list.ListDate, randomTypeId, `From random list #${list.ListID} (${list.Shift} shift)`]);
      added++;
    }
    res.json({ message: `Added ${added} persons to pending queue`, added });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// REPORT TEMPLATES (saved report configs)
// ============================================

app.get('/api/report-templates', (req, res) => {
  try { res.json(query(`SELECT * FROM ReportTemplate ORDER BY CreatedAt DESC`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/report-templates', (req, res) => {
  const { name, description, reportId, config, datePreset } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = run(
      `INSERT INTO ReportTemplate (Name, Description, ReportId, Config, DatePreset) VALUES (?,?,?,?,?)`,
      [name, description || null, reportId || null, config ? JSON.stringify(config) : null, datePreset || 'month']
    );
    res.json({ id: r.lastInsertRowid, message: 'Saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/report-templates/:id', (req, res) => {
  const { name, description, reportId, config, datePreset } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    run(
      `UPDATE ReportTemplate SET Name=?,Description=?,ReportId=?,Config=?,DatePreset=? WHERE TemplateID=?`,
      [name, description || null, reportId || null, config ? JSON.stringify(config) : null, datePreset || 'month', req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/report-templates/:id', (req, res) => {
  try { run(`DELETE FROM ReportTemplate WHERE TemplateID=?`, [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// REPORT EXPORT â€” Excel (.xlsx) download
// ============================================

function reportDataToWorkbook(reportId, data, meta) {
  const wb = XLSX.utils.book_new();

  // Info sheet
  const infoWs = XLSX.utils.aoa_to_sheet([
    ['Report', reportId],
    ['Period', `${meta.startDate || ''} â†’ ${meta.endDate || ''}`],
    ['Generated', new Date().toLocaleString('en-AU')],
  ]);
  XLSX.utils.book_append_sheet(wb, infoWs, 'Info');

  function arrayToSheet(arr) {
    if (!arr || !arr.length) return XLSX.utils.aoa_to_sheet([['No data']]);
    const headers = Object.keys(arr[0]);
    const rows = arr.map(r => headers.map(h => r[h] ?? ''));
    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  }

  // Standardised { columns, rows } shape
  if (data.columns && data.rows) {
    const headers = data.columns.map(c => c.label || c.key);
    const keys    = data.columns.map(c => c.key);
    const rows    = data.rows.map(r => keys.map(k => r[k] ?? ''));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Report');
  }

  // Summary object
  if (data.summary && typeof data.summary === 'object' && !Array.isArray(data.summary)) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Value'],
      ...Object.entries(data.summary).map(([k, v]) => [k, v]),
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  // Walk any remaining array-valued keys as extra sheets
  const skip = new Set(['columns', 'rows', 'summary']);
  for (const [key, val] of Object.entries(data)) {
    if (skip.has(key)) continue;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      const sheetName = key.charAt(0).toUpperCase() + key.slice(1, 30);
      XLSX.utils.book_append_sheet(wb, arrayToSheet(val), sheetName);
    }
  }

  if (wb.SheetNames.length === 1) {
    // Only Info sheet â€” add a placeholder
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No tabular data for this report']]), 'Data');
  }
  return wb;
}

app.post('/api/reports/export/excel/:reportId', (req, res) => {
  const { reportId } = req.params;
  const { startDate, endDate, employerIds } = req.body;
  const employerFilter = employerIds?.length > 0 ? `AND p.EmployerID IN (${employerIds.join(',')})` : '';
  try {
    let data;
    switch (reportId) {
      case 'daily-activity':         data = generateDailyActivityReport(startDate, endDate, employerFilter); break;
      case 'non-negative-summary':   data = generateNonNegativeSummary(startDate, endDate, employerFilter); break;
      case 'testing-compliance':     data = generateTestingComplianceReport(startDate, endDate, employerFilter); break;
      case 'rft-register':           data = generateRFTRegister(startDate, endDate, employerFilter); break;
      case 'lab-reconciliation':     data = generateLabReconciliation(startDate, endDate, employerFilter); break;
      case 'pending-results':        data = generatePendingResultsReport(startDate, endDate, employerFilter); break;
      case 'compliance-dashboard':   data = generateComplianceDashboard(startDate, endDate, employerFilter); break;
      case 'policy-breach':          data = generatePolicyBreachRegister(startDate, endDate, employerFilter); break;
      case 'audit-trail':            data = generateAuditTrailReport(startDate, endDate, employerFilter); break;
      case 'substance-trends':       data = generateSubstanceTrends(startDate, endDate, employerFilter); break;
      case 'high-risk-segmentation': data = generateHighRiskSegmentation(startDate, endDate, employerFilter); break;
      case 'test-type-effectiveness':data = generateTestTypeEffectiveness(startDate, endDate, employerFilter); break;
      case 'daily-presentation':     data = generateDailyPresentationReport(startDate, endDate); break;
      case 'weekly-event':           data = generateWeeklyEventReport(startDate, endDate); break;
      case 'clinical-workload':      data = generateClinicalWorkloadReport(startDate, endDate); break;
      case 'data-quality':           data = generateDataQualityReport(startDate, endDate, employerFilter); break;
      case 'logic-exception':        data = generateLogicExceptionReport(startDate, endDate, employerFilter); break;
      case 'near-miss-aod':          data = generateNearMissReport(startDate, endDate, employerFilter); break;
      case 'repeat-risk':            data = generateRepeatRiskReport(startDate, endDate, employerFilter); break;
      case 'training-summary':       data = generateTrainingSummaryReport(startDate, endDate); break;
      case 'training-expiry':        data = generateTrainingExpiryReport(startDate, endDate); break;
      case 'acuity-casemix':         data = generateAcuityCasemix(startDate, endDate); break;
      case 'disposition':            data = generateDispositionReport(startDate, endDate); break;
      case 'ed-referral':            data = generateEdReferralReport(startDate, endDate); break;
      case 'wri-analysis':           data = generateWriAnalysis(startDate, endDate); break;
      case 'lost-time':              data = generateLostTimeReport(startDate, endDate); break;
      case 'nwr-hospital':           data = generateNwrHospital(startDate, endDate); break;
      case 'post-incident-linkage':  data = generatePostIncidentLinkage(startDate, endDate, employerFilter); break;
      case 'injury-aod-correlation': data = generateInjuryAodCorrelation(startDate, endDate, employerFilter); break;
      case 'eso-training':           data = generateEsoTrainingReport(startDate, endDate); break;
      case 'cpd-summary':            data = generateCpdSummaryReport(startDate, endDate); break;
      case 'workforce-cert':         data = generateWorkforceCertReport(startDate, endDate); break;
      case 'quarterly-aod':          data = generateQuarterlyAodReport(startDate, endDate, employerFilter); break;
      case 'incident-aod':           data = generateIncidentAodReport(startDate, endDate, employerFilter); break;
      default: return res.status(400).json({ error: `Unknown report: ${reportId}` });
    }
    const wb  = reportDataToWorkbook(reportId, data, { startDate, endDate });
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${reportId}-${startDate}-${endDate}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    logger.error('Excel export failed', { reportId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// REPORT EXPORT â€” PDF-ready HTML
// ============================================

function reportDataToHtml(reportId, data, meta) {
  const title = reportId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  function tableHtml(cols, rows) {
    if (!rows || !rows.length) return '<p><em>No data</em></p>';
    const headers = cols.map(c => `<th>${c.label || c.key}</th>`).join('');
    const bodyRows = rows.map(r =>
      `<tr>${cols.map(c => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`
    ).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  }

  function summaryHtml(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return '';
    const items = Object.entries(summary).map(([k, v]) =>
      `<div class="metric"><div class="mval">${v ?? 'â€”'}</div><div class="mlabel">${k}</div></div>`
    ).join('');
    return `<div class="metrics">${items}</div>`;
  }

  let body = '';
  if (data.summary) body += summaryHtml(data.summary);
  if (data.columns && data.rows) body += tableHtml(data.columns, data.rows);
  const skip = new Set(['columns', 'rows', 'summary']);
  for (const [key, val] of Object.entries(data)) {
    if (skip.has(key)) continue;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      const cols = Object.keys(val[0]).map(k => ({ key: k, label: k }));
      body += `<h3>${key}</h3>` + tableHtml(cols, val);
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11pt;color:#222;padding:20px}
h1{font-size:16pt;margin-bottom:4px}
h2{font-size:13pt;margin:16px 0 6px}
h3{font-size:11pt;margin:12px 0 4px;color:#555}
.meta{color:#666;font-size:9pt;margin-bottom:16px}
.metrics{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.metric{border:1px solid #ddd;border-radius:6px;padding:10px 16px;min-width:120px}
.mval{font-size:18pt;font-weight:bold;color:#2563eb}
.mlabel{font-size:9pt;color:#666;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10pt}
th{background:#1e3a5f;color:#fff;text-align:left;padding:6px 8px;font-size:9pt}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
tr:nth-child(even) td{background:#f9fafb}
@media print{body{padding:0}button{display:none}}
</style>
</head><body>
<h1>${title}</h1>
<div class="meta">Period: ${meta.startDate || 'â€”'} â†’ ${meta.endDate || 'â€”'} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-AU')}</div>
<button onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer">ðŸ–¨ Print / Save PDF</button>
${body || '<p>No data for this report.</p>'}
</body></html>`;
}

app.post('/api/reports/export/pdf/:reportId', (req, res) => {
  const { reportId } = req.params;
  const { startDate, endDate, employerIds } = req.body;
  const employerFilter = employerIds?.length > 0 ? `AND p.EmployerID IN (${employerIds.join(',')})` : '';
  try {
    let data;
    switch (reportId) {
      case 'daily-activity':         data = generateDailyActivityReport(startDate, endDate, employerFilter); break;
      case 'non-negative-summary':   data = generateNonNegativeSummary(startDate, endDate, employerFilter); break;
      case 'testing-compliance':     data = generateTestingComplianceReport(startDate, endDate, employerFilter); break;
      case 'rft-register':           data = generateRFTRegister(startDate, endDate, employerFilter); break;
      case 'lab-reconciliation':     data = generateLabReconciliation(startDate, endDate, employerFilter); break;
      case 'pending-results':        data = generatePendingResultsReport(startDate, endDate, employerFilter); break;
      case 'compliance-dashboard':   data = generateComplianceDashboard(startDate, endDate, employerFilter); break;
      case 'policy-breach':          data = generatePolicyBreachRegister(startDate, endDate, employerFilter); break;
      case 'audit-trail':            data = generateAuditTrailReport(startDate, endDate, employerFilter); break;
      case 'substance-trends':       data = generateSubstanceTrends(startDate, endDate, employerFilter); break;
      case 'high-risk-segmentation': data = generateHighRiskSegmentation(startDate, endDate, employerFilter); break;
      case 'test-type-effectiveness':data = generateTestTypeEffectiveness(startDate, endDate, employerFilter); break;
      case 'daily-presentation':     data = generateDailyPresentationReport(startDate, endDate); break;
      case 'weekly-event':           data = generateWeeklyEventReport(startDate, endDate); break;
      case 'clinical-workload':      data = generateClinicalWorkloadReport(startDate, endDate); break;
      case 'data-quality':           data = generateDataQualityReport(startDate, endDate, employerFilter); break;
      case 'logic-exception':        data = generateLogicExceptionReport(startDate, endDate, employerFilter); break;
      case 'near-miss-aod':          data = generateNearMissReport(startDate, endDate, employerFilter); break;
      case 'repeat-risk':            data = generateRepeatRiskReport(startDate, endDate, employerFilter); break;
      case 'training-summary':       data = generateTrainingSummaryReport(startDate, endDate); break;
      case 'training-expiry':        data = generateTrainingExpiryReport(startDate, endDate); break;
      case 'acuity-casemix':         data = generateAcuityCasemix(startDate, endDate); break;
      case 'disposition':            data = generateDispositionReport(startDate, endDate); break;
      case 'ed-referral':            data = generateEdReferralReport(startDate, endDate); break;
      case 'wri-analysis':           data = generateWriAnalysis(startDate, endDate); break;
      case 'lost-time':              data = generateLostTimeReport(startDate, endDate); break;
      case 'nwr-hospital':           data = generateNwrHospital(startDate, endDate); break;
      case 'post-incident-linkage':  data = generatePostIncidentLinkage(startDate, endDate, employerFilter); break;
      case 'injury-aod-correlation': data = generateInjuryAodCorrelation(startDate, endDate, employerFilter); break;
      case 'eso-training':           data = generateEsoTrainingReport(startDate, endDate); break;
      case 'cpd-summary':            data = generateCpdSummaryReport(startDate, endDate); break;
      case 'workforce-cert':         data = generateWorkforceCertReport(startDate, endDate); break;
      case 'quarterly-aod':          data = generateQuarterlyAodReport(startDate, endDate, employerFilter); break;
      case 'incident-aod':           data = generateIncidentAodReport(startDate, endDate, employerFilter); break;
      default: return res.status(400).json({ error: `Unknown report: ${reportId}` });
    }
    const html = reportDataToHtml(reportId, data, { startDate, endDate });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CUSTOM REPORT BUILDER
// ============================================

const ALLOWED_GROUPBY = {
  aod: {
    month:      `strftime('%Y-%m', t.TestDate)`,
    week:       `strftime('%Y-W%W', t.TestDate)`,
    testType:   `tt.Name`,
    employer:   `e.CompanyName`,
    result:     `t.OverallAODResult`,
    category:   `e.Category`,
  },
  patient: {
    month:      `strftime('%Y-%m', ev.EventDate)`,
    week:       `strftime('%Y-W%W', ev.EventDate)`,
    wrNwr:      `ev.WrNwr`,
    classification:`ev.Classification`,
    referral:   `ev.Referral`,
    bodyLocation:`ev.BodyLocation`,
    injuryType: `ev.InjuryType`,
  },
  training: {
    month:      `strftime('%Y-%m', tr.TrainingDate)`,
    trainingType:`tr.TrainingType`,
    trainer:    `t.Name`,
  },
};

app.post('/api/reports/custom', (req, res) => {
  const { dataset, groupBy, startDate, endDate, employerIds } = req.body;
  if (!dataset || !['aod', 'patient', 'training'].includes(dataset))
    return res.status(400).json({ error: 'Invalid dataset. Use: aod | patient | training' });

  const allowed = ALLOWED_GROUPBY[dataset] || {};
  const dims = (Array.isArray(groupBy) ? groupBy : [groupBy]).filter(g => allowed[g]);
  if (!dims.length) return res.status(400).json({ error: `No valid groupBy for ${dataset}` });

  const empFilter = employerIds?.length > 0 ? employerIds.map(Number).filter(Boolean) : null;

  try {
    let rows;
    const dimExprs = dims.map(d => allowed[d]);
    const dimLabels = dims;
    const selectDims = dimExprs.map((e, i) => `${e} as "${dimLabels[i]}"`).join(', ');
    const groupByClause = dimExprs.join(', ');

    if (dataset === 'aod') {
      const empWhere = empFilter ? `AND p.EmployerID IN (${empFilter.join(',')})` : '';
      rows = query(`
        SELECT ${selectDims},
               COUNT(*) as Total,
               SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1 ELSE 0 END) as NonNegative,
               SUM(CASE WHEN t.BACFinalValue > 0 THEN 1 ELSE 0 END) as AlcoholPositive,
               SUM(CASE WHEN t.OralResult = 'Refused' THEN 1 ELSE 0 END) as Refusals,
               SUM(CASE WHEN t.IsPending = 1 THEN 1 ELSE 0 END) as PendingLab,
               ROUND(SUM(CASE WHEN t.OralResult = 'Non-Negative' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as NonNegRate
        FROM AODTest t
        JOIN Person p ON t.PersonID = p.PersonID
        LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
        LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
        WHERE t.TestDate BETWEEN ? AND ? ${empWhere}
        GROUP BY ${groupByClause}
        ORDER BY ${groupByClause}
      `, [startDate, endDate]);

    } else if (dataset === 'patient') {
      rows = query(`
        SELECT ${selectDims},
               COUNT(*) as Total,
               SUM(CASE WHEN ev.WrNwr IN ('WR','WR Review') THEN 1 ELSE 0 END) as WR,
               SUM(CASE WHEN ev.WrNwr IN ('NWR','NWR Review','Camp','Camp Review') THEN 1 ELSE 0 END) as NWR,
               SUM(CASE WHEN ev.Referral LIKE '%ED%' THEN 1 ELSE 0 END) as EDReferrals,
               SUM(CASE WHEN ev.DrConsult = 1 THEN 1 ELSE 0 END) as DrConsults
        FROM PatientEvent ev
        WHERE ev.EventDate BETWEEN ? AND ?
        GROUP BY ${groupByClause}
        ORDER BY ${groupByClause}
      `, [startDate, endDate]);

    } else {
      rows = query(`
        SELECT ${selectDims},
               COUNT(*) as Total,
               ROUND(SUM(tr.Hours), 1) as TotalHours,
               SUM(CASE WHEN tr.Passed = 1 THEN 1 ELSE 0 END) as Passed
        FROM TrainingRecord tr
        LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
        WHERE tr.TrainingDate BETWEEN ? AND ?
        GROUP BY ${groupByClause}
        ORDER BY ${groupByClause}
      `, [startDate, endDate]);
    }

    const colKeys = rows.length > 0 ? Object.keys(rows[0]) : [...dimLabels, 'Total'];
    const columns = colKeys.map(k => ({ key: k, label: k, type: typeof rows[0]?.[k] === 'number' ? 'number' : 'string' }));
    res.json({ columns, rows, rowCount: rows.length, dataset, groupBy: dims, period: { startDate, endDate } });
  } catch (err) {
    logger.error('Custom report failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DRILL-DOWN â€” raw records behind an aggregate
// ============================================

app.post('/api/reports/drilldown', (req, res) => {
  const { reportId, field, value, startDate, endDate, employerIds } = req.body;
    const _expandedForExcel = employerIds?.length > 0 ? expandEmployerIds(employerIds) : employerIds;
  const employerFilter = _expandedForExcel?.length > 0 
    ? `AND p.EmployerID IN (${_expandedForExcel.join(',')})` 
    : '';
  
  try {
    let rows;
    if (reportId === 'daily-activity' || reportId === 'non-negative-summary' ||
        reportId === 'rft-register' || reportId === 'repeat-risk' || reportId === 'near-miss-aod') {
      // AOD test drill-down
      const extra = value !== '__all__' && field
        ? `AND (t.TestDate = ? OR tt.Name = ? OR e.CompanyName = ? OR t.OralResult = ?)` : '';
      const extraParams = value !== '__all__' && field ? [value, value, value, value] : [];
      rows = query(`
        SELECT t.TestID, t.TestNumber, t.TestDate, p.FullName, e.CompanyName,
               tt.Name as TestType, t.OralResult, t.BACFinalValue,
               t.OverallAODResult, t.TestStatus, t.IsNonNegative, t.IsPending
        FROM AODTest t
        JOIN Person p ON t.PersonID = p.PersonID
        LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
        LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
        WHERE t.TestDate BETWEEN ? AND ? ${employerFilter} ${extra}
        ORDER BY t.TestDate DESC LIMIT 500
      `, [startDate, endDate, ...extraParams]);
    } else if (reportId === 'daily-presentation' || reportId === 'weekly-event' || reportId === 'wri-analysis') {
      rows = query(`
        SELECT ev.EventID, ev.EventDate, ev.EventTime, ev.PatientName,
               ev.WrNwr, ev.Classification, ev.BodyLocation, ev.InjuryType,
               ev.Referral, ev.Comment
        FROM PatientEvent ev
        WHERE ev.EventDate BETWEEN ? AND ?
        ORDER BY ev.EventDate DESC LIMIT 500
      `, [startDate, endDate]);
    } else {
      rows = [];
    }
    const columns = rows.length > 0
      ? Object.keys(rows[0]).map(k => ({ key: k, label: k }))
      : [];
    res.json({ columns, rows, rowCount: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Training-specific report generators (new)
function generateTrainingSummaryReport(startDate, endDate) {
  const summary = query(`
    SELECT tr.TrainingType, COUNT(*) as Sessions, ROUND(SUM(tr.Hours),1) as TotalHours,
           COUNT(DISTINCT ta.TrainerID) as UniqueAttendees
    FROM TrainingRecord tr
    LEFT JOIN TrainingAttendee ta ON tr.TrainingID = ta.TrainingID
    WHERE tr.TrainingDate BETWEEN ? AND ?
    GROUP BY tr.TrainingType ORDER BY Sessions DESC
  `, [startDate, endDate]);
  const totals = query(`
    SELECT COUNT(*) as TotalSessions, ROUND(SUM(Hours),1) as TotalHours
    FROM TrainingRecord WHERE TrainingDate BETWEEN ? AND ?
  `, [startDate, endDate])[0] || {};
  return {
    summary: { totalSessions: totals.TotalSessions || 0, totalHours: totals.TotalHours || 0 },
    columns: [
      { key: 'TrainingType', label: 'Training Type' },
      { key: 'Sessions', label: 'Sessions', type: 'number' },
      { key: 'TotalHours', label: 'Total Hours', type: 'number' },
      { key: 'UniqueAttendees', label: 'Attendees', type: 'number' },
    ],
    rows: summary,
  };
}

function generateTrainingExpiryReport(startDate, endDate) {
  const expiring = query(`
    SELECT tr.TrainingType, tr.TrainingDate, tr.ExpiryDate, tr.Notes,
           t.Name as TrainerName,
           CAST(julianday(tr.ExpiryDate) - julianday('now') AS INTEGER) as DaysUntilExpiry
    FROM TrainingRecord tr
    LEFT JOIN Trainer t ON tr.TrainerID = t.TrainerID
    WHERE tr.ExpiryDate IS NOT NULL AND tr.ExpiryDate BETWEEN date('now','-30 days') AND date('now','+90 days')
    ORDER BY tr.ExpiryDate ASC
  `, []);
  return {
    columns: [
      { key: 'TrainingType', label: 'Training Type' },
      { key: 'TrainerName', label: 'Trainer' },
      { key: 'TrainingDate', label: 'Completed', type: 'date' },
      { key: 'ExpiryDate', label: 'Expires', type: 'date' },
      { key: 'DaysUntilExpiry', label: 'Days Until Expiry', type: 'number' },
    ],
    rows: expiring,
  };
}

// ============================================
// DOCUMENT LIBRARY
// ============================================

const DOCS_LIBRARY_DIR = join(__dirname, 'uploads', 'documents');
if (!existsSync(DOCS_LIBRARY_DIR)) mkdirSync(DOCS_LIBRARY_DIR, { recursive: true });

const docLibStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_LIBRARY_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
});
const docLibUpload = multer({
  storage: docLibStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// GET /api/documents â€” list all active documents
app.get('/api/documents', (req, res) => {
  try {
    const { category } = req.query;
    let sql = `SELECT DocumentID, Title, Description, Category, FileName, MimeType, FileSize, UploadedAt, UploadedBy FROM Document WHERE IsActive = 1`;
    const params = [];
    if (category) { sql += ` AND Category = ?`; params.push(category); }
    sql += ` ORDER BY Category, Title COLLATE NOCASE`;
    res.json(query(sql, params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/documents/categories â€” distinct category list
app.get('/api/documents/categories', (req, res) => {
  try {
    const rows = query(`SELECT DISTINCT Category FROM Document WHERE IsActive = 1 ORDER BY Category`);
    res.json(rows.map(r => r.Category));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/documents/:id/file â€” stream the file inline (open in browser)
app.get('/api/documents/:id/file', (req, res) => {
  try {
    const doc = queryOne(`SELECT * FROM Document WHERE DocumentID = ? AND IsActive = 1`, [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = join(DOCS_LIBRARY_DIR, doc.FilePath);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.setHeader('Content-Type', doc.MimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.FileName)}"`);
    createReadStream(filePath).pipe(res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/documents/:id/download â€” force download
app.get('/api/documents/:id/download', (req, res) => {
  try {
    const doc = queryOne(`SELECT * FROM Document WHERE DocumentID = ? AND IsActive = 1`, [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = join(DOCS_LIBRARY_DIR, doc.FilePath);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, doc.FileName);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/documents â€” upload a new document (admin)
app.post('/api/documents', docLibUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { title, description, category } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const result = run(
      `INSERT INTO Document (Title, Description, Category, FilePath, FileName, MimeType, FileSize, UploadedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description || null, category || 'General',
       req.file.filename, req.file.originalname,
       req.file.mimetype, req.file.size, null]
    );
    logAudit(null, 'CREATE', 'Document', result.lastInsertRowid, `Uploaded: ${title}`);
    res.json({ id: result.lastInsertRowid, message: 'Document uploaded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/documents/:id â€” update metadata (admin)
app.put('/api/documents/:id', (req, res) => {
  try {
    const doc = queryOne(`SELECT * FROM Document WHERE DocumentID = ?`, [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { title, description, category } = req.body;
    run(`UPDATE Document SET Title=?, Description=?, Category=?, IsActive=1 WHERE DocumentID=?`,
      [title ?? doc.Title, description ?? doc.Description, category ?? doc.Category, req.params.id]);
    logAudit(null, 'UPDATE', 'Document', req.params.id, `Updated metadata`);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/documents/:id â€” soft delete (admin)
app.delete('/api/documents/:id', (req, res) => {
  try {
    const doc = queryOne(`SELECT * FROM Document WHERE DocumentID = ?`, [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    run(`UPDATE Document SET IsActive = 0 WHERE DocumentID = ?`, [req.params.id]);
    // Also remove from disk
    try {
      const fp = join(DOCS_LIBRARY_DIR, doc.FilePath);
      if (existsSync(fp)) unlinkSync(fp);
    } catch (_) { /* ignore fs errors */ }
    logAudit(null, 'DELETE', 'Document', req.params.id, `Deleted: ${doc.Title}`);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// COMPLIANCE CHECKS
// ============================================

ensureColumn('ComplianceCheck', 'FormUrl', 'FormUrl TEXT');

// GET /api/checks â€” list all checks with computed status
app.get('/api/checks', (req, res) => {
  try {
    const checks = query(`SELECT * FROM ComplianceCheck ORDER BY IsActive DESC, Name`);
    const today = new Date().toISOString().split('T')[0];
    const result = checks.map(c => {
      const last = queryOne(
        `SELECT CompletedDate, CompletedBy FROM CheckCompletion
         WHERE CheckID = ? ORDER BY CompletedDate DESC, CompletionID DESC LIMIT 1`,
        [c.CheckID]
      );
      let status = 'never';
      let daysSinceLast = null;
      let dueDate = null;
      if (last) {
        const diff = Math.floor(
          (new Date(today) - new Date(last.CompletedDate)) / 86400000
        );
        daysSinceLast = diff;
        dueDate = new Date(
          new Date(last.CompletedDate).getTime() + c.FrequencyDays * 86400000
        ).toISOString().split('T')[0];
        if (diff > c.FrequencyDays)           status = 'overdue';
        else if (diff > c.FrequencyDays * 0.75) status = 'due-soon';
        else                                    status = 'ok';
      }
      return { ...c, lastCompletion: last || null, daysSinceLast, dueDate, status };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/checks â€” create check
app.post('/api/checks', (req, res) => {
  const { name, description, frequencyDays, formUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const freq = parseInt(frequencyDays, 10);
  if (!freq || freq < 1) return res.status(400).json({ error: 'frequencyDays must be a positive integer' });
  try {
    const r = run(
      `INSERT INTO ComplianceCheck (Name, Description, FrequencyDays, FormUrl) VALUES (?, ?, ?, ?)`,
      [name.trim(), description || null, freq, formUrl?.trim() || null]
    );
    res.json({ id: r.lastInsertRowid, message: 'Created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/checks/:id â€” update check
app.put('/api/checks/:id', (req, res) => {
  const { name, description, frequencyDays, isActive, formUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const freq = parseInt(frequencyDays, 10);
  if (!freq || freq < 1) return res.status(400).json({ error: 'frequencyDays must be a positive integer' });
  try {
    run(
      `UPDATE ComplianceCheck SET Name=?, Description=?, FrequencyDays=?, IsActive=?, FormUrl=? WHERE CheckID=?`,
      [name.trim(), description || null, freq, isActive ? 1 : 0, formUrl?.trim() || null, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/checks/:id
app.delete('/api/checks/:id', (req, res) => {
  try {
    run(`DELETE FROM CheckCompletion WHERE CheckID=?`, [req.params.id]);
    run(`DELETE FROM ComplianceCheck WHERE CheckID=?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/checks/:id/completions â€” completion history
app.get('/api/checks/:id/completions', (req, res) => {
  try {
    res.json(query(
      `SELECT * FROM CheckCompletion WHERE CheckID=? ORDER BY CompletedDate DESC, CompletionID DESC`,
      [req.params.id]
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/checks/:id/completions â€” record a completion
app.post('/api/checks/:id/completions', (req, res) => {
  const { completedDate, completedBy, notes } = req.body;
  if (!completedDate) return res.status(400).json({ error: 'completedDate required' });
  if (!completedBy || !String(completedBy).trim())
    return res.status(400).json({ error: 'completedBy required' });
  try {
    const r = run(
      `INSERT INTO CheckCompletion (CheckID, CompletedDate, CompletedBy, Notes) VALUES (?, ?, ?, ?)`,
      [req.params.id, completedDate, String(completedBy).trim(), notes || null]
    );
    res.json({ id: r.lastInsertRowid, message: 'Completion recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/checks/:id/completions/:cid
app.delete('/api/checks/:id/completions/:cid', (req, res) => {
  try {
    run(`DELETE FROM CheckCompletion WHERE CompletionID=? AND CheckID=?`,
        [req.params.cid, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// PATIENT EVENT REPORTS â€” Deep Drilldown
// ============================================

// 1. Patient_WR_Location â€” Work-Related injuries by body location
app.get('/api/reports/patient-wr-location', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT BodyLocation, COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
        AND BodyLocation IS NOT NULL AND BodyLocation != ''
      GROUP BY BodyLocation
      ORDER BY Count DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Patient_WR_Location',
      filters: { WrNwr: 'WR or WR Review', startDate, endDate },
      grouping: 'BODY LOCATION',
      total: total?.Total || 0,
      columns: [
        { key: 'BodyLocation', label: 'Body Location' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Patient_WR_Type â€” Work-Related injuries by type
app.get('/api/reports/patient-wr-type', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT InjuryType, COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
        AND InjuryType IS NOT NULL AND InjuryType != ''
      GROUP BY InjuryType
      ORDER BY Count DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Patient_WR_Type',
      filters: { WrNwr: 'WR or WR Review', startDate, endDate },
      grouping: 'INJURY TYPE',
      total: total?.Total || 0,
      columns: [
        { key: 'InjuryType', label: 'Injury Type' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Patient_WR_Class â€” Work vs Non-Work split (top-line KPI)
app.get('/api/reports/patient-wr-class', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT WrNwr, COUNT(*) as Count
      FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
        AND WrNwr IS NOT NULL AND WrNwr != ''
      GROUP BY WrNwr
      ORDER BY 
        CASE WrNwr
          WHEN 'WR' THEN 1
          WHEN 'WR Review' THEN 2
          WHEN 'NWR' THEN 3
          WHEN 'NWR Review' THEN 4
          WHEN 'Camp' THEN 5
          WHEN 'Camp Review' THEN 6
          ELSE 7
        END
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Patient_WR_Class',
      filters: { startDate, endDate },
      grouping: 'WR/NWR',
      total: total?.Total || 0,
      columns: [
        { key: 'WrNwr', label: 'WR/NWR Classification' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Patient_NWR_Class â€” Refined NWR classification (Hospital, Review, NWR)
app.get('/api/reports/patient-nwr-class', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT 
        CASE 
          WHEN Referral LIKE '%ED%' OR Referral LIKE '%Emergency%' THEN 'NWR Hospital'
          WHEN WrNwr = 'NWR Review' AND (Referral NOT LIKE '%ED%' OR Referral IS NULL) THEN 'NWR Review'
          WHEN WrNwr = 'NWR' AND (Referral NOT LIKE '%ED%' OR Referral IS NULL) THEN 'NWR'
          ELSE 'NWR Other'
        END as NWRClass,
        COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr LIKE 'NWR%' OR WrNwr LIKE 'Camp%')
        AND EventDate BETWEEN ? AND ?
      GROUP BY NWRClass
      ORDER BY 
        CASE NWRClass
          WHEN 'NWR Hospital' THEN 1
          WHEN 'NWR Review' THEN 2
          WHEN 'NWR' THEN 3
          ELSE 4
        END
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr LIKE 'NWR%' OR WrNwr LIKE 'Camp%')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Patient_NWR_Class',
      filters: { WrNwr: 'NWR or Camp (starts with NWR)', startDate, endDate },
      grouping: 'NWRClass (derived)',
      derivedLogic: {
        'NWR Hospital': 'Referral contains "ED"',
        'NWR Review': 'WR/NWR = NWR Review AND NOT ED',
        'NWR': 'WR/NWR = NWR AND NOT ED'
      },
      total: total?.Total || 0,
      columns: [
        { key: 'NWRClass', label: 'NWR Classification' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. WR_Injury_Outcome â€” Return To Work outcomes
app.get('/api/reports/wr-injury-outcome', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT 
        COALESCE(NULLIF(RtwPlan, ''), 'Unknown / Not Specified') as Outcome,
        COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
      GROUP BY RtwPlan
      ORDER BY Count DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'WR_Injury_Outcome',
      filters: { WrNwr: 'WR or WR Review', startDate, endDate },
      grouping: 'Outcome (based on RTW Plan)',
      total: total?.Total || 0,
      columns: [
        { key: 'Outcome', label: 'RTW Outcome' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// AOD REPORTS
// ============================================

// 6. AOD_Weekly_Summary â€” Weekly count of AOD tests by type
app.get('/api/reports/aod-weekly-summary', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const results = query(`
      SELECT 
        COALESCE(tt.Name, 'Unknown') as TestType,
        COUNT(*) as TestCount
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.TestDate BETWEEN ? AND ?
      GROUP BY tt.Name
      ORDER BY TestCount DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const total = queryOne(`
      SELECT COUNT(*) as Total FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'AOD_Weekly_Summary',
      filters: { startDate, endDate },
      grouping: 'Type of test',
      total: total?.Total || 0,
      note: 'Count of tests (not outcomes). Includes Oral tests, Urine-only cases, and Refusals.',
      columns: [
        { key: 'TestType', label: 'Test Type' },
        { key: 'TestCount', label: 'Test Count', type: 'number' }
      ],
      rows: results
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. AOD_NonNegative â€” Non-negative AOD results
app.get('/api/reports/aod-nonnegative', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Count based on multiple non-negative indicators
    const totalTests = queryOne(`
      SELECT COUNT(*) as Total FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const nonNegativeCount = queryOne(`
      SELECT COUNT(*) as NonNegativeCount FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
        AND (
          OralResult = 'Non-Negative'
          OR UrineResult = 'Non-Negative'
          OR FinalDrugOutcome = 'Non-Negative'
          OR FinalBACOutcome = 'Positive'
          OR OverallAODResult = 'Non-Negative'
          OR OverrideDrugResult IS NOT NULL
          OR OverrideBACResult IS NOT NULL
          OR IsNonNegative = 1
        )
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    // Breakdown by type
    const breakdown = query(`
      SELECT 
        CASE 
          WHEN OralResult = 'Non-Negative' THEN 'Oral Non-Negative'
          WHEN UrineResult = 'Non-Negative' THEN 'Urine Non-Negative'
          WHEN FinalBACOutcome = 'Positive' THEN 'BAC Positive'
          WHEN OverrideDrugResult IS NOT NULL OR OverrideBACResult IS NOT NULL THEN 'Override Applied'
          ELSE 'Other'
        END as NonNegativeType,
        COUNT(*) as Count
      FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
        AND (
          OralResult = 'Non-Negative'
          OR UrineResult = 'Non-Negative'
          OR FinalDrugOutcome = 'Non-Negative'
          OR FinalBACOutcome = 'Positive'
          OR OverallAODResult = 'Non-Negative'
          OR OverrideDrugResult IS NOT NULL
          OR OverrideBACResult IS NOT NULL
          OR IsNonNegative = 1
        )
      GROUP BY NonNegativeType
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'AOD_NonNegative',
      filters: { startDate, endDate },
      note: 'Critical KPI: Safety risk indicator and compliance metric. Respects override logic, RFT workflow, pending vs confirmed.',
      total: totalTests?.Total || 0,
      nonNegativeCount: nonNegativeCount?.NonNegativeCount || 0,
      columns: [
        { key: 'NonNegativeType', label: 'Type' },
        { key: 'Count', label: 'Count', type: 'number' }
      ],
      rows: breakdown
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. Summary Inputs â€” Headline numbers for front-page reporting
app.get('/api/reports/summary-inputs', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const totalTreatments = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const activeClinicians = queryOne(`
      SELECT COUNT(DISTINCT ClinicianID) as Count FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
        AND ClinicianID IS NOT NULL
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const totalAODTests = queryOne(`
      SELECT COUNT(*) as Total FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const wrCount = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const nwrCount = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE (WrNwr LIKE 'NWR%' OR WrNwr LIKE 'Camp%')
        AND EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Data_Summary_Inputs',
      filters: { startDate, endDate },
      headlineNumbers: {
        totalTreatments: totalTreatments?.Total || 0,
        activeClinicians: activeClinicians?.Count || 0,
        totalAODTests: totalAODTests?.Total || 0,
        wrInjuries: wrCount?.Total || 0,
        nwrCases: nwrCount?.Total || 0
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. Site Weekly Event Report â€” Final presentation layer
app.get('/api/reports/site-weekly-event', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Compile all data into one comprehensive report
    const wrByLocation = query(`
      SELECT BodyLocation, COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
        AND BodyLocation IS NOT NULL
      GROUP BY BodyLocation ORDER BY Count DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const wrByType = query(`
      SELECT InjuryType, COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
        AND InjuryType IS NOT NULL
      GROUP BY InjuryType ORDER BY Count DESC
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const wrClass = query(`
      SELECT WrNwr, COUNT(*) as Count
      FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
      GROUP BY WrNwr
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const rtwOutcomes = query(`
      SELECT COALESCE(NULLIF(RtwPlan, ''), 'Not Specified') as Outcome, COUNT(*) as Count
      FROM PatientEvent
      WHERE (WrNwr = 'WR' OR WrNwr = 'WR Review')
        AND EventDate BETWEEN ? AND ?
      GROUP BY RtwPlan
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const aodSummary = query(`
      SELECT COALESCE(tt.Name, 'Unknown') as TestType, COUNT(*) as Count
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.TestDate BETWEEN ? AND ?
      GROUP BY tt.Name
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const nonNegCount = queryOne(`
      SELECT COUNT(*) as Count FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
        AND (OralResult = 'Non-Negative' OR UrineResult = 'Non-Negative' 
             OR FinalDrugOutcome = 'Non-Negative' OR FinalBACOutcome = 'Positive'
             OR IsNonNegative = 1)
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const totalTreatments = queryOne(`
      SELECT COUNT(*) as Total FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ?
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    const activeClinicians = queryOne(`
      SELECT COUNT(DISTINCT ClinicianID) as Count FROM PatientEvent
      WHERE EventDate BETWEEN ? AND ? AND ClinicianID IS NOT NULL
    `, [startDate || '1970-01-01', endDate || '9999-12-31']);
    
    res.json({
      report: 'Site_Weekly_Event_Report',
      period: { startDate, endDate },
      executiveSummary: {
        totalTreatments: totalTreatments?.Total || 0,
        activeClinicians: activeClinicians?.Count || 0,
        wrInjuries: wrClass.filter(r => r.WrNwr === 'WR' || r.WrNwr === 'WR Review').reduce((a, b) => a + b.Count, 0),
        nwrCases: wrClass.filter(r => r.WrNwr?.startsWith('NWR') || r.WrNwr?.startsWith('Camp')).reduce((a, b) => a + b.Count, 0),
        aodTests: aodSummary.reduce((a, b) => a + b.Count, 0),
        aodNonNegative: nonNegCount?.Count || 0
      },
      sections: {
        wrByLocation: { title: 'WR Injuries by Body Location', rows: wrByLocation },
        wrByType: { title: 'WR Injuries by Type', rows: wrByType },
        wrClass: { title: 'Work vs Non-Work Classification', rows: wrClass },
        rtwOutcomes: { title: 'Return to Work Outcomes', rows: rtwOutcomes },
        aodSummary: { title: 'AOD Tests by Type', rows: aodSummary }
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// AOD QUARTERLY CONTRACTORS REPORT â€” SCJV Format
// ============================================

// Helper to determine SCJV Test Category
function defineSCJVCategory(testTypeCode, testTypeName) {
  const code = (testTypeCode || '').toUpperCase();
  const name = (testTypeName || '').toLowerCase();
  if (code.includes('RND') || name.includes('random')) return 'Random';
  if (code.includes('CAU') || name.includes('cause') || name.includes('for cause')) return 'For Cause';
  if (code.includes('PRE') || name.includes('pre-employment') || name.includes('pre employment')) return 'Pre-Employment';
  if (code.includes('POST') || name.includes('post-incident') || name.includes('post incident')) return 'Post Incident';
  if (code.includes('RTW') || name.includes('return to work') || name.includes('rtw')) return 'RTW';
  if (code.includes('ANN') || name.includes('annual')) return 'Annual';
  return 'Other';
}

// 1. AOD Quarterly Summary â€” Aggregated KPI-style output
app.get('/api/reports/aod-quarterly-summary', (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    // Calculate quarter date range
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    // Get all tests in quarter with derived fields
    const tests = query(`
      SELECT 
        t.*,
        tt.Code as TestTypeCode,
        tt.Name as TestTypeName,
        p.FullName as PersonName,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contract,
        c.Name as TesterName,
        CASE 
          WHEN t.OralResult = 'Negative' THEN 1 
          ELSE 0 
        END as _IsOral_Negative,
        CASE 
          WHEN t.OralResult = 'Non-Negative' 
            OR t.UrineResult = 'Non-Negative' 
            OR t.FinalDrugOutcome = 'Non-Negative'
            OR t.OverrideDrugResult IS NOT NULL
          THEN 1 ELSE 0 
        END as _IsDrug_NonNegative,
        CASE 
          WHEN t.IsPending = 1 OR t.TestStatus = 'Pending' THEN 1 
          ELSE 0 
        END as _IsPending,
        CASE 
          WHEN t.BACResult = 'Positive' 
            OR t.FinalBACOutcome = 'Positive'
            OR (t.BACFinalValue > 0 OR t.BACInitialValue > 0)
            OR t.OverrideBACResult IS NOT NULL
          THEN 1 ELSE 0 
        END as _IsBAC_Positive,
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          WHEN tt.Code LIKE '%PRE%' OR tt.Name LIKE '%Pre-Employment%' THEN 'Pre-Employment'
          WHEN tt.Code LIKE '%POST%' OR tt.Name LIKE '%Post-Incident%' THEN 'Post Incident'
          WHEN tt.Code LIKE '%RTW%' OR tt.Name LIKE '%RTW%' THEN 'RTW'
          ELSE 'Other'
        END as SCJV_Test_Category
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
      WHERE t.TestDate BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    // Aggregate by SCJV Test Category
    const categories = {};
    tests.forEach(t => {
      const cat = t.SCJV_Test_Category || 'Other';
      if (!categories[cat]) {
        categories[cat] = {
          SCJV_Test_Category: cat,
          Drug_Total: 0,
          Drug_Negative: 0,
          Drug_Positive: 0,
          Drug_Pending: 0,
          Alcohol_Total: 0,
          Alcohol_Negative: 0,
          Alcohol_Positive: 0,
          Other_Pending: 0
        };
      }
      
      // Drug stats
      categories[cat].Drug_Total++;
      if (t._IsDrug_NonNegative) categories[cat].Drug_Positive++;
      else if (t._IsPending) categories[cat].Drug_Pending++;
      else categories[cat].Drug_Negative++;
      
      // Alcohol stats
      if (t.BACUndertaken || t.BACInitialValue > 0 || t.BACFinalValue > 0) {
        categories[cat].Alcohol_Total++;
        if (t._IsBAC_Positive) categories[cat].Alcohol_Positive++;
        else categories[cat].Alcohol_Negative++;
      }
    });
    
    // Summary table
    const summaryRows = Object.values(categories).map(c => ({
      SCJV_Test_Category: c.SCJV_Test_Category,
      Total_Tests: c.Drug_Total,
      Negative_Tests: c.Drug_Negative,
      Drug_NonNegative: c.Drug_Positive,
      BAC_NonNegative: c.Alcohol_Positive,
      Pending_Results: c.Drug_Pending
    }));
    
    // Unique employees by category
    const uniqueEmployees = query(`
      SELECT 
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          WHEN tt.Code LIKE '%PRE%' OR tt.Name LIKE '%Pre-Employment%' THEN 'Pre-Employment'
          WHEN tt.Code LIKE '%POST%' OR tt.Name LIKE '%Post-Incident%' THEN 'Post Incident'
          WHEN tt.Code LIKE '%RTW%' OR tt.Name LIKE '%RTW%' THEN 'RTW'
          ELSE 'Other'
        END as SCJV_Test_Category,
        COUNT(DISTINCT t.PersonID) as Unique_Employees
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      WHERE t.TestDate BETWEEN ? AND ?
      GROUP BY SCJV_Test_Category
    `, [startDate, endDate]);
    
    // Total tests
    const totals = queryOne(`
      SELECT 
        COUNT(*) as Total_Tests,
        COUNT(DISTINCT PersonID) as Total_Unique_Employees
      FROM AODTest
      WHERE TestDate BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    res.json({
      report: 'AOD_Quarterly_Summary',
      period: { year, quarter, startDate, endDate },
      summary: summaryRows,
      uniqueEmployees: uniqueEmployees,
      totals: {
        totalTests: totals?.Total_Tests || 0,
        totalUniqueEmployees: totals?.Total_Unique_Employees || 0
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. AOD Quarterly Detail â€” Full dataset with all fields
app.get('/api/reports/aod-quarterly-detail', (req, res) => {
  try {
    const { year, quarter, scjvCategory } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    let sql = `
      SELECT 
        t.TestDate as Date,
        t.TestTime as Time,
        p.FullName as Name,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contract,
        tt.Name as Type_of_test,
        t.OralResult as Oral_result,
        COALESCE(t.BACFinalValue, t.BACInitialValue) as BAC,
        c.Name as Tester_Name,
        t.UrineUndertaken as Urine_Undertaken,
        t.UrineResult as Urine_Result,
        t.SampleSentToLab as Sample_Sent_to_Lab,
        t.ConfirmatoryResult as Confirmatory_result,
        t.Notes,
        t.BACFinalValue as Second_BAC,
        t.FinalBACOutcome as BAC_outcome_Note,
        t.OverrideBACResult as Overwrite_BAC_Result,
        t.OverrideDrugResult as Overwrite_Drug_Result,
        t.PersonID as EmployeeKey,
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          WHEN tt.Code LIKE '%PRE%' OR tt.Name LIKE '%Pre-Employment%' THEN 'Pre-Employment'
          WHEN tt.Code LIKE '%POST%' OR tt.Name LIKE '%Post-Incident%' THEN 'Post Incident'
          WHEN tt.Code LIKE '%RTW%' OR tt.Name LIKE '%RTW%' THEN 'RTW'
          ELSE 'Other'
        END as SCJV_Test_Category,
        ? as Quater_Filter,
        t.OralResult as _OralText,
        t.ConfirmatoryResult as _ConfText,
        t.BACFinalValue as _SecondBAC_Num,
        CASE 
          WHEN t.OralResult = 'Non-Negative' OR t.UrineResult = 'Non-Negative' OR t.FinalDrugOutcome = 'Non-Negative' THEN 'NonNegative'
          WHEN t.OralResult = 'Negative' THEN 'Negative'
          WHEN t.IsPending = 1 THEN 'Pending'
          ELSE 'Other'
        END as _Drug_Status,
        CASE WHEN t.OralResult = 'Negative' THEN 1 ELSE 0 END as _IsOral_Negative,
        CASE WHEN t.OralResult = 'Non-Negative' OR t.UrineResult = 'Non-Negative' OR t.FinalDrugOutcome = 'Non-Negative' THEN 1 ELSE 0 END as _IsDrug_NonNegative,
        CASE WHEN t.IsPending = 1 THEN 1 ELSE 0 END as _IsPending,
        CASE WHEN t.BACResult = 'Positive' OR t.FinalBACOutcome = 'Positive' OR t.BACFinalValue > 0 OR t.BACInitialValue > 0 THEN 1 ELSE 0 END as _IsBAC_Positive
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
      WHERE t.TestDate BETWEEN ? AND ?
    `;
    const params = [`Q${quarter} ${year}`, startDate, endDate];
    
    if (scjvCategory) {
      sql += ` AND (
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          WHEN tt.Code LIKE '%PRE%' OR tt.Name LIKE '%Pre-Employment%' THEN 'Pre-Employment'
          WHEN tt.Code LIKE '%POST%' OR tt.Name LIKE '%Post-Incident%' THEN 'Post Incident'
          WHEN tt.Code LIKE '%RTW%' OR tt.Name LIKE '%RTW%' THEN 'RTW'
          ELSE 'Other'
        END = ?
      )`;
      params.push(scjvCategory);
    }
    
    sql += ` ORDER BY t.TestDate DESC, t.TestTime DESC`;
    
    const rows = query(sql, params);
    
    res.json({
      report: 'AOD_Quarterly_Detail',
      period: { year, quarter, startDate, endDate },
      filter: scjvCategory || 'All Categories',
      columns: [
        'Date', 'Time', 'Name', 'DOB', 'Gender', 'Company', 'Contract', 'Type_of_test',
        'Oral_result', 'BAC', 'Tester_Name', 'Urine_Undertaken', 'Urine_Result',
        'Sample_Sent_to_Lab', 'Confirmatory_result', 'Notes', 'Second_BAC',
        'BAC_outcome_Note', 'Overwrite_BAC_Result', 'Overwrite_Drug_Result',
        'EmployeeKey', 'SCJV_Test_Category', 'Quater_Filter', '_OralText', '_ConfText',
        '_SecondBAC_Num', '_Drug_Status', '_IsOral_Negative', '_IsDrug_NonNegative',
        '_IsPending', '_IsBAC_Positive'
      ],
      rowCount: rows.length,
      rows: rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. AOD Positive BAC Report â€” Detailed positive alcohol cases
app.get('/api/reports/aod-quarterly-positive-bac', (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    const rows = query(`
      SELECT 
        t.TestDate as Date,
        t.TestTime as Time,
        p.FullName as Name,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contract,
        tt.Name as Type_of_test,
        t.OralResult as Oral_result,
        COALESCE(t.BACFinalValue, t.BACInitialValue) as BAC,
        t.BACFinalValue as Second_BAC,
        t.UrineUndertaken as Urine_Undertaken,
        t.UrineResult as Urine_Result,
        t.SampleSentToLab as Sample_Sent_to_Lab,
        t.ConfirmatoryResult as Confirmatory_result,
        t.Notes,
        c.Name as Tester_Name,
        t.FinalBACOutcome as BAC_outcome_Note,
        t.OverrideBACResult as Overwrite_BAC_Result,
        t.OverrideDrugResult as Overwrite_Drug_Result,
        t.PersonID as EmployeeKey,
        ? as Quater_Filter,
        t.BACFinalValue as _SecondBAC_Num,
        1 as _IsBAC_Positive,
        CASE WHEN t.IsPending = 1 THEN 1 ELSE 0 END as _IsPending,
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          ELSE 'Other'
        END as SCJV_Test_Category
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
      WHERE t.TestDate BETWEEN ? AND ?
        AND (
          t.BACResult = 'Positive' 
          OR t.FinalBACOutcome = 'Positive'
          OR t.BACFinalValue > 0 
          OR t.BACInitialValue > 0
          OR t.OverrideBACResult IS NOT NULL
        )
      ORDER BY t.TestDate DESC
    `, [`Q${quarter} ${year}`, startDate, endDate]);
    
    res.json({
      report: 'AOD_Quarterly_POS_BAC',
      period: { year, quarter, startDate, endDate },
      description: 'Detailed positive alcohol cases',
      rowCount: rows.length,
      rows: rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. AOD For Cause / Exception Report
app.get('/api/reports/aod-quarterly-for-cause', (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    const rows = query(`
      SELECT 
        t.TestDate as Date,
        t.TestTime as Time,
        p.FullName as Name,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contractor,
        tt.Name as Type_of_test,
        t.OralResult as Oral_result,
        COALESCE(t.BACFinalValue, t.BACInitialValue) as BAC,
        c.Name as Tester_Name,
        t.UrineUndertaken as Urine_Undertaken,
        t.UrineResult as Urine_Result,
        t.SampleSentToLab as Sample_Sent_to_Lab,
        t.ConfirmatoryResult as Confirmatory_result,
        t.Notes,
        t.BACFinalValue as Second_BAC,
        t.FinalBACOutcome as BAC_outcome_Note,
        t.OverrideBACResult as Overwrite_BAC_Result,
        t.OverrideDrugResult as Overwrite_Drug_Result
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
      WHERE t.TestDate BETWEEN ? AND ?
        AND (tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' OR tt.Name LIKE '%For Cause%')
      ORDER BY t.TestDate DESC
    `, [startDate, endDate]);
    
    res.json({
      report: 'AOD_For_Cause_Exception',
      period: { year, quarter, startDate, endDate },
      description: 'For Cause and Exception reports',
      rowCount: rows.length,
      rows: rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. AOD Pending & Other Report
app.get('/api/reports/aod-quarterly-pending', (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    const rows = query(`
      SELECT 
        CASE 
          WHEN tt.Code LIKE '%RND%' OR tt.Name LIKE '%Random%' THEN 'Random'
          WHEN tt.Code LIKE '%CAU%' OR tt.Name LIKE '%Cause%' THEN 'For Cause'
          WHEN tt.Code LIKE '%PRE%' OR tt.Name LIKE '%Pre-Employment%' THEN 'Pre-Employment'
          WHEN tt.Code LIKE '%POST%' OR tt.Name LIKE '%Post-Incident%' THEN 'Post Incident'
          WHEN tt.Code LIKE '%RTW%' OR tt.Name LIKE '%RTW%' THEN 'RTW'
          ELSE 'Other'
        END as SCJV_Test_Category,
        t.TestDate as Date,
        t.TestTime as Time,
        p.FullName as Name,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contract,
        t.OralResult as Oral_result,
        t.UrineUndertaken as Urine_Undertaken,
        t.SampleSentToLab as Sample_Sent_to_Lab,
        t.UrineResult as Urine_Result,
        t.ConfirmatoryResult as Confirmatory_result,
        t.Notes,
        CASE 
          WHEN t.IsPending = 1 THEN 'Pending'
          WHEN t.OralResult IS NULL AND t.UrineResult IS NULL THEN 'No Result Recorded'
          ELSE 'Other'
        END as Other_Pending_Reason
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE t.TestDate BETWEEN ? AND ?
        AND (t.IsPending = 1 OR t.OralResult IS NULL OR t.TestStatus = 'Pending')
      ORDER BY t.TestDate DESC
    `, [startDate, endDate]);
    
    res.json({
      report: 'AOD_Pending_Other',
      period: { year, quarter, startDate, endDate },
      description: 'Pending results and other incomplete tests',
      rowCount: rows.length,
      rows: rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. AOD Quarter Non-Negatives â€” Oral Non-Negative Results
app.get('/api/reports/aod-quarterly-nonnegative', (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter) return res.status(400).json({ error: 'year and quarter required' });
    
    const quarterStartMonth = (parseInt(quarter) - 1) * 3 + 1;
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endMonth = quarterStartMonth + 2;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;
    
    const rows = query(`
      SELECT 
        t.TestDate as Date,
        t.TestTime as Time,
        p.FullName as Name,
        p.DateOfBirth as DOB,
        '' as Gender,
        e.CompanyName as Company,
        e.Category as Contract,
        tt.Name as Type_of_test,
        t.OralResult as Oral_result,
        t.OralSubstances as Oral_Substances,
        t.UrineResult as Urine_Result,
        t.UrineSubstances as Urine_Substances,
        t.ConfirmatoryResult as Confirmatory_result,
        t.DetectedSubstances,
        t.DeclaredMedications,
        t.MedicationReviewStatus,
        t.Notes
      FROM AODTest t
      LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
      LEFT JOIN Person p ON t.PersonID = p.PersonID
      LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE t.TestDate BETWEEN ? AND ?
        AND (
          t.OralResult = 'Non-Negative'
          OR t.UrineResult = 'Non-Negative'
          OR t.FinalDrugOutcome = 'Non-Negative'
          OR t.IsNonNegative = 1
        )
      ORDER BY t.TestDate DESC
    `, [startDate, endDate]);
    
    res.json({
      report: 'AOD_Quarter_NonNegatives',
      period: { year, quarter, startDate, endDate },
      description: 'Oral and Urine Non-Negative Results with substance details',
      rowCount: rows.length,
      rows: rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// ARCHIVE ROUTES
// ============================================

// Get archive settings
app.get('/api/admin/archive/settings', requireAdmin, (req, res) => {
  const row = queryOne(`SELECT ArchiveSettings FROM AppSettings WHERE SettingKey = 'SYSTEM_SETTINGS'`);
  let settings = {};
  try { settings = JSON.parse(row?.ArchiveSettings || '{}'); } catch {}
  const defaults = {
    autoArchiveEnabled: false,
    autoArchiveCronHour: 2,
    autoArchiveCutoffMonths: 24,
    autoArchiveIncludePersonsAfterMonths: 0,
    autoArchiveIncludeCliniciansAfterMonths: 0,
  };
  res.json({ ...defaults, ...settings });
});

// Save archive settings
app.put('/api/admin/archive/settings', requireAdmin, (req, res) => {
  const current = queryOne(`SELECT ArchiveSettings FROM AppSettings WHERE SettingKey = 'SYSTEM_SETTINGS'`);
  let existing = {};
  try { existing = JSON.parse(current?.ArchiveSettings || '{}'); } catch {}
  const merged = { ...existing, ...req.body };
  run(`UPDATE AppSettings SET ArchiveSettings = ? WHERE SettingKey = 'SYSTEM_SETTINGS'`, [JSON.stringify(merged)]);
  res.json({ message: 'Archive settings saved' });
});

// Preview what would be archived
app.get('/api/admin/archive/preview', requireAdmin, (req, res) => {
  const { cutoffDate, includePersonsAfterMonths, includeCliniciansAfterMonths } = req.query;
  if (!cutoffDate) return res.status(400).json({ error: 'cutoffDate required' });

  const tests = queryOne(`SELECT COUNT(*) as count FROM AODTest WHERE TestDate < ?`, [cutoffDate]);
  const training = queryOne(`SELECT COUNT(*) as count FROM TrainingRecord WHERE TrainingDate < ?`, [cutoffDate]);
  const checks = queryOne(`SELECT COUNT(*) as count FROM ComplianceCheck WHERE CreatedAt < ?`, [cutoffDate]);
  const events = queryOne(`SELECT COUNT(*) as count FROM PatientEvent WHERE EventDate < ?`, [cutoffDate]);

  let persons = { count: 0 };
  let clinicians = { count: 0 };
  if (includePersonsAfterMonths && parseInt(includePersonsAfterMonths) > 0) {
    const personCutoff = new Date();
    personCutoff.setMonth(personCutoff.getMonth() - parseInt(includePersonsAfterMonths));
    const personCutoffStr = personCutoff.toISOString().slice(0, 10);
    persons = queryOne(`SELECT COUNT(*) as count FROM Person p WHERE p.IsActive = 1
      AND NOT EXISTS (SELECT 1 FROM AODTest t WHERE t.PersonID = p.PersonID AND t.TestDate >= ?)
      AND NOT EXISTS (SELECT 1 FROM PatientEvent pe WHERE pe.PersonID = p.PersonID AND pe.EventDate >= ?)`,
      [personCutoffStr, personCutoffStr]);
  }
  if (includeCliniciansAfterMonths && parseInt(includeCliniciansAfterMonths) > 0) {
    const clinCutoff = new Date();
    clinCutoff.setMonth(clinCutoff.getMonth() - parseInt(includeCliniciansAfterMonths));
    const clinCutoffStr = clinCutoff.toISOString().slice(0, 10);
    clinicians = queryOne(`SELECT COUNT(*) as count FROM Clinician c WHERE c.IsActive = 1
      AND NOT EXISTS (SELECT 1 FROM AODTest t WHERE t.ClinicianID = c.ClinicianID AND t.TestDate >= ?)`,
      [clinCutoffStr]);
  }

  res.json({
    cutoffDate,
    tests: tests?.count || 0,
    training: training?.count || 0,
    checks: checks?.count || 0,
    events: events?.count || 0,
    persons: persons?.count || 0,
    clinicians: clinicians?.count || 0,
  });
});

// Run archive job
app.post('/api/admin/archive/run', requireAdmin, (req, res) => {
  const { cutoffDate, includePersonsAfterMonths, includeCliniciansAfterMonths, note } = req.body;
  if (!cutoffDate) return res.status(400).json({ error: 'cutoffDate required' });

  let testsArchived = 0, trainingArchived = 0, eventsArchived = 0, personsArchived = 0, cliniciansArchived = 0;

  try {
    const jobResult = run(`INSERT INTO ArchiveJob (CutoffDate, ArchivedBy, Note) VALUES (?, ?, ?)`,
      [cutoffDate, 'admin', note || null]);
    const jobId = jobResult.lastInsertRowid;

    // Archive AOD Tests
    const testRows = query(`SELECT * FROM AODTest WHERE TestDate < ?`, [cutoffDate]);
    for (const row of testRows) {
      run(`INSERT INTO ArchivedTest (JobID, OriginalID, Data) VALUES (?, ?, ?)`,
        [jobId, row.TestID, JSON.stringify(row)]);
      run(`DELETE FROM NonNegativeRecord WHERE TestID = ?`, [row.TestID]);
      run(`DELETE FROM PendingResult WHERE TestID = ?`, [row.TestID]);
      run(`DELETE FROM AODTest WHERE TestID = ?`, [row.TestID]);
      testsArchived++;
    }

    // Archive Training Records
    const trainingRows = query(`SELECT * FROM TrainingRecord WHERE TrainingDate < ?`, [cutoffDate]);
    for (const row of trainingRows) {
      run(`INSERT INTO ArchivedTraining (JobID, OriginalID, RecordType, Data) VALUES (?, ?, 'TrainingRecord', ?)`,
        [jobId, row.TrainingID, JSON.stringify(row)]);
      run(`DELETE FROM TrainingRecord WHERE TrainingID = ?`, [row.TrainingID]);
      trainingArchived++;
    }

    // Archive Compliance Checks
    const checkRows = query(`SELECT * FROM ComplianceCheck WHERE CreatedAt < ?`, [cutoffDate]);
    for (const row of checkRows) {
      const completions = query(`SELECT * FROM CheckCompletion WHERE CheckID = ?`, [row.CheckID]);
      run(`INSERT INTO ArchivedTraining (JobID, OriginalID, RecordType, Data) VALUES (?, ?, 'ComplianceCheck', ?)`,
        [jobId, row.CheckID, JSON.stringify({ check: row, completions })]);
      run(`DELETE FROM CheckCompletion WHERE CheckID = ?`, [row.CheckID]);
      run(`DELETE FROM ComplianceCheck WHERE CheckID = ?`, [row.CheckID]);
      trainingArchived++;
    }

    // Archive Patient Events
    const eventRows = query(`SELECT * FROM PatientEvent WHERE EventDate < ?`, [cutoffDate]);
    for (const row of eventRows) {
      run(`INSERT INTO ArchivedPatientEvent (JobID, OriginalID, Data) VALUES (?, ?, ?)`,
        [jobId, row.EventID, JSON.stringify(row)]);
      run(`DELETE FROM PatientEvent WHERE EventID = ?`, [row.EventID]);
      eventsArchived++;
    }

    // Archive Persons (optional, by inactivity period)
    if (includePersonsAfterMonths && parseInt(includePersonsAfterMonths) > 0) {
      const personCutoff = new Date();
      personCutoff.setMonth(personCutoff.getMonth() - parseInt(includePersonsAfterMonths));
      const personCutoffStr = personCutoff.toISOString().slice(0, 10);
      const personRows = query(`SELECT p.*, e.CompanyName as EmployerName FROM Person p
        LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
        WHERE p.IsActive = 1
        AND NOT EXISTS (SELECT 1 FROM AODTest t WHERE t.PersonID = p.PersonID AND t.TestDate >= ?)
        AND NOT EXISTS (SELECT 1 FROM PatientEvent pe WHERE pe.PersonID = p.PersonID AND pe.EventDate >= ?)`,
        [personCutoffStr, personCutoffStr]);
      for (const row of personRows) {
        run(`INSERT INTO ArchivedPerson (JobID, OriginalID, Reason, Data) VALUES (?, ?, 'inactivity', ?)`,
          [jobId, row.PersonID, JSON.stringify(row)]);
        run(`UPDATE Person SET IsActive = 0 WHERE PersonID = ?`, [row.PersonID]);
        personsArchived++;
      }
    }

    // Archive Clinicians (optional, by inactivity period) — reads from User table (IsClinician=1)
    if (includeCliniciansAfterMonths && parseInt(includeCliniciansAfterMonths) > 0) {
      const clinCutoff = new Date();
      clinCutoff.setMonth(clinCutoff.getMonth() - parseInt(includeCliniciansAfterMonths));
      const clinCutoffStr = clinCutoff.toISOString().slice(0, 10);
      const clinRows = query(`SELECT * FROM User WHERE IsClinician = 1 AND IsActive = 1
        AND NOT EXISTS (SELECT 1 FROM AODTest t WHERE t.ClinicianID = User.UserID AND t.TestDate >= ?)`,
        [clinCutoffStr]);
      for (const row of clinRows) {
        run(`INSERT INTO ArchivedClinician (JobID, OriginalID, Reason, Data) VALUES (?, ?, 'inactivity', ?)`,
          [jobId, row.UserID, JSON.stringify(row)]);
        run(`UPDATE User SET IsActive = 0 WHERE UserID = ?`, [row.UserID]);
        logAudit(null, 'ARCHIVE', 'Clinician', row.UserID, `Auto-archived clinician: ${row.FullName} (inactivity)`);
        cliniciansArchived++;
      }
    }

    run(`UPDATE ArchiveJob SET TestsArchived=?, TrainingArchived=?, EventsArchived=?, PersonsArchived=?, CliniciansArchived=? WHERE JobID=?`,
      [testsArchived, trainingArchived, eventsArchived, personsArchived, cliniciansArchived, jobId]);

    logAudit(null, 'ARCHIVE', 'System', jobId, `Archive job completed: ${testsArchived} tests, ${trainingArchived} training/checks, ${eventsArchived} events, ${personsArchived} persons, ${cliniciansArchived} clinicians`);

    res.json({ jobId, testsArchived, trainingArchived, eventsArchived, personsArchived, cliniciansArchived });
  } catch (err) {
    logger.error('Archive job failed', { error: err.message });
    res.status(500).json({ error: 'Archive failed: ' + err.message });
  }
});

// Get archive history (list of jobs)
app.get('/api/admin/archive/jobs', requireAdmin, (req, res) => {
  res.json(query(`SELECT * FROM ArchiveJob ORDER BY ArchivedAt DESC LIMIT 50`));
});

// Browse archived data by type
app.get('/api/admin/archive/data', requireAdmin, (req, res) => {
  const { type, page = 1, limit = 50, search = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const searchLike = `%${search}%`;

  if (type === 'tests') {
    const rows = query(`SELECT a.*, j.ArchivedAt as JobArchivedAt FROM ArchivedTest a LEFT JOIN ArchiveJob j ON a.JobID = j.JobID
      WHERE a.RestoredAt IS NULL AND (a.Data LIKE ? OR CAST(a.OriginalID AS TEXT) LIKE ?)
      ORDER BY a.ArchiveID DESC LIMIT ? OFFSET ?`, [searchLike, searchLike, parseInt(limit), offset]);
    const total = queryOne(`SELECT COUNT(*) as c FROM ArchivedTest WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)`, [searchLike, searchLike]);
    return res.json({ rows: rows.map(r => ({ ...r, Parsed: tryParse(r.Data) })), total: total?.c || 0 });
  }
  if (type === 'training') {
    const rows = query(`SELECT a.*, j.ArchivedAt as JobArchivedAt FROM ArchivedTraining a LEFT JOIN ArchiveJob j ON a.JobID = j.JobID
      WHERE a.RestoredAt IS NULL AND (a.Data LIKE ? OR CAST(a.OriginalID AS TEXT) LIKE ?)
      ORDER BY a.ArchiveID DESC LIMIT ? OFFSET ?`, [searchLike, searchLike, parseInt(limit), offset]);
    const total = queryOne(`SELECT COUNT(*) as c FROM ArchivedTraining WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)`, [searchLike, searchLike]);
    return res.json({ rows: rows.map(r => ({ ...r, Parsed: tryParse(r.Data) })), total: total?.c || 0 });
  }
  if (type === 'events') {
    const rows = query(`SELECT a.*, j.ArchivedAt as JobArchivedAt FROM ArchivedPatientEvent a LEFT JOIN ArchiveJob j ON a.JobID = j.JobID
      WHERE a.RestoredAt IS NULL AND (a.Data LIKE ? OR CAST(a.OriginalID AS TEXT) LIKE ?)
      ORDER BY a.ArchiveID DESC LIMIT ? OFFSET ?`, [searchLike, searchLike, parseInt(limit), offset]);
    const total = queryOne(`SELECT COUNT(*) as c FROM ArchivedPatientEvent WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)`, [searchLike, searchLike]);
    return res.json({ rows: rows.map(r => ({ ...r, Parsed: tryParse(r.Data) })), total: total?.c || 0 });
  }
  if (type === 'persons') {
    const rows = query(`SELECT * FROM ArchivedPerson WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)
      ORDER BY ArchiveID DESC LIMIT ? OFFSET ?`, [searchLike, searchLike, parseInt(limit), offset]);
    const total = queryOne(`SELECT COUNT(*) as c FROM ArchivedPerson WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)`, [searchLike, searchLike]);
    return res.json({ rows: rows.map(r => ({ ...r, Parsed: tryParse(r.Data) })), total: total?.c || 0 });
  }
  if (type === 'clinicians') {
    const rows = query(`SELECT * FROM ArchivedClinician WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)
      ORDER BY ArchiveID DESC LIMIT ? OFFSET ?`, [searchLike, searchLike, parseInt(limit), offset]);
    const total = queryOne(`SELECT COUNT(*) as c FROM ArchivedClinician WHERE RestoredAt IS NULL AND (Data LIKE ? OR CAST(OriginalID AS TEXT) LIKE ?)`, [searchLike, searchLike]);
    return res.json({ rows: rows.map(r => ({ ...r, Parsed: tryParse(r.Data) })), total: total?.c || 0 });
  }

  // Summary counts
  const counts = {
    tests: queryOne(`SELECT COUNT(*) as c FROM ArchivedTest WHERE RestoredAt IS NULL`)?.c || 0,
    training: queryOne(`SELECT COUNT(*) as c FROM ArchivedTraining WHERE RestoredAt IS NULL`)?.c || 0,
    events: queryOne(`SELECT COUNT(*) as c FROM ArchivedPatientEvent WHERE RestoredAt IS NULL`)?.c || 0,
    persons: queryOne(`SELECT COUNT(*) as c FROM ArchivedPerson WHERE RestoredAt IS NULL`)?.c || 0,
    clinicians: queryOne(`SELECT COUNT(*) as c FROM ArchivedClinician WHERE RestoredAt IS NULL`)?.c || 0,
  };
  res.json(counts);
});

function tryParse(str) { try { return JSON.parse(str); } catch { return null; } }

// Restore an archived record
app.post('/api/admin/archive/restore', requireAdmin, (req, res) => {
  const { type, archiveId } = req.body;
  if (!type || !archiveId) return res.status(400).json({ error: 'type and archiveId required' });
  try {
    if (type === 'test') {
      const row = queryOne(`SELECT * FROM ArchivedTest WHERE ArchiveID = ? AND RestoredAt IS NULL`, [archiveId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      const d = tryParse(row.Data);
      if (!d) return res.status(400).json({ error: 'Corrupt archive data' });
      // Re-insert (omit TestID so SQLite auto-assigns a new one to avoid PK conflict)
      const cols = Object.keys(d).filter(k => k !== 'TestID').join(', ');
      const vals = Object.keys(d).filter(k => k !== 'TestID').map(() => '?').join(', ');
      run(`INSERT INTO AODTest (${cols}) VALUES (${vals})`, Object.keys(d).filter(k => k !== 'TestID').map(k => d[k]));
      run(`UPDATE ArchivedTest SET RestoredAt = CURRENT_TIMESTAMP WHERE ArchiveID = ?`, [archiveId]);
      return res.json({ message: 'Test restored' });
    }
    if (type === 'person') {
      const row = queryOne(`SELECT * FROM ArchivedPerson WHERE ArchiveID = ? AND RestoredAt IS NULL`, [archiveId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      run(`UPDATE Person SET IsActive = 1 WHERE PersonID = ?`, [row.OriginalID]);
      run(`UPDATE ArchivedPerson SET RestoredAt = CURRENT_TIMESTAMP WHERE ArchiveID = ?`, [archiveId]);
      return res.json({ message: 'Person restored' });
    }
    if (type === 'clinician') {
      const row = queryOne(`SELECT * FROM ArchivedClinician WHERE ArchiveID = ? AND RestoredAt IS NULL`, [archiveId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      run(`UPDATE User SET IsActive = 1 WHERE UserID = ? AND IsClinician = 1`, [row.OriginalID]);
      run(`UPDATE ArchivedClinician SET RestoredAt = CURRENT_TIMESTAMP WHERE ArchiveID = ?`, [archiveId]);
      logAudit(null, 'RESTORE', 'Clinician', row.OriginalID, `Restored clinician from archive`);
      return res.json({ message: 'Clinician restored' });
    }
    if (type === 'event') {
      const row = queryOne(`SELECT * FROM ArchivedPatientEvent WHERE ArchiveID = ? AND RestoredAt IS NULL`, [archiveId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      const d = tryParse(row.Data);
      if (!d) return res.status(400).json({ error: 'Corrupt archive data' });
      const cols = Object.keys(d).filter(k => k !== 'EventID').join(', ');
      const vals = Object.keys(d).filter(k => k !== 'EventID').map(() => '?').join(', ');
      run(`INSERT INTO PatientEvent (${cols}) VALUES (${vals})`, Object.keys(d).filter(k => k !== 'EventID').map(k => d[k]));
      run(`UPDATE ArchivedPatientEvent SET RestoredAt = CURRENT_TIMESTAMP WHERE ArchiveID = ?`, [archiveId]);
      return res.json({ message: 'Event restored' });
    }
    if (type === 'training') {
      const row = queryOne(`SELECT * FROM ArchivedTraining WHERE ArchiveID = ? AND RestoredAt IS NULL`, [archiveId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      const d = tryParse(row.Data);
      if (!d) return res.status(400).json({ error: 'Corrupt archive data' });
      if (row.RecordType === 'TrainingRecord') {
        const cols = Object.keys(d).filter(k => k !== 'RecordID').join(', ');
        const vals = Object.keys(d).filter(k => k !== 'RecordID').map(() => '?').join(', ');
        run(`INSERT INTO TrainingRecord (${cols}) VALUES (${vals})`, Object.keys(d).filter(k => k !== 'RecordID').map(k => d[k]));
      }
      run(`UPDATE ArchivedTraining SET RestoredAt = CURRENT_TIMESTAMP WHERE ArchiveID = ?`, [archiveId]);
      return res.json({ message: 'Training record restored' });
    }
    return res.status(400).json({ error: 'Unknown type' });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

// Get archived persons selection helpers
app.get('/api/admin/archive/persons-eligible', requireAdmin, (req, res) => {
  const { mode, employerId, inactiveMonths } = req.query;
  let rows = [];
  if (mode === 'employer' && employerId) {
    rows = query(`SELECT p.PersonID, p.FullName, p.BadgeNumber, e.CompanyName as EmployerName,
      (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) as LastTest,
      (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) as LastEvent
      FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE p.IsActive = 1 AND p.EmployerID = ? ORDER BY p.FullName`, [employerId]);
  } else if (mode === 'inactivity' && inactiveMonths) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - parseInt(inactiveMonths));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = query(`SELECT p.PersonID, p.FullName, p.BadgeNumber, e.CompanyName as EmployerName,
      (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) as LastTest,
      (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) as LastEvent
      FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE p.IsActive = 1
      AND (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) < ? OR (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) IS NULL
      AND (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) < ? OR (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) IS NULL
      ORDER BY p.FullName`, [cutoffStr, cutoffStr]);
  } else {
    rows = query(`SELECT p.PersonID, p.FullName, p.BadgeNumber, e.CompanyName as EmployerName,
      (SELECT MAX(TestDate) FROM AODTest WHERE PersonID = p.PersonID) as LastTest,
      (SELECT MAX(EventDate) FROM PatientEvent WHERE PersonID = p.PersonID) as LastEvent
      FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
      WHERE p.IsActive = 1 ORDER BY p.FullName LIMIT 200`);
  }
  res.json(rows);
});

// Archive selected persons manually
app.post('/api/admin/archive/persons', requireAdmin, (req, res) => {
  const { personIds, reason } = req.body;
  if (!Array.isArray(personIds) || !personIds.length) return res.status(400).json({ error: 'personIds required' });
  let count = 0;
  for (const id of personIds) {
    const p = queryOne(`SELECT p.*, e.CompanyName as EmployerName FROM Person p LEFT JOIN Employer e ON p.EmployerID = e.EmployerID WHERE p.PersonID = ?`, [id]);
    if (!p || !p.IsActive) continue;
    run(`INSERT INTO ArchivedPerson (OriginalID, Reason, Data) VALUES (?, ?, ?)`, [p.PersonID, reason || 'manual', JSON.stringify(p)]);
    run(`UPDATE Person SET IsActive = 0 WHERE PersonID = ?`, [id]);
    count++;
  }
  res.json({ archived: count });
});

// Archive selected clinicians manually (clinicianIds are UserIDs of IsClinician=1 users)
app.post('/api/admin/archive/clinicians', requireAdmin, (req, res) => {
  const { clinicianIds, reason } = req.body;
  if (!Array.isArray(clinicianIds) || !clinicianIds.length) return res.status(400).json({ error: 'clinicianIds required' });
  let count = 0;
  for (const id of clinicianIds) {
    const u = queryOne(`SELECT * FROM User WHERE UserID = ? AND IsClinician = 1`, [id]);
    if (!u || !u.IsActive) continue;
    run(`UPDATE User SET IsActive = 0 WHERE UserID = ?`, [id]);
    logAudit(null, 'ARCHIVE', 'Clinician', id, `Admin archived clinician: ${u.FullName} (reason: ${reason || 'manual'})`);
    count++;
  }
  res.json({ archived: count });
});

// ============================================
// DATABASE BACKUP MANAGER
// ============================================

const BACKUPS_DIR = join(__dirname, '..', 'backups');

function ensureBackupsDir() {
  if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });
}

function resolveDbPath() {
  return process.env.DB_PATH || join(__dirname, 'database', 'aod_tracker.db');
}

/**
 * Create a compressed (.7z) backup of the live database.
 * Reusable by manual route, pre-change hooks, and the scheduler.
 * @param {string} label  short label appended to the filename (sanitised)
 * @returns {Promise<{name,size,createdAt}>}
 */
async function createDatabaseBackup(label = '') {
  ensureBackupsDir();
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) throw new Error('Database file not found at ' + dbPath);

  const now    = new Date();
  const stamp  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safe   = String(label || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const base   = safe ? `aod_tracker-${stamp}-${safe}` : `aod_tracker-${stamp}`;
  const tmpDb  = join(BACKUPS_DIR, `${base}.db`);
  const outZip = join(BACKUPS_DIR, `${base}.7z`);

  // Flush WAL so the copy is consistent (SQLite only)
  try {
    const raw = getRawDb();
    if (raw && typeof raw.pragma === 'function') raw.pragma('wal_checkpoint(TRUNCATE)');
  } catch {}

  copyFileSync(dbPath, tmpDb);
  await new Promise((resolve, reject) => {
    sevenZipPack(tmpDb, outZip, (err) => { if (err) reject(err); else resolve(); });
  });
  try { unlinkSync(tmpDb); } catch {}

  const st = statSync(outZip);
  logger.info('Database backup created', { file: base + '.7z', size: st.size, label: safe || null });
  logAudit(null, 'BACKUP', 'Database', null, `Backup: ${base}.7z${safe ? ` (${safe})` : ''}`);
  return { name: base + '.7z', size: st.size, createdAt: now.toISOString() };
}

/** Remove old backups, keeping the newest `keep` files (by mtime). */
function pruneBackups(keep = 60) {
  try {
    ensureBackupsDir();
    const files = readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.7z'))
      .map(f => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(keep).forEach(({ f }) => { try { unlinkSync(join(BACKUPS_DIR, f)); } catch {} });
  } catch (err) {
    logger.warn('Backup prune failed', { error: err.message });
  }
}

// List existing backups
app.get('/api/admin/backups', adminAuth, (req, res) => {
  try {
    ensureBackupsDir();
    const files = readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.7z') || f.endsWith('.db'))
      .map(f => {
        const full = join(BACKUPS_DIR, f);
        const st   = statSync(full);
        return { name: f, size: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger a new backup â€” copies DB then compresses to .7z
app.post('/api/admin/backups', adminAuth, async (req, res) => {
  try {
    const label = (req.body && req.body.label) || 'manual';
    const result = await createDatabaseBackup(label);
    pruneBackups();
    res.json(result);
  } catch (err) {
    logger.error('Backup failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Automatic scheduled backups ──────────────────────────────────────────────
// Interval (hours) configurable via BACKUP_INTERVAL_HOURS env (default 24).
// Retention via BACKUP_KEEP env (default 60 files). Disabled in test mode.
const BACKUP_INTERVAL_HOURS = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '24');
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '60', 10);
if (process.env.NODE_ENV !== 'test' && BACKUP_INTERVAL_HOURS > 0) {
  const ms = BACKUP_INTERVAL_HOURS * 3600 * 1000;
  setInterval(() => {
    createDatabaseBackup('scheduled')
      .then(() => pruneBackups(BACKUP_KEEP))
      .catch(err => logger.error('Scheduled backup failed', { error: err.message }));
  }, ms).unref();
  logger.startup('Automatic backups scheduled', { everyHours: BACKUP_INTERVAL_HOURS, keep: BACKUP_KEEP });
}

// Download a backup file
app.get('/api/admin/backups/:filename/download', adminAuth, (req, res) => {
  try {
    const name = req.params.filename.replace(/\.\./g, ''); // prevent path traversal
    const filePath = join(BACKUPS_DIR, name);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', 'application/x-7z-compressed');
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a backup file
app.delete('/api/admin/backups/:filename', adminAuth, (req, res) => {
  try {
    const name = req.params.filename.replace(/\.\./g, '');
    const filePath = join(BACKUPS_DIR, name);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    unlinkSync(filePath);
    logger.info('Backup deleted', { file: name });
    logAudit(null, 'DELETE', 'Backup', null, `Backup deleted: ${name}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// LOG VIEWER ENDPOINTS (admin only)
// ============================================

// List available log files
app.get('/api/admin/logs', adminAuth, (req, res) => {
  try {
    const files = readdirSync(LOG_DIR)
      .map(f => {
        try {
          const s = statSync(join(LOG_DIR, f));
          return { name: f, size: s.size, modified: s.mtime.toISOString() };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read a specific log file (last N lines, default 500)
app.get('/api/admin/logs/:filename', adminAuth, (req, res) => {
  try {
    const { filename } = req.params;
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = join(LOG_DIR, filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Log file not found' });

    const lines = parseInt(req.query.lines || '500', 10);
    const content = readFileSync(filePath, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    const tail = allLines.slice(-lines);

    // Detect format: .txt = plain text, .log = JSON lines
    if (filename.endsWith('.txt')) {
      res.type('text/plain').send(tail.join('\n'));
    } else {
      // Parse JSON lines; skip malformed
      const parsed = tail.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
      res.json({ filename, totalLines: allLines.length, returned: tail.length, entries: parsed });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EXCEL IMPORT (admin) — idempotent, auto-backup
// ============================================

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx?$/i.test(file.originalname) ||
      file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel');
    cb(ok ? null : new Error('Only .xlsx/.xls files are accepted'), ok);
  },
});

// POST /api/admin/import/:type   (type = aod | patient)
// form-data: file=<xlsx>   ; query/body: dryRun=true|false
app.post('/api/admin/import/:type', adminAuth, importUpload.single('file'), async (req, res) => {
  const { type } = req.params;
  if (!['aod', 'patient'].includes(type)) {
    return res.status(400).json({ error: 'type must be "aod" or "patient"' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "file")' });

  const dryRun = String(req.query.dryRun ?? req.body?.dryRun ?? 'false') === 'true';

  try {
    // Safety: always back up the live DB before a real (non-dry-run) import.
    let backup = null;
    if (!dryRun) {
      try { backup = await createDatabaseBackup(`pre-import-${type}`); pruneBackups(); }
      catch (e) { return res.status(500).json({ error: 'Pre-import backup failed, import aborted: ' + e.message }); }
    }

    const stats = type === 'aod'
      ? importAodWorkbook(req.file.buffer, { dryRun })
      : importPatientWorkbook(req.file.buffer, { dryRun });

    if (!dryRun) {
      logAudit(null, 'IMPORT', type === 'aod' ? 'AODTest' : 'PatientEvent', null,
        `Excel import (${req.file.originalname}): +${stats.inserted}, ${stats.duplicates} dup`);
    }
    res.json({ ...stats, backup, fileName: req.file.originalname });
  } catch (err) {
    logger.error('Excel import failed', { type, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// BULK EDIT (admin) — auto-backup before changes
// ============================================

const BULK_ENTITIES = {
  aod: {
    table: 'AODTest', pk: 'TestID', hasUpdatedAt: true,
    cols: ['TestDate', 'TestTime', 'TestTypeID', 'ClinicianID', 'OralResult', 'BACInitialValue',
      'BACFinalValue', 'BACResult', 'UrineResult', 'ConfirmatoryResult', 'FinalBACOutcome',
      'FinalDrugOutcome', 'OverallAODResult', 'TestStatus', 'IsPending', 'IsNonNegative', 'Notes'],
    search: ['TestNumber', 'TestDate', 'OralResult', 'TestStatus', 'Notes'],
    order: 'TestDate DESC, TestID DESC',
  },
  patient: {
    table: 'PatientEvent', pk: 'EventID', hasUpdatedAt: true,
    cols: ['EventDate', 'EventTime', 'PatientName', 'Workgroup', 'WrNwr', 'BodyLocation',
      'InjuryType', 'Classification', 'RtwPlan', 'DrConsult', 'Referral', 'Comment',
      'EndOfWeekTracker', 'ClinicianID'],
    search: ['PatientName', 'Workgroup', 'WrNwr', 'BodyLocation', 'InjuryType', 'Comment'],
    order: 'EventDate DESC, EventID DESC',
  },
  person: {
    table: 'Person', pk: 'PersonID', hasUpdatedAt: true,
    cols: ['FullName', 'DateOfBirth', 'SexID', 'EmployerID', 'WorkerTypeID', 'BadgeNumber',
      'EmployeeNumber', 'Department', 'Position', 'Email', 'Phone', 'IsActive'],
    search: ['FullName', 'BadgeNumber', 'EmployeeNumber', 'Department', 'Position'],
    order: 'FullName ASC',
  },
  employer: {
    table: 'Employer', pk: 'EmployerID', hasUpdatedAt: true,
    cols: ['CompanyName', 'Category', 'ContactName', 'ContactEmail', 'ContactPhone', 'Address', 'IsActive'],
    search: ['CompanyName', 'Category', 'ContactName'],
    order: 'CompanyName ASC',
  },
};

// GET /api/admin/bulk/:entity?search=&limit=&offset=
app.get('/api/admin/bulk/:entity', adminAuth, (req, res) => {
  const cfg = BULK_ENTITIES[req.params.entity];
  if (!cfg) return res.status(400).json({ error: 'Unknown entity' });
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
  const offset = parseInt(req.query.offset || '0', 10);
  const search = (req.query.search || '').trim();

  const where = [];
  const params = [];
  if (search) {
    where.push('(' + cfg.search.map(c => `${c} LIKE ?`).join(' OR ') + ')');
    cfg.search.forEach(() => params.push(`%${search}%`));
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const total = queryOne(`SELECT COUNT(*) c FROM ${cfg.table} ${whereSql}`, params).c;
    const rows = query(
      `SELECT * FROM ${cfg.table} ${whereSql} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ rows, total, columns: cfg.cols, pk: cfg.pk, editable: cfg.cols });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bulk/:entity/update
//   body: { ids:[...], set:{col:val} }              → same change to many rows
//      or { updates:[{ id, set:{col:val} }, ...] }   → per-row changes
app.post('/api/admin/bulk/:entity/update', adminAuth, async (req, res) => {
  const cfg = BULK_ENTITIES[req.params.entity];
  if (!cfg) return res.status(400).json({ error: 'Unknown entity' });

  const allowed = new Set(cfg.cols);
  let work = [];
  if (Array.isArray(req.body.updates)) {
    work = req.body.updates.map(u => ({ id: u.id, set: u.set || {} }));
  } else if (Array.isArray(req.body.ids) && req.body.set) {
    work = req.body.ids.map(id => ({ id, set: req.body.set }));
  } else {
    return res.status(400).json({ error: 'Provide {ids,set} or {updates}' });
  }
  work = work.filter(w => w.id != null && Object.keys(w.set).some(c => allowed.has(c)));
  if (!work.length) return res.status(400).json({ error: 'No valid rows/columns to update' });

  try {
    const backup = await createDatabaseBackup(`pre-bulk-${req.params.entity}`);
    pruneBackups();

    let updated = 0;
    for (const w of work) {
      const cols = Object.keys(w.set).filter(c => allowed.has(c));
      if (!cols.length) continue;
      const assigns = cols.map(c => `${c}=?`).join(', ');
      const upd = cfg.hasUpdatedAt ? `${assigns}, UpdatedAt=CURRENT_TIMESTAMP` : assigns;
      const vals = cols.map(c => w.set[c]);
      run(`UPDATE ${cfg.table} SET ${upd} WHERE ${cfg.pk}=?`, [...vals, w.id]);
      updated++;
    }
    logAudit(null, 'BULK_UPDATE', cfg.table, null, `Bulk update ${updated} rows (${req.params.entity})`);
    res.json({ updated, backup });
  } catch (err) {
    logger.error('Bulk update failed', { entity: req.params.entity, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bulk/:entity/delete   body: { ids:[...] }
app.post('/api/admin/bulk/:entity/delete', adminAuth, async (req, res) => {
  const cfg = BULK_ENTITIES[req.params.entity];
  if (!cfg) return res.status(400).json({ error: 'Unknown entity' });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(x => x != null) : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids provided' });

  try {
    const backup = await createDatabaseBackup(`pre-bulkdelete-${req.params.entity}`);
    pruneBackups();
    let deleted = 0;
    for (const id of ids) {
      try { run(`DELETE FROM ${cfg.table} WHERE ${cfg.pk}=?`, [id]); deleted++; } catch {}
    }
    logAudit(null, 'BULK_DELETE', cfg.table, null, `Bulk delete ${deleted} rows (${req.params.entity})`);
    res.json({ deleted, backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ERROR HANDLER (must be last middleware)
// ============================================
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    logger.info('Server started', { port: PORT, host: HOST });
    console.log(`\nClinic Tracker server running on port ${PORT}`);
    console.log(`  Local:   http://localhost:${PORT}`);
    if (SERVE_FRONTEND) console.log(`  *** Frontend served from Express (production mode) ***`);
    logger.startup('Server listening', { port: PORT, host: HOST, frontend: SERVE_FRONTEND || false });
    try {
      const nets = networkInterfaces();
      for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`  Network: http://${iface.address}:${PORT}`);
            logger.startup(`Network interface`, { address: iface.address, port: PORT });
          }
        }
      }
    } catch {}
    console.log('');
  });
}

export default app;
