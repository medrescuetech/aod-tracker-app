/**
 * db.js — Multi-backend database abstraction layer
 *
 * Supported backends:  sqlite (default) | mssql
 *
 * Config priority (highest → lowest):
 *   1. Environment variables (DB_TYPE, DB_PATH, DB_HOST, DB_USER, …)
 *   2. db-config.json  (written by the Controller app)
 *   3. Built-in defaults
 *
 * SQLite env vars:
 *   DB_TYPE=sqlite   DB_PATH=/abs/path/to/aod_tracker.db
 *
 * MSSQL env vars:
 *   DB_TYPE=mssql    DB_HOST=.    DB_PORT=1433    DB_NAME=AODTracker
 *   DB_USER=sa       DB_PASSWORD=yourPw   DB_ENCRYPT=false   DB_TRUST_CERT=true
 *
 * Exports (synchronous, SQLite):
 *   query(sql, params)    → row[]
 *   queryOne(sql, params) → row | null
 *   run(sql, params)      → { lastInsertRowid }
 *   exec(sql)             → void   (DDL / multi-statement, SQLite only)
 *   ensureColumn(table, col, defSql) → void
 *   saveDb()              → schedules debounced flush to disk
 *   forceSaveDb()         → immediate synchronous flush to disk
 *   getRawDb()            → underlying driver object (sql.js DB | mssql Pool)
 *   initDb()              → Promise<void>   must be awaited at startup
 *   closeDb()             → Promise<void>
 *
 * Async variants (required for MSSQL):
 *   queryAsync / queryOneAsync / runAsync
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────────

const CONFIG_FILE =
  process.env.DB_CONFIG_FILE ||
  join(__dirname, 'database', 'db-config.json');

function loadFileConfig() {
  try {
    if (existsSync(CONFIG_FILE))
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
  return {};
}

export function getDbConfig() {
  const fc = loadFileConfig();
  return {
    type: process.env.DB_TYPE || fc.type || 'sqlite',
    sqlite: {
      path:
        process.env.DB_PATH ||
        fc.sqlite?.path ||
        join(__dirname, 'database', 'aod_tracker.db'),
    },
    mssql: {
      host:      process.env.DB_HOST     || fc.mssql?.host     || 'localhost',
      port:      parseInt(process.env.DB_PORT || fc.mssql?.port || '1433', 10),
      database:  process.env.DB_NAME     || fc.mssql?.database || 'AODTracker',
      user:      process.env.DB_USER     || fc.mssql?.user     || '',
      password:  process.env.DB_PASSWORD || fc.mssql?.password || '',
      encrypt:   (process.env.DB_ENCRYPT    || String(fc.mssql?.encrypt    ?? 'false')) === 'true',
      trustCert: (process.env.DB_TRUST_CERT || String(fc.mssql?.trustCert ?? 'true'))  === 'true',
    },
  };
}

export function saveDbConfig(config) {
  try {
    const dir = dirname(CONFIG_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Slow-query telemetry ──────────────────────────────────────────────────────

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '300', 10);

function trackSlowQuery(sql, params, ms) {
  if (ms >= SLOW_QUERY_MS) {
    logger.warn('Slow query', {
      ms,
      sql: sql.slice(0, 120),
      paramCount: params?.length ?? 0,
    });
  }
}

// ─── SQLite adapter (better-sqlite3 — native, synchronous, direct file writes) ─

let sqliteDb   = null;
let sqlitePath = null;

/** Warn if the database file lives inside a known cloud-sync folder. */
const CLOUD_SYNC_PATTERNS = [
  /[\\/]Dropbox[\\/]/i,
  /[\\/]OneDrive[\\/]/i,
  /[\\/]Google Drive[\\/]/i,
  /[\\/]iCloudDrive[\\/]/i,
  /[\\/]Box[\\/]/i,
  /[\\/]Mega[\\/]/i,
  /[\\/]pCloud[\\/]/i,
];
function _warnIfCloudSync(filePath) {
  const match = CLOUD_SYNC_PATTERNS.find(re => re.test(filePath));
  if (match) {
    logger.warn(
      'SQLite database is inside a cloud-sync folder. ' +
      'This can cause conflicted-file errors when multiple devices ' +
      'are synced simultaneously. ' +
      'Recommendation: move the database outside the synced folder ' +
      '(configure DB_PATH) OR migrate to SQL Server (DB_TYPE=mssql). ' +
      'For single-machine use only, add the database folder to your ' +
      'Dropbox/OneDrive selective-sync exclusion list.',
      { path: filePath }
    );
  }
}

async function sqliteInit(config) {
  const { default: BetterSQLite } = await import('better-sqlite3');
  sqlitePath = config.path;

  const dir = dirname(sqlitePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  sqliteDb = new BetterSQLite(sqlitePath);
  // WAL mode: faster writes, readers never block writers
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('busy_timeout = 5000'); // wait up to 5s on lock contention

  _warnIfCloudSync(sqlitePath);
  logger.startup('SQLite initialised (better-sqlite3)', { path: sqlitePath });
}

// ─── MSSQL adapter (connection pool) ─────────────────────────────────────────

let mssqlPool = null;

async function mssqlInit(config) {
  let mssql;
  try {
    mssql = (await import('mssql')).default;
  } catch {
    throw new Error(
      'mssql package is not installed. ' +
      'Run "npm install mssql" inside the server/ directory.'
    );
  }

  mssqlPool = await mssql.connect({
    server:   config.host,
    port:     config.port,
    database: config.database,
    user:     config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustCert,
      enableArithAbort: true,
    },
    pool: {
      max: 20,
      min: 2,
      idleTimeoutMillis:   30_000,
      acquireTimeoutMillis: 15_000,
    },
    connectionTimeout: 15_000,
    requestTimeout:    30_000,
  });

  logger.startup('MSSQL pool created', {
    host: config.host, port: config.port, database: config.database,
    poolMax: 20,
  });
}

/** Convert positional ? to MSSQL named params (@p1, @p2 …) */
function convertParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `@p${++i}`);
}

// ─── State ────────────────────────────────────────────────────────────────────

let _type = 'sqlite';

// ─── Public init / teardown ───────────────────────────────────────────────────

export async function initDb() {
  const cfg = getDbConfig();
  _type = cfg.type;
  if (_type === 'mssql') {
    await mssqlInit(cfg.mssql);
  } else {
    await sqliteInit(cfg.sqlite);
  }
}

export async function closeDb() {
  if (_type === 'sqlite') {
    if (sqliteDb) { sqliteDb.close(); sqliteDb = null; }
  } else if (_type === 'mssql') {
    if (mssqlPool) { await mssqlPool.close(); mssqlPool = null; }
  }
}

export const dbType = () => _type;

// ─── Raw DB access (for migration code that needs direct driver access) ───────

export function getRawDb() {
  return _type === 'mssql' ? mssqlPool : sqliteDb;
}

// ─── Save / flush (no-ops for better-sqlite3 — writes are immediate) ─────────

export function saveDb() { /* better-sqlite3 writes directly to disk */ }
export function forceSaveDb() { /* better-sqlite3 writes directly to disk */ }

// ─── DDL helper (schema + migration statements) ───────────────────────────────

/**
 * exec — multi-statement DDL, SQLite only.
 * For MSSQL, execute schema-mssql.sql via a migration tool or SSMS.
 */
export function exec(sql) {
  if (_type !== 'sqlite') {
    throw new Error('exec() is SQLite-only. Use a migration script for MSSQL DDL.');
  }
  sqliteDb.exec(sql); // better-sqlite3 .exec() runs multi-statement SQL
}

// ─── Column migration helper ──────────────────────────────────────────────────

export function getTableColumns(tableName) {
  if (_type !== 'sqlite') {
    throw new Error('getTableColumns() is SQLite-only.');
  }
  return sqliteDb.pragma(`table_info(${tableName})`).map(r => r.name);
}

export function ensureColumn(tableName, columnName, columnDefSql) {
  if (_type !== 'sqlite') return; // MSSQL uses schema migrations
  const cols = getTableColumns(tableName);
  if (!cols.includes(columnName)) {
    sqliteDb.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefSql}`).run();
  }
}

// ─── Synchronous query helpers (SQLite) ──────────────────────────────────────

export function query(sql, params = []) {
  if (_type !== 'sqlite') {
    throw new Error('Synchronous query() is SQLite-only. Use queryAsync() for MSSQL.');
  }
  const t0 = Date.now();
  try {
    const normalised = params.map(p => (p === undefined ? null : p));
    const rows = sqliteDb.prepare(sql).all(normalised);
    trackSlowQuery(sql, params, Date.now() - t0);
    return rows;
  } catch (err) {
    logger.dbError('SELECT', sql.match(/FROM\s+(\w+)/i)?.[1] || '?', err);
    throw err;
  }
}

export function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function run(sql, params = []) {
  if (_type !== 'sqlite') {
    throw new Error('Synchronous run() is SQLite-only. Use runAsync() for MSSQL.');
  }
  const t0 = Date.now();
  try {
    const normalised = params.map(p => (p === undefined ? null : p));
    const info = sqliteDb.prepare(sql).run(normalised);
    trackSlowQuery(sql, params, Date.now() - t0);
    return { lastInsertRowid: info.lastInsertRowid };
  } catch (err) {
    logger.dbError(
      'WRITE',
      sql.match(/(?:INTO|UPDATE|TABLE)\s+(\w+)/i)?.[1] || '?',
      err
    );
    throw err;
  }
}

// ─── Async query helpers (MSSQL primary, SQLite falls through) ────────────────

export async function queryAsync(sql, params = []) {
  if (_type === 'sqlite') return query(sql, params);

  const t0 = Date.now();
  try {
    const mssql = (await import('mssql')).default;
    const req = mssqlPool.request();
    params.forEach((p, i) => {
      const v = p === undefined ? null : p;
      if (typeof v === 'number' && Number.isInteger(v)) req.input(`p${i + 1}`, mssql.Int,   v);
      else if (typeof v === 'number')                   req.input(`p${i + 1}`, mssql.Float, v);
      else                                              req.input(`p${i + 1}`, v);
    });
    const result = await req.query(convertParams(sql));
    trackSlowQuery(sql, params, Date.now() - t0);
    return result.recordset;
  } catch (err) {
    logger.dbError('SELECT', sql.match(/FROM\s+(\w+)/i)?.[1] || '?', err);
    throw err;
  }
}

export async function queryOneAsync(sql, params = []) {
  const rows = await queryAsync(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function runAsync(sql, params = []) {
  if (_type === 'sqlite') return run(sql, params);

  const t0 = Date.now();
  try {
    const mssql = (await import('mssql')).default;
    const req = mssqlPool.request();
    params.forEach((p, i) => {
      const v = p === undefined ? null : p;
      req.input(`p${i + 1}`, v);
    });
    // Wrap INSERTs to capture the generated identity
    let execSql = convertParams(sql);
    const isInsert = /^\s*INSERT/i.test(execSql);
    if (isInsert) {
      execSql = execSql.replace(/VALUES\s*\(/i, 'OUTPUT INSERTED.* VALUES (');
    }
    const result = await req.query(execSql);
    trackSlowQuery(sql, params, Date.now() - t0);
    const lastInsertRowid =
      (isInsert ? result.recordset?.[0] && Object.values(result.recordset[0])[0] : null) ??
      null;
    return { lastInsertRowid };
  } catch (err) {
    logger.dbError(
      'WRITE',
      sql.match(/(?:INTO|UPDATE|TABLE)\s+(\w+)/i)?.[1] || '?',
      err
    );
    throw err;
  }
}

// ─── Connection test (used by controller UI) ──────────────────────────────────

export async function testConnection(config) {
  try {
    if (config.type === 'sqlite') {
      const dir = dirname(config.sqlite.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      // Attempt a quick sql.js open to verify the file is readable
      if (existsSync(config.sqlite.path)) {
        const { default: initSqlJs } = await import('sql.js');
        const SQL = await initSqlJs();
        const testDb = new SQL.Database(readFileSync(config.sqlite.path));
        testDb.exec('SELECT 1');
        testDb.close();
      }
      return { ok: true, message: `SQLite OK — ${config.sqlite.path}` };
    }

    if (config.type === 'mssql') {
      let mssql;
      try {
        mssql = (await import('mssql')).default;
      } catch {
        return {
          ok: false,
          error: 'mssql package not installed. Run "npm install mssql" in server/.',
        };
      }
      const pool = await mssql.connect({
        server:   config.mssql.host,
        port:     config.mssql.port,
        database: config.mssql.database,
        user:     config.mssql.user,
        password: config.mssql.password,
        options: {
          encrypt: config.mssql.encrypt,
          trustServerCertificate: config.mssql.trustCert,
        },
        connectionTimeout: 5000,
        requestTimeout:    5000,
      });
      const req = pool.request();
      await req.query('SELECT @@VERSION AS ver');
      await pool.close();
      return {
        ok: true,
        message: `MSSQL OK — ${config.mssql.host}:${config.mssql.port}/${config.mssql.database}`,
      };
    }

    return { ok: false, error: `Unknown DB type: ${config.type}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
