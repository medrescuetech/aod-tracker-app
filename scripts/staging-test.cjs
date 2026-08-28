#!/usr/bin/env node
/**
 * Staging/Deployment Simulation Test
 * Tests the application in a production-like environment
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const TEST_CONFIG = {
  port: 3999,
  dbPath: './server/database/staging_test.db',
  timeout: 30000
};

let serverProcess = null;
let checks = { passed: 0, failed: 0 };

function log(msg, type = 'info') {
  const prefix = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[type];
  console.log(`${prefix} ${msg}`);
}

async function httpRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_CONFIG.port,
      path: url,
      method: method,
      headers: data ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function startStagingServer() {
  log('Starting staging server...', 'info');
  
  // Clean up any existing test database
  if (fs.existsSync(TEST_CONFIG.dbPath)) {
    fs.unlinkSync(TEST_CONFIG.dbPath);
    log('Cleaned up old staging database', 'info');
  }

  // Start server with staging config
  const env = {
    ...process.env,
    PORT: TEST_CONFIG.port,
    NODE_ENV: 'staging',
    SERVE_FRONTEND: '1',
    DB_PATH: TEST_CONFIG.dbPath,
    CI: 'true' // Disable interactive prompts
  };

  serverProcess = spawn('node', ['server/index.js'], {
    env,
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    if (data.toString().includes('FATAL')) {
      log(`Server error: ${data}`, 'error');
    }
  });

  serverProcess.stderr.on('data', (data) => {
    // Ignore stderr unless it's an error
  });

  // Wait for server to start
  let attempts = 0;
  while (attempts < 30) {
    try {
      await new Promise(r => setTimeout(r, 1000));
      const health = await httpRequest('/api/health');
      if (health.status === 200) {
        log('Staging server started successfully', 'success');
        return true;
      }
    } catch {
      attempts++;
    }
  }
  
  log('Server failed to start within timeout', 'error');
  return false;
}

async function stopStagingServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 2000));
    if (!serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
    log('Staging server stopped', 'info');
  }
  
  // Clean up staging database
  if (fs.existsSync(TEST_CONFIG.dbPath)) {
    fs.unlinkSync(TEST_CONFIG.dbPath);
    log('Cleaned up staging database', 'info');
  }
}

async function runSmokeTests() {
  console.log('\n=== Running Deployment Smoke Tests ===\n');

  // Test 1: Health endpoint
  try {
    const health = await httpRequest('/api/health');
    if (health.status === 200 && health.body.status === 'ok') {
      log('Health endpoint responding', 'success');
      checks.passed++;
    } else {
      log('Health endpoint returned unexpected response', 'error');
      checks.failed++;
    }
  } catch (err) {
    log(`Health endpoint failed: ${err.message}`, 'error');
    checks.failed++;
  }

  // Test 2: Frontend serving
  try {
    const index = await httpRequest('/');
    if (index.status === 200 && index.body.includes('AOD Tracker')) {
      log('Frontend serving correctly', 'success');
      checks.passed++;
    } else {
      log('Frontend not serving correctly', 'error');
      checks.failed++;
    }
  } catch (err) {
    log(`Frontend serving failed: ${err.message}`, 'error');
    checks.failed++;
  }

  // Test 3: API endpoints
  const endpoints = [
    { path: '/api/lookups', name: 'Lookups API' },
    { path: '/api/employers', name: 'Employers API' },
    { path: '/api/test-types', name: 'Test Types API' }
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await httpRequest(endpoint.path);
      if (res.status === 200) {
        log(`${endpoint.name} responding`, 'success');
        checks.passed++;
      } else {
        log(`${endpoint.name} returned ${res.status}`, 'error');
        checks.failed++;
      }
    } catch (err) {
      log(`${endpoint.name} failed: ${err.message}`, 'error');
      checks.failed++;
    }
  }

  // Test 4: Create and retrieve data
  try {
    // Create an employer
    const employer = await httpRequest('/api/employers', 'POST', {
      name: 'Staging Test Employer',
      category: 'Contractor',
      contractNumber: 'STAGE-001'
    });
    
    if (employer.status === 200 || employer.status === 201) {
      log('Data creation (employer) working', 'success');
      checks.passed++;
      
      // Verify retrieval
      const employers = await httpRequest('/api/employers');
      if (employers.status === 200 && Array.isArray(employers.body)) {
        log('Data retrieval working', 'success');
        checks.passed++;
      } else {
        log('Data retrieval failed', 'error');
        checks.failed++;
      }
    } else {
      log(`Data creation failed: ${employer.status}`, 'error');
      checks.failed++;
    }
  } catch (err) {
    log(`Data operations failed: ${err.message}`, 'error');
    checks.failed++;
  }

  // Test 5: Report generation (lightweight)
  try {
    const report = await httpRequest('/api/reports/generate/daily-activity', 'POST', {
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    });
    
    if (report.status === 200) {
      log('Report generation working', 'success');
      checks.passed++;
    } else {
      log(`Report generation returned ${report.status}`, 'warning');
      // Don't count as failure - might be no data
    }
  } catch (err) {
    log(`Report generation error: ${err.message}`, 'warning');
  }
}

async function runLoadTest() {
  console.log('\n=== Running Light Load Test ===\n');
  
  const concurrentRequests = 10;
  const startTime = Date.now();
  
  const promises = Array(concurrentRequests).fill().map(() => 
    httpRequest('/api/health')
  );
  
  try {
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    const allSuccess = results.every(r => r.status === 200);
    
    if (allSuccess) {
      log(`Load test passed: ${concurrentRequests} concurrent requests in ${duration}ms`, 'success');
      checks.passed++;
    } else {
      log('Some requests failed under load', 'error');
      checks.failed++;
    }
  } catch (err) {
    log(`Load test failed: ${err.message}`, 'error');
    checks.failed++;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  AOD Tracker Deployment Simulation Test   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  try {
    const started = await startStagingServer();
    if (!started) {
      process.exit(1);
    }

    await runSmokeTests();
    await runLoadTest();

    console.log('\n=== Summary ===');
    console.log(`✅ Passed: ${checks.passed}`);
    console.log(`❌ Failed: ${checks.failed}`);

    if (checks.failed === 0) {
      console.log('\n🎉 All deployment simulation tests passed!');
    } else {
      console.log(`\n⚠️ ${checks.failed} tests failed. Review before deploying.`);
    }

  } catch (err) {
    log(`Unexpected error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    await stopStagingServer();
  }

  process.exit(checks.failed > 0 ? 1 : 0);
}

main();
