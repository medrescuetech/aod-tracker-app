#!/usr/bin/env node
// Deployment verification script
// Run: node verify-deploy.mjs

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const errors = [];
const warnings = [];

console.log('🔍 Verifying deployment readiness...\n');

// 1. Check package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

console.log('📦 package.json checks:');
if (!pkg.name) errors.push('Missing "name" field');
else console.log('  ✓ name:', pkg.name);

if (!pkg.version) errors.push('Missing "version" field');
else console.log('  ✓ version:', pkg.version);

if (!pkg.main) errors.push('Missing "main" field');
else console.log('  ✓ main:', pkg.main);

if (!pkg.scripts?.build) errors.push('Missing "build" script');
else console.log('  ✓ build script:', pkg.scripts.build);

if (!pkg.scripts?.start) errors.push('Missing "start" script');
else console.log('  ✓ start script:', pkg.scripts.start);

// 2. Check server dependencies are in root
const serverPkg = JSON.parse(readFileSync('server/package.json', 'utf8'));
const rootDeps = pkg.dependencies || {};
const serverDeps = serverPkg.dependencies || {};

console.log('\n📋 Server dependencies check:');
let missingDeps = 0;
for (const [dep, version] of Object.entries(serverDeps)) {
  if (!rootDeps[dep]) {
    errors.push(`Server dependency "${dep}" missing from root package.json`);
    missingDeps++;
  }
}
if (missingDeps === 0) console.log('  ✓ All server dependencies present in root');

// 3. Check server/index.js uses PORT
const serverIndex = readFileSync('server/index.js', 'utf8');
console.log('\n🔌 Server configuration check:');
if (serverIndex.includes('process.env.PORT')) console.log('  ✓ Uses process.env.PORT');
else errors.push('Server does not use process.env.PORT');

if (serverIndex.includes('process.env.HOST')) console.log('  ✓ Uses process.env.HOST');
else warnings.push('Server does not use process.env.HOST');

if (serverIndex.includes('process.env.JWT_SECRET')) console.log('  ✓ Uses process.env.JWT_SECRET');
else warnings.push('Server does not use process.env.JWT_SECRET');

// 4. Check .gitignore excludes large files
const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
console.log('\n🚫 .gitignore check:');
const requiredIgnores = ['node_modules/', 'dist/', '*.db'];
let missingIgnores = 0;
for (const pattern of requiredIgnores) {
  if (!gitignore.includes(pattern)) {
    errors.push(`.gitignore missing "${pattern}"`);
    missingIgnores++;
  }
}
if (missingIgnores === 0) console.log('  ✓ Required patterns excluded');

// 5. Summary
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed! Ready for deployment.');
} else {
  if (errors.length > 0) {
    console.log(`❌ ${errors.length} error(s):`);
    errors.forEach(e => console.log('   -', e));
  }
  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} warning(s):`);
    warnings.forEach(w => console.log('   -', w));
  }
}

process.exit(errors.length > 0 ? 1 : 0);
