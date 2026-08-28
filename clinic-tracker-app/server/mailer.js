/**
 * mailer.js — SMTP email service
 *
 * Config is stored in AppSettings under key 'smtp' as JSON:
 * {
 *   host, port, secure, user, pass,
 *   fromName, fromAddress,
 *   enabled
 * }
 *
 * Usage:
 *   import { sendMail, getSmtpConfig, saveSmtpConfig, testSmtp } from './mailer.js';
 */

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { queryOne, run, query } from './db.js';
import logger from './logger.js';

// ── Config helpers ────────────────────────────────────────────────────────────

export function getSmtpConfig() {
  try {
    const row = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'smtp'`);
    return row?.SettingValue ? JSON.parse(row.SettingValue) : {};
  } catch {
    return {};
  }
}

export function saveSmtpConfig(cfg) {
  const existing = queryOne(`SELECT SettingID FROM AppSettings WHERE SettingKey = 'smtp'`);
  const json = JSON.stringify(cfg);
  if (existing) {
    run(`UPDATE AppSettings SET SettingValue = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SettingKey = 'smtp'`, [json]);
  } else {
    run(`INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('smtp', ?)`, [json]);
  }
}

// ── Transporter factory ───────────────────────────────────────────────────────

function buildTransporter(cfg) {
  const port = parseInt(cfg.port || '587', 10);
  const secure = cfg.secure === true || cfg.secure === 'true' || port === 465;

  const transportOptions = {
    host: cfg.host,
    port,
    secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass || '' } : undefined,
    tls: { rejectUnauthorized: cfg.rejectUnauthorized !== false },
  };

  return nodemailer.createTransport(transportOptions);
}

// ── Send mail ─────────────────────────────────────────────────────────────────

/**
 * sendMail({ to, subject, text, html })
 * Returns { success, messageId } or throws.
 */
export async function sendMail({ to, subject, text, html }) {
  const cfg = getSmtpConfig();
  if (!cfg.enabled) throw new Error('SMTP is not enabled in settings.');
  if (!cfg.host)    throw new Error('SMTP host is not configured.');

  const transporter = buildTransporter(cfg);
  const from = cfg.fromName
    ? `"${cfg.fromName}" <${cfg.fromAddress || cfg.user}>`
    : (cfg.fromAddress || cfg.user);

  const info = await transporter.sendMail({ from, to, subject, text, html });
  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return { success: true, messageId: info.messageId };
}

// ── Email rules helpers ───────────────────────────────────────────────────────

export function getEmailRules() {
  try {
    const row = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'emailRules'`);
    return row?.SettingValue ? JSON.parse(row.SettingValue) : [];
  } catch { return []; }
}

export function saveEmailRules(rules) {
  const existing = queryOne(`SELECT SettingID FROM AppSettings WHERE SettingKey = 'emailRules'`);
  const json = JSON.stringify(rules);
  if (existing) {
    run(`UPDATE AppSettings SET SettingValue = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SettingKey = 'emailRules'`, [json]);
  } else {
    run(`INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('emailRules', ?)`, [json]);
  }
}

// ── Test email formatter ──────────────────────────────────────────────────────

function resultColor(r) {
  if (!r) return '#6b7280';
  if (r === 'Negative') return '#16a34a';
  if (r.includes('Positive') || r.includes('Inconsistent') || r.includes('Confirmed')) return '#dc2626';
  return '#d97706';
}

function row(label, value) {
  if (!value && value !== 0) return '';
  return `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:12px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:3px 0;font-size:12px;font-weight:600;color:#111">${value}</td></tr>`;
}

function section(title, content) {
  if (!content.trim()) return '';
  return `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#555;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px">${title}</div>
      <table style="border-collapse:collapse;width:100%">${content}</table>
    </div>`;
}

/**
 * Build a full HTML report for a test record (matches print output).
 * test: full AODTest row joined with Person/Employer/etc.
 * hideBadge: boolean from admin settings
 */
function buildTestHtml(test, hideBadge = false) {
  const overall = test.OverallAODResult || 'Pending';
  const color   = resultColor(overall);

  const donorSection = section('Donor Details', [
    row('Name',          test.PersonName || test.DonorName),
    row('Employer',      test.EmployerName),
    row('Test Type',     test.TestTypeName),
    row('Clinician',     test.ClinicianName),
    !hideBadge ? row('Badge / Emp #', test.BadgeNumber || test.EmployeeNumber) : '',
    row('ID Sighted',    test.IDSighted ? 'Yes' : 'No'),
    test.IDSighted ? row('ID Details', [test.IDType, test.IDNumber].filter(Boolean).join(' — ')) : '',
    row('Date',          test.TestDate + (test.TestTime ? ' ' + test.TestTime : '')),
  ].join(''));

  const bacVal = (v, t) => v != null ? `${parseFloat(v).toFixed(3)}%${t ? ' @ ' + t : ''}` : null;
  const bacSection = section('Alcohol (BAC)', [
    row('Undertaken',   test.BACUndertaken ? 'Yes' : 'No'),
    test.BACUndertaken ? row('Initial BAC',  bacVal(test.BACInitialValue, test.BACInitialTime)) : '',
    test.BACUndertaken ? row('Final BAC',    bacVal(test.BACFinalValue, test.BACFinalTime))    : '',
    test.BACUndertaken ? row('Device',       test.BACDeviceID)   : '',
    row('Alcohol Outcome', test.FinalBACOutcome),
  ].join(''));

  const drugSection = section('Drug Screening', [
    row('Oral Result',      test.OralResult),
    test.OralSubstances ? row('Oral Substances', test.OralSubstances) : '',
    test.OralDeviceID   ? row('Oral Device',     test.OralDeviceID)   : '',
    row('Urine Result',     test.UrineResult),
    test.UrineSubstances ? row('Urine Substances', test.UrineSubstances) : '',
    test.UrineSampleID   ? row('Urine Sample ID',  test.UrineSampleID)  : '',
    row('Sent to Lab',      test.SampleSentToLab ? 'Yes' : 'No'),
    test.LabReference    ? row('Lab Reference',    test.LabReference)   : '',
    row('Drug Outcome',     test.FinalDrugOutcome),
  ].join(''));

  const labSection = (test.ConfirmatoryResult || test.MedicationReviewStatus || test.DeclaredMedications)
    ? section('Confirmatory / Medication Review', [
        row('Lab Result',         test.ConfirmatoryResult),
        row('Detected Substances',test.DetectedSubstances),
        row('Declared Medications',test.DeclaredMedications),
        row('Medication Review',  test.MedicationReviewStatus),
        row('Review Notes',       test.MedicationReviewNotes),
      ].join(''))
    : '';

  const idSection = (test.IDSighted && (test.IDType || test.IDNumber))
    ? section('ID Verification', [
        row('ID Type',   test.IDType),
        row('ID Number', test.IDNumber),
      ].join(''))
    : '';

  const notesSection = test.Notes
    ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #eee"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:4px">Notes</div><p style="font-size:12px;white-space:pre-wrap;color:#333;margin:0">${test.Notes}</p></div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:20px}
  .card{background:#fff;max-width:700px;margin:0 auto;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12);overflow:hidden}
  .header{background:#1e3a5f;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:flex-start}
  .tn{font-size:22px;font-weight:bold;letter-spacing:.03em}
  .td{font-size:12px;color:#aac4e0;margin-top:4px}
  .result{font-size:18px;font-weight:bold;text-align:right}
  .body{padding:20px 24px}
  .status{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#e5e7eb;color:#374151;margin-bottom:14px}
  .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:10px 24px;font-size:10px;color:#9ca3af;text-align:center}
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <div class="tn">${test.TestNumber}</div>
      <div class="td">${test.TestDate}${test.TestTime ? ' at ' + test.TestTime : ''} &nbsp;·&nbsp; ${test.TestTypeName || ''}</div>
    </div>
    <div class="result" style="color:${color === '#16a34a' ? '#86efac' : color === '#dc2626' ? '#fca5a5' : '#fcd34d'}">${overall}</div>
  </div>
  <div class="body">
    <div class="status">${test.TestStatus || 'Closed'}</div>
    ${donorSection}${bacSection}${drugSection}${labSection}${idSection}${notesSection}
  </div>
  <div class="footer">Generated by AOD Tracker &nbsp;·&nbsp; ${new Date().toLocaleString('en-AU')}</div>
</div>
</body></html>`;
}

/**
 * sendTestEmail({ testId, to, subject, triggerLabel })
 * Loads the full test record + attachments, builds HTML, attaches files, sends.
 */
export async function sendTestEmail({ testId, to, subject, triggerLabel = 'Manual' }) {
  const cfg = getSmtpConfig();
  if (!cfg.enabled) throw new Error('SMTP is not enabled in settings.');
  if (!cfg.host)    throw new Error('SMTP host is not configured.');

  // Load admin settings for hideBadgeNumber
  let hideBadge = false;
  try {
    const adminRow = queryOne(`SELECT SettingValue FROM AppSettings WHERE SettingKey = 'admin'`);
    const adminCfg = adminRow?.SettingValue ? JSON.parse(adminRow.SettingValue) : {};
    hideBadge = !!adminCfg.hideBadgeNumber;
  } catch {}

  // Load full test record
  const test = queryOne(`
    SELECT t.*, p.FullName as PersonName, p.BadgeNumber, p.EmployeeNumber, p.DateOfBirth,
           e.CompanyName as EmployerName,
           tt.Name as TestTypeName, tt.Code as TestTypeCode,
           c.Name as ClinicianName
    FROM AODTest t
    LEFT JOIN Person p ON t.PersonID = p.PersonID
    LEFT JOIN Employer e ON p.EmployerID = e.EmployerID
    LEFT JOIN TestType tt ON t.TestTypeID = tt.TestTypeID
    LEFT JOIN Clinician c ON t.ClinicianID = c.ClinicianID
    WHERE t.TestID = ?
  `, [testId]);

  if (!test) throw new Error(`Test ${testId} not found`);

  // Load attachments
  const attachmentRows = query(
    `SELECT * FROM Attachment WHERE RecordType = 'AODTest' AND RecordID = ? ORDER BY UploadedAt ASC`,
    [testId]
  );

  // Build email
  const html = buildTestHtml(test, hideBadge);
  const subjectLine = subject || `AOD Test Report — ${test.TestNumber} — ${test.PersonName || 'Unknown'} — ${overall(test)}`;

  // Build nodemailer attachments from files on disk
  const emailAttachments = [];
  for (const att of attachmentRows) {
    if (att.FilePath && existsSync(att.FilePath)) {
      emailAttachments.push({
        filename: att.OriginalFileName || att.FileName,
        path:     att.FilePath,
        contentType: att.MimeType || 'application/octet-stream',
      });
    }
  }

  const transporter = buildTransporter(cfg);
  const from = cfg.fromName
    ? `"${cfg.fromName}" <${cfg.fromAddress || cfg.user}>`
    : (cfg.fromAddress || cfg.user);

  const toList = Array.isArray(to) ? to.join(', ') : to;
  const info = await transporter.sendMail({
    from, to: toList,
    subject: subjectLine,
    html,
    text: `AOD Test Report: ${test.TestNumber} — ${test.PersonName || ''} — ${overall(test)}\n\nDate: ${test.TestDate}\nResult: ${overall(test)}\n\nThis email was sent automatically by AOD Tracker (trigger: ${triggerLabel}).`,
    attachments: emailAttachments,
  });

  logger.info('Test email sent', { testId, to: toList, subject: subjectLine, messageId: info.messageId, trigger: triggerLabel });
  return { success: true, messageId: info.messageId };
}

function overall(test) {
  return test.OverallAODResult || 'Pending';
}

// ── Test connection ───────────────────────────────────────────────────────────

/**
 * testSmtp(cfg) — verify connection + optionally send a test email.
 * cfg may override saved config.
 */
export async function testSmtp(cfg) {
  if (!cfg.host) throw new Error('SMTP host is required.');
  const transporter = buildTransporter(cfg);
  await transporter.verify();
  return { success: true, message: 'SMTP connection verified successfully.' };
}
