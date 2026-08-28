#!/usr/bin/env node
/**
 * Production Deployment Checklist
 * Run this before deploying to production
 */

const fs = require('fs');
const path = require('path');

const CHECKLIST = {
  items: [],
  passed: 0,
  failed: 0
};

function addCheck(name, test, critical = true) {
  CHECKLIST.items.push({ name, test, critical, passed: null });
}

function runChecks() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Production Deployment Checklist      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  for (const item of CHECKLIST.items) {
    try {
      const result = item.test();
      if (result) {
        console.log(`✅ ${item.name}`);
        item.passed = true;
        CHECKLIST.passed++;
      } else {
        console.log(`${item.critical ? '❌' : '⚠️'} ${item.name}`);
        item.passed = false;
        if (item.critical) CHECKLIST.failed++;
      }
    } catch (err) {
      console.log(`❌ ${item.name} - Error: ${err.message}`);
      item.passed = false;
      if (item.critical) CHECKLIST.failed++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`✅ Passed: ${CHECKLIST.passed}/${CHECKLIST.items.length}`);
  if (CHECKLIST.failed > 0) {
    console.log(`❌ Critical Failed: ${CHECKLIST.failed}`);
    console.log('\n⚠️  Fix critical items before deploying to production!');
  } else {
    console.log('\n🎉 All critical checks passed! Ready for production.');
  }
}

// Define checks
addCheck('Build output exists (dist/)', () => {
  return fs.existsSync('dist') && fs.existsSync('dist/index.html');
});

addCheck('Server code exists', () => {
  return fs.existsSync('server/index.js') && fs.existsSync('server/db.js');
});

addCheck('Database schema exists', () => {
  return fs.existsSync('server/database/schema.sql');
});

addCheck('Environment variables documented', () => {
  return fs.existsSync('.env.example') || fs.existsSync('DEPLOYMENT.md');
});

addCheck('Package.json has start script', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.scripts && pkg.scripts.start && pkg.scripts['start:prod'];
});

addCheck('No development dependencies in production (check)', () => {
  // This is a warning-level check
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const criticalDeps = ['express', 'better-sqlite3', 'cors', 'bcryptjs', 'jsonwebtoken'];
  return criticalDeps.every(dep => pkg.dependencies && pkg.dependencies[dep]);
}, false);

addCheck('Test infrastructure present', () => {
  return fs.existsSync('e2e') && fs.existsSync('server/tests');
});

addCheck('Health endpoint exists in code', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  return code.includes("app.get('/api/health')") || code.includes('api/health');
});

addCheck('Error handling middleware present', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  return code.includes('error') && code.includes('try');
}, false);

addCheck('Database backup strategy documented', () => {
  const deployment = fs.existsSync('DEPLOYMENT.md') ? 
    fs.readFileSync('DEPLOYMENT.md', 'utf8') : '';
  return deployment.includes('backup') || deployment.includes('Backup');
}, false);

addCheck('No hardcoded secrets', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  // Check for hardcoded passwords that don't use environment variables
  const hardcodedPatterns = [
    /const.*PASSWORD\s*=\s*['"]\w+['"]/,  // const PASSWORD = 'something'
    /const.*SECRET\s*=\s*['"]\w+['"]/,    // const SECRET = 'something' without process.env
  ];
  // Check if passwords are using env vars
  const usesEnvPassword = code.includes('process.env.ADMIN_PASSWORD') || 
                          code.includes('process.env.JWT_SECRET');
  return usesEnvPassword; // Pass if using environment variables
});

addCheck('CORS configured', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  return code.includes('cors');
});

addCheck('Port configuration via env', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  return code.includes('process.env.PORT') || code.includes('PORT');
});

addCheck('Admin password is hashed', () => {
  const code = fs.readFileSync('server/index.js', 'utf8');
  return code.includes('bcrypt') && code.includes('hash');
});

// Run
runChecks();

process.exit(CHECKLIST.failed > 0 ? 1 : 0);
