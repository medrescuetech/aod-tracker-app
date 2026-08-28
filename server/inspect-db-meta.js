import { initDb, query, closeDb } from './db.js';
await initDb();
console.log('TestTypes:', JSON.stringify(query('SELECT * FROM TestType'), null, 2));
console.log('ResultClassification:', JSON.stringify(query('SELECT * FROM ResultClassification'), null, 2));
console.log('Employers:', JSON.stringify(query('SELECT EmployerID, CompanyName FROM Employer ORDER BY CompanyName LIMIT 30'), null, 2));
// Dump AODTest columns
console.log('AODTest columns:', JSON.stringify(query("PRAGMA table_info(AODTest)").map(c => c.name), null, 2));
// Sample test
console.log('Sample test:', JSON.stringify(query('SELECT * FROM AODTest LIMIT 1'), null, 2));
await closeDb();
