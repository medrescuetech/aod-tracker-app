import { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, renameSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LOG_DIR = join(__dirname, 'logs');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Log rotation config ───────────────────────────────────────────────────
const LOG_RETENTION_DAYS   = parseInt(process.env.LOG_RETENTION_DAYS  || '30',  10);
const LOG_MAX_FILE_MB      = parseInt(process.env.LOG_MAX_FILE_MB     || '20',  10);
const LOG_MAX_FOLDER_MB    = parseInt(process.env.LOG_MAX_FOLDER_MB   || '200', 10);
const LOG_MAX_FILE_BYTES   = LOG_MAX_FILE_MB  * 1024 * 1024;
const LOG_MAX_FOLDER_BYTES = LOG_MAX_FOLDER_MB * 1024 * 1024;

// ─── Size-based rotation ───────────────────────────────────────────────────
const MAX_ROTATED_COPIES = 3;
const rotateLargeFile = (filename) => {
  try {
    const full = join(LOG_DIR, filename);
    if (!existsSync(full)) return;
    if (statSync(full).size < LOG_MAX_FILE_BYTES) return;
    for (let i = MAX_ROTATED_COPIES; i >= 1; i--) {
      const ext = filename.match(/\.(log|txt)$/)?.[1] || 'log';
      const base = full.replace(/\.(log|txt)$/, '');
      const old  = `${base}.${i}.${ext}`;
      const next = `${base}.${i + 1}.${ext}`;
      if (existsSync(old)) {
        if (i === MAX_ROTATED_COPIES) unlinkSync(old);
        else renameSync(old, next);
      }
    }
    const ext = filename.match(/\.(log|txt)$/)?.[1] || 'log';
    renameSync(full, full.replace(/\.(log|txt)$/, `.1.${ext}`));
  } catch {}
};

// ─── Age-based prune + folder size cap ─────────────────────────────────────
const pruneOldLogs = () => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS);

    for (const f of readdirSync(LOG_DIR)) {
      const match = f.match(/(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.(log|txt)$/);
      if (match && new Date(match[1]) < cutoff) {
        try { unlinkSync(join(LOG_DIR, f)); } catch {}
      }
    }

    let files = readdirSync(LOG_DIR)
      .map(f => { try { const s = statSync(join(LOG_DIR, f)); return { f, mtime: s.mtimeMs, size: s.size }; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime);

    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const { f, size } of files) {
      if (total <= LOG_MAX_FOLDER_BYTES) break;
      try { unlinkSync(join(LOG_DIR, f)); total -= size; } catch {}
    }
  } catch {}
};

pruneOldLogs();
setInterval(pruneOldLogs, 24 * 60 * 60 * 1000).unref();

// ─── Sensitive field sanitisation ─────────────────────────────────────────
const SENSITIVE_KEYS = new Set(['password', 'passwordhash', 'token', 'secret', 'authorization']);
export const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
};

// ─── Deduplication: suppress identical errors within 30 s ─────────────────
const recentErrors = new Map();
const DEDUP_WINDOW_MS = 30_000;
const dedup = (key) => {
  const now = Date.now();
  const entry = recentErrors.get(key);
  if (entry && now - entry.ts < DEDUP_WINDOW_MS) { entry.count++; return true; }
  recentErrors.set(key, { ts: now, count: 1 });
  return false;
};
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of recentErrors) {
    if (now - v.ts > DEDUP_WINDOW_MS * 2) recentErrors.delete(k);
  }
}, 300_000).unref();

// ─── Stack frame extraction ────────────────────────────────────────────────
const extractFrame = (stack) => {
  if (!stack) return null;
  const lines = stack.split('\n');
  const frame = lines.slice(1).find(l => l.includes('aod-tracker-app') && !l.includes('node_modules'));
  if (frame) return frame.trim().replace(/^at /, '');
  return lines[1]?.trim().replace(/^at /, '') || null;
};

// ─── Date helpers ──────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

// ─── JSON structured log files (machine-readable) ─────────────────────────
//   app-YYYY-MM-DD.log      all levels
//   error-YYYY-MM-DD.log    ERROR / WARN / FATAL / DB_ERROR
//   access-YYYY-MM-DD.log   HTTP requests
//   audit-YYYY-MM-DD.log    data create/update/delete
const appLogFile    = () => `app-${today()}.log`;
const errorLogFile  = () => `error-${today()}.log`;
const accessLogFile = () => `access-${today()}.log`;
const auditLogFile  = () => `audit-${today()}.log`;

// ─── Human-readable text log files (notepad-friendly) ─────────────────────
//   routine-YYYY-MM-DD.txt  INFO / STARTUP / AUDIT / DEBUG
//   errors-YYYY-MM-DD.txt   WARN / ERROR / FATAL / DB_ERROR / CLIENT
const routineTxtFile = () => `routine-${today()}.txt`;
const errorsTxtFile  = () => `errors-${today()}.txt`;

// ─── File writers ──────────────────────────────────────────────────────────
const writeJson = (filename, obj) => {
  try {
    rotateLargeFile(filename);
    appendFileSync(join(LOG_DIR, filename), JSON.stringify(obj) + '\n');
  } catch {}
};

const writeTxt = (filename, lines) => {
  try {
    rotateLargeFile(filename);
    appendFileSync(join(LOG_DIR, filename), lines + '\n');
  } catch {}
};

// Format a log entry as a plain-text block suitable for Notepad
const formatTxt = (level, message, meta = {}) => {
  const ts = new Date().toLocaleString('en-AU', { hour12: false });
  const { error, stack, frame, url, method, status, ip, reqId, action, recordType, recordId, description, userId, ...rest } = meta;

  const lines = [`[${ts}] ${level.padEnd(8)} ${message}`];

  if (method && url)         lines.push(`  Request : ${method} ${url}${status ? ` → ${status}` : ''}`);
  if (ip)                    lines.push(`  IP      : ${ip}`);
  if (reqId)                 lines.push(`  Req ID  : ${reqId}`);
  if (action && recordType)  lines.push(`  Action  : ${action} ${recordType}${recordId ? ` #${recordId}` : ''}`);
  if (description)           lines.push(`  Detail  : ${description}`);
  if (userId)                lines.push(`  User    : ${userId}`);
  if (error)                 lines.push(`  Error   : ${error}`);
  if (frame)                 lines.push(`  At      : ${frame}`);

  // Any remaining interesting keys
  const extras = Object.entries(rest).filter(([, v]) => v !== undefined && v !== null);
  if (extras.length) {
    lines.push(`  Info    : ${extras.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ')}`);
  }

  return lines.join('\n');
};

// ─── Core logger ──────────────────────────────────────────────────────────
export const logger = {

  // ── ERROR: uncaught exceptions, route handler failures ──────────────────
  error: (message, meta = {}) => {
    const dedupKey = `${message}::${meta.url || ''}::${meta.error || ''}`;
    const suppressed = dedup(dedupKey);
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      frame: meta.stack ? extractFrame(meta.stack) : undefined,
      ...meta,
      ...(suppressed ? { dedupSuppressed: recentErrors.get(dedupKey)?.count } : {})
    };
    if (!suppressed) {
      console.error(`[ERROR] ${message}`, meta.error || '');
      writeJson(appLogFile(), entry);
      writeJson(errorLogFile(), entry);
      writeTxt(errorsTxtFile(), formatTxt('ERROR', message, { ...meta, frame: entry.frame }));
    }
  },

  // ── WARN: non-fatal alerts, bad requests, auth failures ─────────────────
  warn: (message, meta = {}) => {
    const entry = { timestamp: new Date().toISOString(), level: 'WARN', message, ...meta };
    console.warn(`[WARN] ${message}`);
    writeJson(appLogFile(), entry);
    writeJson(errorLogFile(), entry);
    writeTxt(errorsTxtFile(), formatTxt('WARN', message, meta));
  },

  // ── INFO: normal operational events ─────────────────────────────────────
  info: (message, meta = {}) => {
    const entry = { timestamp: new Date().toISOString(), level: 'INFO', message, ...meta };
    console.log(`[INFO] ${message}`);
    writeJson(appLogFile(), entry);
    writeTxt(routineTxtFile(), formatTxt('INFO', message, meta));
  },

  // ── DEBUG: verbose detail, only when DEBUG env var set ──────────────────
  debug: (message, meta = {}) => {
    if (process.env.DEBUG) {
      const entry = { timestamp: new Date().toISOString(), level: 'DEBUG', message, ...meta };
      console.log(`[DEBUG] ${message}`);
      writeJson(appLogFile(), entry);
      writeTxt(routineTxtFile(), formatTxt('DEBUG', message, meta));
    }
  },

  // ── DB: SQL debug tracing ────────────────────────────────────────────────
  db: (operation, table, meta = {}) => {
    if (process.env.DEBUG) {
      writeJson(appLogFile(), { timestamp: new Date().toISOString(), level: 'DEBUG', message: 'DB', operation, table, ...meta });
    }
  },

  // ── AUTH: login attempts, admin access ─────────────────────────────────
  auth: (event, success, meta = {}) => {
    const level = success ? 'INFO' : 'WARN';
    const entry = { timestamp: new Date().toISOString(), level, message: `Auth: ${event}`, success, ...meta };
    writeJson(appLogFile(), entry);
    if (success) {
      writeTxt(routineTxtFile(), formatTxt('AUTH', `Auth: ${event}`, meta));
    } else {
      writeJson(errorLogFile(), entry);
      writeTxt(errorsTxtFile(), formatTxt('WARN', `Auth failed: ${event}`, meta));
      console.warn(`[WARN] Auth failed: ${event}`);
    }
  },

  // ── CLIENT: browser-reported JS errors ──────────────────────────────────
  client: (meta = {}) => {
    const entry = { timestamp: new Date().toISOString(), level: 'ERROR', message: 'Client Error', source: 'browser', ...meta };
    console.error('[CLIENT]', meta.message || meta.error || '');
    writeJson(appLogFile(), entry);
    writeJson(errorLogFile(), entry);
    writeTxt(errorsTxtFile(), formatTxt('CLIENT', meta.message || meta.error || 'Client Error', meta));
  },

  // ── AUDIT: every data create/update/delete ──────────────────────────────
  audit: (action, recordType, recordId, description, meta = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'AUDIT',
      action,
      recordType,
      recordId,
      description,
      ...meta
    };
    writeJson(auditLogFile(), entry);
    writeJson(appLogFile(), entry);
    writeTxt(routineTxtFile(), formatTxt('AUDIT', description || `${action} ${recordType}`, { action, recordType, recordId, ...meta }));
  },

  // ── DB_ERROR: SQL failures, constraint violations ───────────────────────
  dbError: (operation, table, error, meta = {}) => {
    const frame = error instanceof Error ? extractFrame(error.stack) : undefined;
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'DB_ERROR',
      message: `DB error on ${operation} ${table}`,
      operation,
      table,
      error: error instanceof Error ? error.message : String(error),
      frame,
      ...meta
    };
    console.error(`[DB_ERROR] ${operation} ${table}:`, entry.error);
    writeJson(errorLogFile(), entry);
    writeJson(appLogFile(), entry);
    writeTxt(errorsTxtFile(), formatTxt('DB_ERROR', `${operation} ${table}: ${entry.error}`, { frame, ...meta }));
  },

  // ── STARTUP: server init, DB migrations, seed data ──────────────────────
  startup: (message, meta = {}) => {
    const entry = { timestamp: new Date().toISOString(), level: 'STARTUP', message, ...meta };
    console.log(`[STARTUP] ${message}`);
    writeJson(appLogFile(), entry);
    writeTxt(routineTxtFile(), formatTxt('STARTUP', message, meta));
  }
};

// ─── Request logger middleware ─────────────────────────────────────────────
export const requestLogger = (req, res, next) => {
  req.id = randomBytes(4).toString('hex');
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status   = res.statusCode;

    // Access log (JSON) — every request
    writeJson(accessLogFile(), {
      ts: new Date().toISOString(),
      reqId: req.id,
      method: req.method,
      url: req.url,
      status,
      ms: duration,
      ip: req.ip
    });

    // 4xx/5xx — also write to error files
    if (status >= 400) {
      const level = status >= 500 ? 'ERROR' : 'WARN';
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: `HTTP ${status}`,
        reqId: req.id,
        method: req.method,
        url: req.url,
        status,
        ms: duration,
        ip: req.ip,
        body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
        ua: req.get('user-agent')
      };
      writeJson(appLogFile(), entry);
      writeJson(errorLogFile(), entry);
      writeTxt(errorsTxtFile(), formatTxt(level, `HTTP ${status}`, {
        method: req.method, url: req.url, status, ip: req.ip, reqId: req.id, ms: `${duration}ms`
      }));
    }
  });

  next();
};

// ─── Express error handler ─────────────────────────────────────────────────
export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error', {
    reqId: req.id,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
  });
  res.status(500).json({
    error: 'Internal server error',
    reqId: req.id,
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
};

// ─── Process-level crash handlers ─────────────────────────────────────────
process.on('uncaughtException', (err) => {
  const frame = extractFrame(err.stack);
  const ts = new Date().toISOString();
  const jsonEntry = {
    timestamp: ts, level: 'FATAL',
    message: 'Uncaught Exception — process will exit',
    error: err.message, stack: err.stack, frame,
    memory: process.memoryUsage(), nodeVersion: process.version
  };
  console.error('[FATAL] Uncaught Exception:', err.message);
  try { appendFileSync(join(LOG_DIR, errorLogFile()), JSON.stringify(jsonEntry) + '\n'); } catch {}
  try {
    const txt = formatTxt('FATAL', 'Uncaught Exception — process will exit', { error: err.message, frame });
    appendFileSync(join(LOG_DIR, errorsTxtFile()), txt + '\n');
  } catch {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled Promise Rejection', {
    error: err.message,
    stack: err.stack,
    frame: extractFrame(err.stack)
  });
});

export default logger;
