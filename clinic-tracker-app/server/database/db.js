import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = new Database(join(__dirname, 'aod_tracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  
  // Create default admin user if none exists
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM User WHERE Username = ?').get('admin');
  if (adminExists.count === 0) {
    const bcrypt = await import('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    const adminRole = db.prepare('SELECT RoleID FROM Role WHERE Name = ?').get('Administrator');
    
    db.prepare(`
      INSERT INTO User (Username, PasswordHash, FullName, Email, RoleID)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', hash, 'System Administrator', 'admin@example.com', adminRole?.RoleID || 1);
  }
  
  console.log('Database initialized successfully');
}

export function generateTestNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const todayPrefix = `AOD-${year}${month}${day}`;
  const lastTest = db.prepare(`
    SELECT TestNumber FROM AODTest 
    WHERE TestNumber LIKE ? 
    ORDER BY TestNumber DESC LIMIT 1
  `).get(`${todayPrefix}%`);
  
  let sequence = 1;
  if (lastTest) {
    const lastSeq = parseInt(lastTest.TestNumber.split('-').pop(), 10);
    sequence = lastSeq + 1;
  }
  
  return `${todayPrefix}-${String(sequence).padStart(3, '0')}`;
}

export default db;
