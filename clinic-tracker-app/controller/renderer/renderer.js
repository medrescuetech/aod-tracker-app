// ─── Element refs ─────────────────────────────────────────────────────────────
const statusEl  = document.getElementById('status');
const logEl     = document.getElementById('log');
const portEl    = document.getElementById('port');
const btnStart  = document.getElementById('btnStart');
const btnStop   = document.getElementById('btnStop');
const btnOpen   = document.getElementById('btnOpen');
const btnClear  = document.getElementById('btnClear');
const btnTray   = document.getElementById('btnTray');

// DB config refs
const dbStatusEl     = document.getElementById('dbStatus');
const sqlitePathEl   = document.getElementById('sqlitePath');
const mssqlHostEl    = document.getElementById('mssqlHost');
const mssqlPortEl    = document.getElementById('mssqlPort');
const mssqlDbEl      = document.getElementById('mssqlDb');
const mssqlUserEl    = document.getElementById('mssqlUser');
const mssqlPassEl    = document.getElementById('mssqlPass');
const mssqlEncryptEl = document.getElementById('mssqlEncrypt');
const mssqlTrustEl   = document.getElementById('mssqlTrustCert');
const sqliteOpts     = document.getElementById('sqliteOpts');
const mssqlOpts      = document.getElementById('mssqlOpts');

// ─── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// ─── Server tab ────────────────────────────────────────────────────────────────
function setStatus(running) {
  statusEl.textContent = running ? 'Running' : 'Stopped';
  statusEl.classList.toggle('running', running);
  statusEl.classList.toggle('stopped', !running);
  btnStart.classList.toggle('primary', running);
}

function appendLog(line) {
  const next = (logEl.textContent + line).slice(-25000);
  logEl.textContent = next;
  logEl.scrollTop = logEl.scrollHeight;
}

btnStart.addEventListener('click', async () => {
  const port = parseInt(portEl.value || '8080', 10);
  const res = await window.controllerApi.startServer({ port });
  if (res?.reason === 'port-in-use') {
    appendLog(`\nPort ${port} already in use — click Open Web Page if server is running.\n`);
    return;
  }
  if (res?.started) setStatus(true);
});

btnStop.addEventListener('click', async () => {
  await window.controllerApi.stopServer();
  setStatus(false);
});

btnOpen.addEventListener('click', async () => {
  const port = parseInt(portEl.value || '8080', 10);
  await window.controllerApi.openWeb({ port });
});

btnClear.addEventListener('click', () => { logEl.textContent = ''; });
btnTray.addEventListener('click',  async () => window.controllerApi.minimizeToTray());

window.controllerApi.onLog((line) => appendLog(line));
window.controllerApi.onServerStatus((st) => setStatus(!!st?.running));

// ─── DB config tab ─────────────────────────────────────────────────────────────
function getSelectedDbType() {
  return document.querySelector('input[name="dbType"]:checked')?.value || 'sqlite';
}

function setDbType(type) {
  document.querySelectorAll('input[name="dbType"]').forEach(r => { r.checked = r.value === type; });
  sqliteOpts.classList.toggle('hidden', type !== 'sqlite');
  mssqlOpts.classList.toggle('hidden',  type !== 'mssql');
}

function buildConfig() {
  return {
    type: getSelectedDbType(),
    sqlite: { path: sqlitePathEl.value.trim() },
    mssql: {
      host:      mssqlHostEl.value.trim(),
      port:      parseInt(mssqlPortEl.value || '1433', 10),
      database:  mssqlDbEl.value.trim(),
      user:      mssqlUserEl.value.trim(),
      password:  mssqlPassEl.value,
      encrypt:   mssqlEncryptEl.checked,
      trustCert: mssqlTrustEl.checked,
    },
  };
}

function showDbStatus(msg, ok) {
  dbStatusEl.textContent = msg;
  dbStatusEl.className = 'db-status ' + (ok ? 'ok' : 'err');
}

async function loadDbConfig() {
  const cfg = await window.controllerApi.getDbConfig();
  setDbType(cfg.type || 'sqlite');
  sqlitePathEl.value   = cfg.sqlite?.path    || '';
  mssqlHostEl.value    = cfg.mssql?.host     || 'localhost';
  mssqlPortEl.value    = cfg.mssql?.port     || 1433;
  mssqlDbEl.value      = cfg.mssql?.database || 'AODTracker';
  mssqlUserEl.value    = cfg.mssql?.user     || '';
  mssqlPassEl.value    = cfg.mssql?.password || '';
  mssqlEncryptEl.checked = !!cfg.mssql?.encrypt;
  mssqlTrustEl.checked   = cfg.mssql?.trustCert !== false;
}

document.querySelectorAll('input[name="dbType"]').forEach(r => {
  r.addEventListener('change', () => setDbType(r.value));
});

document.getElementById('btnBrowse').addEventListener('click', async () => {
  const p = await window.controllerApi.browseSqlitePath();
  if (p) sqlitePathEl.value = p;
});

document.getElementById('btnOpenDir').addEventListener('click', async () => {
  await window.controllerApi.openDbDir();
});

document.getElementById('btnTestConn').addEventListener('click', async () => {
  showDbStatus('Testing…', true);
  const res = await window.controllerApi.testDbConnection(buildConfig());
  showDbStatus(res.ok ? `✔ ${res.message}` : `✘ ${res.error}`, res.ok);
});

document.getElementById('btnSaveDb').addEventListener('click', async () => {
  const res = await window.controllerApi.saveDbConfig(buildConfig());
  showDbStatus(
    res.ok ? '✔ Configuration saved. Restart the server to apply.' : `✘ ${res.error}`,
    res.ok
  );
});

// ─── Server IP panel ──────────────────────────────────────────────────────────
const ipListEl      = document.getElementById('ipList');
const ipLocalhostEl = document.getElementById('ipLocalhost');

async function refreshIPs() {
  const port = parseInt(portEl.value || '8080', 10);
  ipLocalhostEl.textContent = `http://localhost:${port}`;
  try {
    const { ips } = await window.controllerApi.getServerIps(port);
    ipListEl.innerHTML = '';
    if (!ips || ips.length === 0) {
      ipListEl.innerHTML = '<div class="hint" style="margin-top:4px">No LAN interfaces found.</div>';
      return;
    }
    ips.forEach(ip => {
      const id = `ip_${ip.address.replace(/\./g, '_')}`;
      const row = document.createElement('div');
      row.className = 'ip-row';
      row.innerHTML = `
        <span class="ip-label">${ip.name}:</span>
        <code id="${id}">http://${ip.address}:${port}</code>
        <button class="copy-btn" data-copy="${id}" title="Copy">⧉</button>
      `;
      ipListEl.appendChild(row);
    });
    // Re-attach copy listeners
    attachCopyListeners();
  } catch (e) {
    ipListEl.innerHTML = '<div class="hint">Could not retrieve IPs.</div>';
  }
}

function attachCopyListeners() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.copy;
      const text = document.getElementById(id)?.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✔';
        setTimeout(() => { btn.textContent = orig; }, 1200);
      });
    };
  });
}

document.getElementById('btnRefreshIPs').addEventListener('click', refreshIPs);
portEl.addEventListener('change', refreshIPs);
attachCopyListeners();

// ─── Backup / Restore tab ─────────────────────────────────────────────────────
const backupStatusEl = document.getElementById('backupStatus');
const restoreStatusEl = document.getElementById('restoreStatus');
const backupDirEl    = document.getElementById('backupDir');
const backupLabelEl  = document.getElementById('backupLabel');
const restorePathEl  = document.getElementById('restorePath');
const backupListEl   = document.getElementById('backupList');

function showBackupStatus(msg, ok) {
  backupStatusEl.textContent = msg;
  backupStatusEl.className = 'db-status ' + (ok ? 'ok' : 'err');
}
function showRestoreStatus(msg, ok) {
  restoreStatusEl.textContent = msg;
  restoreStatusEl.className = 'db-status ' + (ok ? 'ok' : 'err');
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch { return iso; }
}

async function loadBackupList() {
  backupListEl.innerHTML = '<div class="hint">Loading…</div>';
  const res = await window.controllerApi.listBackups();
  if (!res.ok || res.backups.length === 0) {
    backupListEl.innerHTML = '<div class="hint">No backups found.</div>';
    return;
  }
  backupListEl.innerHTML = '';
  res.backups.forEach(b => {
    const row = document.createElement('div');
    row.className = 'backup-row';
    row.innerHTML = `
      <div class="backup-info">
        <span class="backup-name">${b.name}</span>
        <span class="backup-meta">${formatDate(b.mtime)} · ${formatBytes(b.size)}</span>
      </div>
      <button class="secondary backup-restore-btn" data-path="${b.path}">Restore</button>
    `;
    backupListEl.appendChild(row);
  });
  // Attach restore buttons
  backupListEl.querySelectorAll('.backup-restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.path;
      if (!confirm(`Restore from:\n${btn.closest('.backup-row').querySelector('.backup-name').textContent}\n\nThis will overwrite the current database. Continue?`)) return;
      restorePathEl.value = p;
      showRestoreStatus('Restoring…', true);
      const res2 = await window.controllerApi.restoreDb({ path: p });
      showRestoreStatus(res2.ok ? `✔ ${res2.message}` : `✘ ${res2.error}`, res2.ok);
      if (res2.ok) loadBackupList();
    });
  });
}

document.getElementById('btnBrowseBackupDir').addEventListener('click', async () => {
  const p = await window.controllerApi.browseBackupDir();
  if (p) backupDirEl.value = p;
});

document.getElementById('btnBackup').addEventListener('click', async () => {
  showBackupStatus('Backing up…', true);
  const args = {};
  if (backupLabelEl.value.trim()) args.label = backupLabelEl.value.trim();
  if (backupDirEl.value.trim()) args.dir = backupDirEl.value.trim();
  const res = await window.controllerApi.backupDb(args);
  showBackupStatus(
    res.ok ? `✔ Backup saved: ${res.file} (${formatBytes(res.size)})` : `✘ ${res.error}`,
    res.ok
  );
  if (res.ok) { backupLabelEl.value = ''; loadBackupList(); }
});

document.getElementById('btnBrowseRestore').addEventListener('click', async () => {
  const p = await window.controllerApi.browseBackupRestore();
  if (p) restorePathEl.value = p;
});

document.getElementById('btnRestore').addEventListener('click', async () => {
  const p = restorePathEl.value.trim();
  if (!p) { showRestoreStatus('✘ Please select a backup file first.', false); return; }
  if (!confirm('This will overwrite the current database with the selected backup.\nA pre-restore backup will be created automatically.\n\nContinue?')) return;
  showRestoreStatus('Restoring…', true);
  const res = await window.controllerApi.restoreDb({ path: p });
  showRestoreStatus(res.ok ? `✔ ${res.message}` : `✘ ${res.error}`, res.ok);
  if (res.ok) loadBackupList();
});

document.getElementById('btnRefreshBackups').addEventListener('click', loadBackupList);
document.getElementById('btnOpenBackupDir').addEventListener('click', () => window.controllerApi.openBackupDir());

// Load backup list when switching to backup tab
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'backup') loadBackupList();
  });
});

// ─── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const st = await window.controllerApi.getStatus();
  setStatus(!!st?.running);
  await loadDbConfig();
  await refreshIPs();
})();
