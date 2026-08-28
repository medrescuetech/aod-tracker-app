// One-time script to import employers from AOD Tracker Excel
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const SCJV_PATTERNS = [/saipem/i, /clough/i, /scjv/i];

function classifyEmployer(name) {
  if (!name) return 'Contractor';
  for (const pattern of SCJV_PATTERNS) {
    if (pattern.test(name)) return 'SCJV Staff';
  }
  return 'Contractor';
}

// Read Excel file
const workbook = XLSX.readFile('C:/Users/agill/OneDrive/AOD tracker/AOD Tracker V2.xlsx');
const ws = workbook.Sheets['Data'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Extract unique employers
const employers = new Set();
data.slice(1).forEach(row => {
  if (row[4] && typeof row[4] === 'string') {
    employers.add(row[4].trim());
  }
});

// Output as JSON for API import
const result = [...employers].sort().map(name => ({
  name,
  category: classifyEmployer(name)
}));

console.log('Employers to import:', result.length);
console.log('\nSCJV Staff:');
result.filter(e => e.category === 'SCJV Staff').forEach(e => console.log('  -', e.name));
console.log('\nContractors:');
result.filter(e => e.category === 'Contractor').forEach(e => console.log('  -', e.name));

// Make API call
const response = await fetch('http://localhost:3001/api/employers/bulk-import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ employers: [...employers] })
});

const json = await response.json();
console.log('\nAPI Response:', json);
