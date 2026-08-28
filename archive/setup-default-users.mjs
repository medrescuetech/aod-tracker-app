/**
 * Setup Default Users Script
 * Creates 3 default users: admin, supervisor, and user
 * Run with: node setup-default-users.mjs
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, 'server', 'database');
const DB_PATH = join(DB_DIR, 'clinic.db');

// Ensure DB directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Default user credentials
const DEFAULT_USERS = [
  {
    username: 'admin',
    password: 'Admin123!',
    firstName: 'System',
    lastName: 'Administrator',
    email: 'admin@clinic.local',
    role: 'admin',
    uniqueId: 'ADMIN001',
    isClinician: false,
    displayName: 'Administrator'
  },
  {
    username: 'supervisor',
    password: 'Super123!',
    firstName: 'Test',
    lastName: 'Supervisor',
    email: 'supervisor@clinic.local',
    role: 'supervisor',
    uniqueId: 'SUPER001',
    isClinician: true,
    credentials: 'RN, BAT Certified',
    displayName: 'T Supervisor'
  },
  {
    username: 'user',
    password: 'User123!',
    firstName: 'Test',
    lastName: 'User',
    email: 'user@clinic.local',
    role: 'user',
    uniqueId: 'USER001',
    isClinician: true,
    credentials: 'BAT Certified',
    displayName: 'T User'
  }
];

function setupUsers() {
  console.log('Setting up default users...\n');

  // Get role IDs
  const roles = db.prepare('SELECT RoleID, Name FROM Role').all();
  const roleMap = {};
  roles.forEach(r => {
    roleMap[r.Name.toLowerCase()] = r.RoleID;
  });

  console.log('Available roles:', roleMap);

  const results = [];

  for (const user of DEFAULT_USERS) {
    // Check if user already exists
    const existing = db.prepare('SELECT UserID, Username FROM User WHERE Username = ?').get(user.username);

    if (existing) {
      console.log(`User "${user.username}" already exists (ID: ${existing.UserID})`);
      results.push({ ...user, status: 'exists', id: existing.UserID });
      continue;
    }

    // Create user
    const passwordHash = bcrypt.hashSync(user.password, 10);
    const fullName = `${user.firstName} ${user.lastName}`;
    const displayName = user.displayName || `${user.firstName.charAt(0)} ${user.lastName}`;
    const roleId = roleMap[user.role.toLowerCase()];

    if (!roleId) {
      console.error(`Role "${user.role}" not found!`);
      results.push({ ...user, status: 'error', error: 'Role not found' });
      continue;
    }

    try {
      const result = db.prepare(`
        INSERT INTO User (Username, PasswordHash, FullName, FirstName, LastName, Email,
                         UniqueID, RoleID, IsClinician, Credentials, DisplayName, IsActive, CreatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      `).run(
        user.username,
        passwordHash,
        fullName,
        user.firstName,
        user.lastName,
        user.email,
        user.uniqueId,
        roleId,
        user.isClinician ? 1 : 0,
        user.credentials || null,
        displayName
      );

      console.log(`✓ Created user "${user.username}" (ID: ${result.lastInsertRowid})`);
      results.push({ ...user, status: 'created', id: result.lastInsertRowid });
    } catch (err) {
      console.error(`✗ Failed to create "${user.username}": ${err.message}`);
      results.push({ ...user, status: 'error', error: err.message });
    }
  }

  db.close();
  console.log('\nSetup complete!');
  return results;
}

const results = setupUsers();

// Print summary
console.log('\n=== DEFAULT USERS SUMMARY ===');
results.forEach(u => {
  console.log(`\n${u.role.toUpperCase()} USER:`);
  console.log(`  Username: ${u.username}`);
  console.log(`  Password: ${u.password}`);
  console.log(`  Name: ${u.firstName} ${u.lastName}`);
  console.log(`  Display Name: ${u.displayName}`);
  console.log(`  Unique ID: ${u.uniqueId}`);
  console.log(`  Email: ${u.email}`);
  console.log(`  Status: ${u.status}${u.id ? ` (ID: ${u.id})` : ''}`);
});

console.log('\n=================================');
console.log('You can now log in with any of these accounts.');
console.log('=================================\n');
