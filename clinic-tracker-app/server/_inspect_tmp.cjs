const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const files = [
  'C:/Users/agill/Downloads/AOD Tracker V2.xlsx',
  'C:/Users/agill/Downloads/Patient Tracker V2.xlsx',
];

for (const f of files) {
  console.log('\n==================================================');
  console.log('FILE:', f);
  let wb;
  try { wb = XLSX.readFile(f); } catch (e) { console.log('  ERROR reading:', e.message); continue; }
  console.log('  Sheets:', wb.SheetNames.join(', '));
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const nonEmpty = rows.filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    console.log(`\n  --- Sheet "${sn}": ${rows.length} rows (${nonEmpty.length} non-empty) ---`);
    // find header row (first row with >3 string cells)
    for (let i = 0; i < Math.min(8, rows.length); i++) {
      console.log(`    [${i}]`, JSON.stringify((rows[i]||[]).slice(0, 30)));
    }
  }
}

console.log('\n==================================================');
console.log('LIVE DB row counts');
const dbPath = path.join(__dirname, 'database', 'aod_tracker.db');
const db = new Database(dbPath, { readonly: true });
const tables = ['Person','Employer','Clinician','AODTest','PatientEvent','NonNegativeRecord','PositiveBACRecord'];
for (const t of tables) {
  try { console.log(`  ${t}: ${db.prepare('SELECT COUNT(*) c FROM '+t).get().c}`); }
  catch(e){ console.log(`  ${t}: ERR ${e.message}`); }
}
db.close();
