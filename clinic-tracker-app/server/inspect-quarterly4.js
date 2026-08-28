import XLSX from 'xlsx';

const wb = XLSX.readFile('c:/Users/agill/Downloads/AOD Quaterly Contractors Report v2.xlsx');

// Focus on the summary/results sheets that contain the report VALUES
const sheets = [
  'tblSCJVResults',
  'AOD_SCJV_SelectedQuarter_Unique',
  'AOD_SCJV_SelectedQuarter_Totals',
  'AOD_SCJV_SelectedQuarter_Result',
  'AOD_SCJV_SelectedQuarter_Re (2)',
  'AOD_SCJV_SelectedQuarter_Un (2)',
];

for (const sheetName of sheets) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`\n[NOT FOUND] "${sheetName}"`); continue; }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SHEET: ${sheetName}`);
  console.log('='.repeat(70));
  rows.forEach((row, i) => {
    if (row.some(c => c !== '')) {
      console.log(`  ${JSON.stringify(row)}`);
    }
  });
}
