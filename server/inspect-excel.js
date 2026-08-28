import XLSX from 'xlsx';

const filePath = 'C:/Users/agill/OneDrive/AOD tracker/AOD Tracker V2(1).xlsx';
const wb = XLSX.readFile(filePath);

// Check the Input sheet - this is where actual data entry happens
const inputWs = wb.Sheets['Input'];
const inputData = XLSX.utils.sheet_to_json(inputWs, { header: 1 });

console.log('Input sheet total rows:', inputData.length);

// Find the header row
let headerRowIdx = -1;
for (let i = 0; i < Math.min(10, inputData.length); i++) {
  const row = inputData[i];
  if (row && row.includes('Date') && row.includes('Name')) {
    headerRowIdx = i;
    console.log(`\nHeader row found at index ${i}:`, JSON.stringify(row));
    break;
  }
}

// Show some data rows
if (headerRowIdx >= 0) {
  console.log('\nData rows:');
  for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 6, inputData.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(inputData[i]));
  }
}

// Count non-empty rows
let nonEmpty = 0;
for (const row of inputData) {
  if (row && row[0] && row[1]) nonEmpty++;
}
console.log(`\nNon-empty rows (with date and name): ${nonEmpty}`);
