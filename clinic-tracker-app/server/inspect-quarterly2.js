import XLSX from 'xlsx';

const wb = XLSX.readFile('c:/Users/agill/Downloads/AOD Quaterly Contractors Report v2.xlsx');

// Inspect the main summary sheet (Sheet1 / NewReportFormat2026)
for (const sheetName of ['Sheet1', 'NewReportFormat2026', 'Quarter Results']) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`Sheet "${sheetName}" not found`); continue; }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SHEET: ${sheetName}`);
  console.log('='.repeat(70));

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= Math.min(range.e.r, 150); r++) {
    const rowCells = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      const cell = ws[addr];
      if (cell && cell.v !== undefined && cell.v !== '') {
        rowCells.push(`${addr}=${JSON.stringify(cell.v)}`);
      }
    }
    if (rowCells.length > 0) {
      console.log(`  Row ${r+1}: ${rowCells.join(' | ')}`);
    }
  }
}
