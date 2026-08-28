/**
 * import-cli.js — Command-line wrapper for the idempotent Excel importers.
 *
 * Usage:
 *   node import-cli.js aod      "C:/path/AOD Tracker V2.xlsx"     [--dry-run]
 *   node import-cli.js patient  "C:/path/Patient Tracker V2.xlsx" [--dry-run]
 *
 * Honours DB_PATH / DB_TYPE env vars (same config the server uses), so it
 * writes to the SAME live database the app is using.
 *
 * Re-running is safe: only missing rows are inserted (dedup).
 */

import { initDb, closeDb, getDbConfig } from './db.js';
import { importAodWorkbook, importPatientWorkbook } from './importers.js';

const [, , kind, file, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!kind || !file || !['aod', 'patient'].includes(kind)) {
  console.error('Usage: node import-cli.js <aod|patient> <file.xlsx> [--dry-run]');
  process.exit(1);
}

(async () => {
  await initDb();
  const cfg = getDbConfig();
  console.log(`DB     : ${cfg.type === 'sqlite' ? cfg.sqlite.path : cfg.mssql.host + '/' + cfg.mssql.database}`);
  console.log(`File   : ${file}`);
  console.log(`Mode   : ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log('Importing…\n');

  const stats = kind === 'aod'
    ? importAodWorkbook(file, { dryRun })
    : importPatientWorkbook(file, { dryRun });

  console.log('────────────────────────────────');
  console.log(`Sheet      : ${stats.sheet}`);
  console.log(`Processed  : ${stats.totalRows}`);
  console.log(`Inserted   : ${stats.inserted}`);
  console.log(`Duplicates : ${stats.duplicates} (already in DB — skipped)`);
  console.log(`Blank/skip : ${stats.skipped}`);
  console.log(`Errors     : ${stats.errors}`);
  console.log(`Created    : ${stats.created.persons} persons, ${stats.created.employers} employers, ${stats.created.clinicians} clinicians`);
  if (stats.errorSamples.length) {
    console.log('\nFirst errors:');
    stats.errorSamples.forEach(e => console.log(`  row ${e.row}: ${e.error}`));
  }
  console.log('────────────────────────────────');

  await closeDb();
})().catch(err => { console.error('Import failed:', err); process.exit(1); });
