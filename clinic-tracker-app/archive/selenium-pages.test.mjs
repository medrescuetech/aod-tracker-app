/**
 * Selenium headed smoke test — launches Vite dev server + Express API,
 * then visits every page and reports load errors / console errors.
 *
 * Run:  node selenium-pages.test.mjs
 */

import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const FRONTEND_PORT = 5173;
const API_PORT      = 8080;
const BASE_URL      = `http://localhost:${FRONTEND_PORT}`;
const CHROME_BIN    = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE_TIMEOUT  = 15_000; // ms to wait for each page to load

// ── All pages to visit ────────────────────────────────────────────────────────
const PAGES = [
  { name: 'Dashboard',          path: '/' },
  { name: 'Patient Tracker',    path: '/patients' },
  { name: 'New Test',           path: '/new-test' },
  { name: 'Test History',       path: '/tests' },
  { name: 'Non-Negative',       path: '/non-negative' },
  { name: 'Scheduling',         path: '/scheduling' },
  { name: 'Workers',            path: '/workers' },
  { name: 'Employers',          path: '/employers' },
  { name: 'Reports Hub',        path: '/reports' },
  { name: 'Reports (Legacy)',   path: '/reports/legacy' },
  { name: 'Training Tracker',   path: '/training' },
  { name: 'ESO Report',         path: '/training/eso-report' },
  { name: 'Checks Tracker',     path: '/checks' },
  { name: 'Testing Management', path: '/testing' },
  { name: 'Settings',           path: '/settings' },
  { name: 'Admin',              path: '/admin' },
  { name: 'Documents',          path: '/documents' },
  { name: 'Patient Search',     path: '/patient-search' },
];

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};

function ok(msg)   { console.log(`  ${C.green}✔${C.reset} ${msg}`); }
function fail(msg) { console.log(`  ${C.red}✘${C.reset} ${msg}`); }
function info(msg) { console.log(`  ${C.cyan}ℹ${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }

// ── Resolve project root path (handles OneDrive spaces + URL encoding) ────────
function getProjectRoot() {
  const raw = new URL('.', import.meta.url).pathname;
  // On Windows: /C:/Users/... — strip leading slash and decode %20 etc.
  return process.platform === 'win32'
    ? decodeURIComponent(raw).replace(/^\//, '').replace(/\//g, '\\').replace(/\\$/, '')
    : decodeURIComponent(raw).replace(/\/$/, '');
}

// ── Spawn a long-running process, resolve when ready phrase appears ───────────
function startProcess(cmdLine, cwd, readyPhrase, label) {
  return new Promise((resolve, reject) => {
    // Use spawn with shell:true — on Windows Node resolves the shell from PATH
    // Pass the full cmdLine as a single string so the shell handles quoting
    const proc = spawn(cmdLine, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false;

    const check = (data) => {
      if (ready) return;
      const txt = data.toString();
      process.stdout.write(`    ${C.cyan}[${label}]${C.reset} ${txt.trim().split('\n')[0]}\n`);
      if (txt.includes(readyPhrase)) {
        ready = true;
        ok(`${label} ready`);
        resolve(proc);
      }
    };

    proc.stdout.on('data', check);
    proc.stderr.on('data', check);
    proc.on('error', (err) => reject(new Error(`${label}: ${err.message}`)));

    // Fallback timeout — assume ready after 35s
    setTimeout(() => {
      if (!ready) {
        ready = true;
        warn(`${label} — ready phrase not seen, continuing anyway`);
        resolve(proc);
      }
    }, 35_000);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const ROOT       = getProjectRoot();
  const SERVER_CWD = ROOT + (process.platform === 'win32' ? '\\server' : '/server');

  console.log(`\n${C.bold}${C.cyan}═══ AOD Tracker — Selenium Page Smoke Test ═══${C.reset}\n`);
  info(`Root:   ${ROOT}`);
  info(`Server: ${SERVER_CWD}\n`);

  // 1. Start Express API
  console.log(`${C.bold}[1/3] Starting API server (port ${API_PORT})...${C.reset}`);
  const apiProc = await startProcess('node index.js', SERVER_CWD, 'running on port', `API:${API_PORT}`);

  // 2. Start Vite dev server
  console.log(`\n${C.bold}[2/3] Starting Vite dev server (port ${FRONTEND_PORT})...${C.reset}`);
  const viteProc = await startProcess(
    `npx vite --port ${FRONTEND_PORT} --strictPort`,
    ROOT,
    'Local:',
    `Vite:${FRONTEND_PORT}`
  );

  await sleep(1500);

  // 3. Launch Chrome
  console.log(`\n${C.bold}[3/3] Launching Chrome...${C.reset}`);
  const options = new chrome.Options();
  options.setChromeBinaryPath(CHROME_BIN);

  let driver;
  try {
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    ok('Chrome launched\n');
  } catch (err) {
    console.error(`${C.red}Failed to launch Chrome: ${err.message}${C.reset}`);
    apiProc.kill();
    viteProc.kill();
    process.exit(1);
  }

  // ── Visit each page ──────────────────────────────────────────────────────
  console.log(`${C.bold}Visiting ${PAGES.length} pages...${C.reset}\n`);
  const results = [];

  for (const page of PAGES) {
    const url = `${BASE_URL}${page.path}`;
    let status = 'pass';
    let detail = '';

    try {
      await driver.get(url);
      await driver.wait(until.elementLocated(By.css('body')), PAGE_TIMEOUT);

      // Wait a moment for React to render
      await sleep(600);

      // Collect SEVERE browser console errors
      const logs = await driver.manage().logs().get('browser');
      const errors = logs.filter(l => l.level.name === 'SEVERE');

      // Check page has rendered content
      const bodyText = await driver.findElement(By.css('body')).getText();
      if (bodyText.trim().length < 10) {
        status = 'warn';
        detail = 'Page body appears blank/empty';
      }

      if (errors.length > 0) {
        status = 'fail';
        detail = errors.map(e => e.message.split('\n')[0].slice(0, 150)).join(' | ');
      }
    } catch (err) {
      status = 'fail';
      detail = err.message.split('\n')[0].slice(0, 150);
    }

    const label = `${page.name.padEnd(22)} ${page.path}`;
    if      (status === 'pass') ok(label);
    else if (status === 'warn') warn(`${label}  — ${detail}`);
    else                        fail(`${label}  — ${detail}`);

    results.push({ ...page, status, detail });
    await sleep(250);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log(`\n${C.bold}═══ Summary ═══${C.reset}`);
  console.log(`  ${C.green}Passed:${C.reset} ${passed}`);
  if (warned) console.log(`  ${C.yellow}Warned:${C.reset} ${warned}`);
  if (failed) console.log(`  ${C.red}Failed:${C.reset} ${failed}`);

  if (failed > 0) {
    console.log(`\n${C.bold}${C.red}Failures:${C.reset}`);
    results.filter(r => r.status === 'fail').forEach(r =>
      console.log(`  ${C.red}✘${C.reset} ${r.name} (${r.path})\n    ${r.detail}`)
    );
  }

  console.log('');
  info('Browser left open. Press Ctrl+C to quit and kill servers.\n');

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    try { await driver.quit(); } catch {}
    apiProc.kill();
    viteProc.kill();
    process.exit(failed > 0 ? 1 : 0);
  });

  await new Promise(() => {}); // keep alive
}

main().catch(err => {
  console.error(C.red + err.message + C.reset);
  process.exit(1);
});
