#!/usr/bin/env node
/**
 * Pre-deployment verification script
 * Checks critical functionality before deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHECKS = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function log(message, type = 'info') {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  }[type];
  console.log(`${prefix} ${message}`);
}

function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`${description}: Found`, 'success');
    CHECKS.passed++;
    return true;
  } else {
    log(`${description}: Missing (${filePath})`, 'error');
    CHECKS.failed++;
    return false;
  }
}

function checkDirectoryExists(dirPath, description) {
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    const files = fs.readdirSync(dirPath);
    log(`${description}: ${files.length} files`, 'success');
    CHECKS.passed++;
    return true;
  } else {
    log(`${description}: Missing (${dirPath})`, 'error');
    CHECKS.failed++;
    return false;
  }
}

console.log('=== AOD Tracker Pre-Deployment Checklist ===\n');

// 1. Check critical files
console.log('📁 Checking critical files...');
checkFileExists('package.json', 'Package config');
checkFileExists('server/index.js', 'Server entry point');
checkFileExists('dist/index.html', 'Built frontend');
checkFileExists('server/db.js', 'Database module');

// 2. Check test infrastructure
console.log('\n🧪 Checking test infrastructure...');
checkFileExists('playwright.config.ts', 'Playwright config');
checkFileExists('jest.config.cjs', 'Jest config');
checkDirectoryExists('e2e', 'E2E tests directory');
checkDirectoryExists('server/tests', 'Unit tests directory');

// 3. Check report generation functions
console.log('\n📊 Checking report generation...');
const serverCode = fs.readFileSync('server/index.js', 'utf8');
const reportFunctions = [
  'generateQuarterResults',
  'generateSCJVEmployeesSummary',
  'generateForCauseReport',
  'generatePosBacReport',
  'generateQuarterNonNegs',
  'generatePendingOtherReport',
  'generateUniqueEmployeesReport',
  'generateDailyActivityReport',
  'generateWeeklyEventReport',
  'queryTCWeeklySummary'
];

reportFunctions.forEach(func => {
  if (serverCode.includes(`function ${func}`)) {
    log(`Report function ${func}: Found`, 'success');
    CHECKS.passed++;
  } else {
    log(`Report function ${func}: Missing`, 'error');
    CHECKS.failed++;
  }
});

// 4. Check BAC logic
console.log('\n🍺 Checking BAC workplace logic...');
if (serverCode.includes('BAC > 0') || serverCode.includes('bacValue > 0')) {
  log('BAC > 0 Positive logic: Found', 'success');
  CHECKS.passed++;
} else {
  log('BAC > 0 Positive logic: Missing', 'error');
  CHECKS.failed++;
}

if (serverCode.includes('effectiveBAC > 0')) {
  log('effectiveBAC calculation: Found', 'success');
  CHECKS.passed++;
} else {
  log('effectiveBAC calculation: Missing', 'warning');
  CHECKS.warnings++;
}

// 5. Check database tables (schema is in database/schema.sql and migrations in index.js)
console.log('\n💾 Checking database schema...');
let schemaCode = '';
try {
  schemaCode = fs.readFileSync('server/database/schema.sql', 'utf8');
} catch (e) {
  log('Could not read schema.sql', 'warning');
}
const dbCode = serverCode + '\n' + schemaCode;
const requiredTables = [
  'Employer',
  'Person',
  'AODTest',
  'PatientEvent',
  'NonNegativeRecord',
  'PendingResult',
  'TestType'
];

requiredTables.forEach(table => {
  if (dbCode.includes(`CREATE TABLE ${table}`) || dbCode.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    log(`Table ${table}: Found`, 'success');
    CHECKS.passed++;
  } else {
    log(`Table ${table}: Missing`, 'error');
    CHECKS.failed++;
  }
});

// 6. Check API endpoints
console.log('\n🌐 Checking API endpoints...');
const endpoints = [
  { path: '/api/reports/generate', method: 'post', pattern: '/api/reports/generate/:reportId' },
  { path: '/api/reports/quarterly', method: 'get' },
  { path: '/api/reports/weekly-events', method: 'get' },
  { path: '/api/reports/tc-site-weekly', method: 'get' },
  { path: '/api/aod-tests', method: 'post' },
  { path: '/api/patient-events', method: 'post' },
  { path: '/api/employers', method: 'get' }
];

endpoints.forEach(endpoint => {
  const searchPatterns = [
    `app.${endpoint.method}('${endpoint.path}'`,
    `app.${endpoint.method}("${endpoint.path}"`,
  ];
  if (endpoint.pattern) {
    searchPatterns.push(`app.${endpoint.method}('${endpoint.pattern}'`);
    searchPatterns.push(`app.${endpoint.method}("${endpoint.pattern}"`);
  }
  
  const found = searchPatterns.some(pattern => serverCode.includes(pattern));
  
  if (found) {
    log(`Endpoint ${endpoint.path}: Found`, 'success');
    CHECKS.passed++;
  } else {
    log(`Endpoint ${endpoint.path}: Missing`, 'error');
    CHECKS.failed++;
  }
});

// 7. Summary
console.log('\n=== Summary ===');
console.log(`✅ Passed: ${CHECKS.passed}`);
console.log(`❌ Failed: ${CHECKS.failed}`);
console.log(`⚠️ Warnings: ${CHECKS.warnings}`);

if (CHECKS.failed === 0) {
  console.log('\n🎉 All critical checks passed! Ready for deployment.');
  process.exit(0);
} else {
  console.log(`\n⚠️ ${CHECKS.failed} critical checks failed. Please fix before deploying.`);
  process.exit(1);
}
