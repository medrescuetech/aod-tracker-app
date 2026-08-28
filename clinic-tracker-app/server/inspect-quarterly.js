import XLSX from 'xlsx';

const wb = XLSX.readFile('c:/Users/agill/Downloads/AOD Quaterly Contractors Report v2.xlsx');

const TARGET = 'Sheet1'; // Main report sheet

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  // Use sheet_to_json for structured data, but for main report use raw cell refs
  if (sheetName === TARGET) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SHEET: ${sheetName} (RAW CELL DUMP)`);
    console.log('='.repeat(60));
    // Dump all non-empty cells with their addresses
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let r = range.s.r; r <= Math.min(range.e.r, 200); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({r, c});
        const cell = ws[addr];
        if (cell && cell.v !== undefined && cell.v !== '') {
          console.log(`  ${addr}: ${JSON.stringify(cell.v)}`);
        }
      }
    }
  } else {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SHEET: ${sheetName}`);
    console.log('='.repeat(60));
    rows.forEach((row, i) => {
      if (row.some(c => c !== '')) {
        console.log(`Row ${String(i+1).padStart(3)}: ${JSON.stringify(row)}`);
      }
    });
  }
}
