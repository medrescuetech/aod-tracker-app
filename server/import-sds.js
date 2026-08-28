/**
 * SDS Chemical Register Import Script
 * Import chemicals from Excel spreadsheet
 * 
 * Usage: node import-sds.js <path-to-excel> [--dry-run]
 */

import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize DB
import { initDb, queryOne, run, closeDb, query } from './db.js';

const dryRun = process.argv.includes('--dry-run');
const filePath = process.argv.find((_, i, arr) => i > 0 && !arr[i].startsWith('--') && arr[i].endsWith('.xlsx'));

if (!filePath) {
  console.error('Usage: node import-sds.js <path-to-chemical_register.xlsx> [--dry-run]');
  process.exit(1);
}

console.log(`Importing from: ${filePath}`);
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE IMPORT'}`);

// Main async function
async function main() {
// Initialize DB first
console.log('Initializing database...');
await initDb();
console.log('Database ready.\n');

// Read Excel
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

console.log(`\nFound ${rows.length} rows total`);

// Header mapping
const headers = rows[0];
console.log('Headers:', headers);

// Find column indices
const colIdx = (name) => {
  const idx = headers.findIndex(h => h?.toString().toLowerCase().trim() === name.toLowerCase());
  return idx >= 0 ? idx : headers.findIndex(h => h?.toString().toLowerCase().includes(name.toLowerCase()));
};

const mapping = {
  code: colIdx('ID') ?? colIdx('Code'),
  productName: colIdx('Product Name'),
  location: colIdx('Location'),
  quantity: colIdx('Quantity'),
  containerSize: colIdx('Container Size'),
  totalQuantity: colIdx('Total Quantity'),
  unitSize: colIdx('Unit Size'),
  containerType: colIdx('Container Type'),
  manufacturer: colIdx('Manufacturer'),
  dgClass: colIdx('DG Class') ?? colIdx('Class'),
  unNumber: colIdx('UN Number'),
  ghs: colIdx('GHS Classification'),
  signalWord: colIdx('Signal Word'),
  storage: colIdx('Storage Requirements'),
  status: colIdx('Status'),
  notes: colIdx('Notes'),
  sdsDate: colIdx('SDS Date') ?? colIdx('SDS Issue Date'),
  reviewDate: colIdx('Review Date') ?? colIdx('SDS Review Due'),
  photoFile: colIdx('Photo File'),
  sdsFile: colIdx('SDS File')
};

console.log('\nColumn mapping:', mapping);

// Parse date from Excel (handles both Excel serial and string dates)
const parseDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel serial date
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + val * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    // Try parsing
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
};

// Parse number
const parseNum = (val) => {
  if (!val) return null;
  const n = parseInt(val.toString().replace(/[^0-9]/g, ''));
  return isNaN(n) ? null : n;
};

// Process rows
const dataRows = rows.slice(1).filter(r => r[mapping.code] || r[mapping.productName]);
console.log(`Data rows to process: ${dataRows.length}\n`);

let imported = 0;
let skipped = 0;
let errors = [];

for (const row of dataRows) {
  const code = row[mapping.code]?.toString().trim();
  const productName = row[mapping.productName]?.toString().trim();
  
  if (!code || !productName) {
    console.log('Skipping row - missing code or name');
    skipped++;
    continue;
  }

  // Check if exists
  const existing = queryOne('SELECT ChemicalID FROM Chemical WHERE Code = ?', [code]);
  if (existing) {
    console.log(`[SKIP] Chemical ${code} already exists (ID: ${existing.ChemicalID})`);
    skipped++;
    continue;
  }

  const chemical = {
    Code: code,
    ProductName: productName,
    Location: row[mapping.location]?.toString().trim() || null,
    Quantity: parseNum(row[mapping.quantity]),
    ContainerSize: row[mapping.containerSize]?.toString().trim() || null,
    TotalQuantity: row[mapping.totalQuantity]?.toString().trim() || null,
    UnitSize: row[mapping.unitSize]?.toString().trim() || null,
    ContainerType: row[mapping.containerType]?.toString().trim() || null,
    Manufacturer: row[mapping.manufacturer]?.toString().trim() || null,
    DGClass: row[mapping.dgClass]?.toString().trim() || null,
    UNNumber: row[mapping.unNumber]?.toString().trim() || null,
    GHSClassification: row[mapping.ghs]?.toString().trim() || null,
    SignalWord: row[mapping.signalWord]?.toString().trim() || null,
    StorageRequirements: row[mapping.storage]?.toString().trim() || null,
    Status: row[mapping.status]?.toString().trim() || 'Active',
    Notes: row[mapping.notes]?.toString().trim() || null,
    SDSIssueDate: parseDate(row[mapping.sdsDate]),
    SDSReviewDue: parseDate(row[mapping.reviewDate])
  };

  console.log(`[${dryRun ? 'DRY' : 'IMPORT'}] ${code}: ${productName}`);

  if (!dryRun) {
    try {
      const cols = Object.keys(chemical).filter(k => chemical[k] !== null);
      const vals = cols.map(c => chemical[c]);
      const placeholders = cols.map(() => '?').join(', ');
      
      const sql = `INSERT INTO Chemical (${cols.join(', ')}, CreatedAt) VALUES (${placeholders}, CURRENT_TIMESTAMP)`;
      run(sql, vals);
      imported++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      errors.push({ code, error: err.message });
    }
  } else {
    imported++;
  }
}

console.log(`\n========================================`);
console.log(`Import complete:`);
console.log(`  Processed: ${dataRows.length}`);
console.log(`  Imported: ${imported}`);
console.log(`  Skipped (duplicates): ${skipped}`);
console.log(`  Errors: ${errors.length}`);
console.log(`========================================`);

if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach(e => console.log(`  - ${e.code}: ${e.error}`));
}

// Close DB
await closeDb();
process.exit(errors.length > 0 ? 1 : 0);
}

// Run main
main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
