const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const treeKill = require('tree-kill');
const fs = require('fs');
const { networkInterfaces } = require('os');

function getNetworkIP() {
  try {
    const nets = networkInterfaces();
    for (const ifaces of Object.values(nets)) {
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {}
  return null;
}

// ─── Single-instance lock ──────────────────────────────────────────────────
// Prevents a second copy of the launcher from starting. If another instance
// is already running, focus its window and quit the new one immediately.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  // Someone tried to open a second instance — bring our window to front
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
});

let tray = null;
let window = null;
let serverProcess = null;
let isQuitting = false;

// Get the app directory (parent of electron-launcher)
const appDir = path.dirname(__dirname);
const serverScript = path.join(appDir, 'server', 'index.js');
const logsDir = path.join(appDir, 'server', 'logs');
const backupsDir = path.join(appDir, 'server', 'database', 'backups');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getTimestamp() {
  return new Date().toISOString();
}

function writeLauncherLog(type, message) {
  try {
    ensureDir(logsDir);
    const line = `[${getTimestamp()}] [${type.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(path.join(logsDir, 'launcher.log'), line);
    if (type === 'error') {
      fs.appendFileSync(path.join(logsDir, 'launcher-errors.log'), line);
    }
  } catch {}
}

function getDbPath() {
  const envPath = path.join(appDir, '.env');
  let dbPath = path.join(appDir, 'server', 'database', 'aod_tracker.db');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^DB_PATH=(.+)$/m);
    if (match) dbPath = match[1].trim();
  }
  return dbPath;
}

function getBackupConfig() {
  const defaults = { enabled: true, time: '03:00', retentionDays: 30, lastBackup: null };
  try {
    const p = path.join(appDir, 'server', 'backup-config.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ...defaults, ...data };
    }
  } catch (err) {
    writeLauncherLog('error', `Failed to read backup config: ${err.message}`);
  }
  return defaults;
}

function cleanOldBackups() {
  try {
    const cfg = getBackupConfig();
    if (!fs.existsSync(backupsDir)) return;
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db'));
    const cutoff = new Date(Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const f of files) {
      const p = path.join(backupsDir, f);
      const st = fs.statSync(p);
      if (st.mtime < cutoff) {
        fs.unlinkSync(p);
        removed++;
      }
    }
    if (removed) writeLauncherLog('info', `Removed ${removed} backup(s) older than ${cfg.retentionDays} days`);
  } catch (err) {
    writeLauncherLog('error', `Backup cleanup failed: ${err.message}`);
  }
}

function doBackup() {
  try {
    const cfg = getBackupConfig();
    if (!cfg.enabled) {
      writeLauncherLog('info', 'Automatic backups are disabled; skipping scheduled backup.');
      return { ok: false, error: 'Backups disabled' };
    }
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      writeLauncherLog('warn', `Backup skipped: database not found at ${dbPath}`);
      return { ok: false, error: 'Database not found' };
    }
    ensureDir(backupsDir);
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const destName = `aod_tracker_backup_${stamp}.db`;
    const destPath = path.join(backupsDir, destName);
    fs.copyFileSync(dbPath, destPath);
    cleanOldBackups();
    writeLauncherLog('info', `Database backed up to ${destPath}`);
    const cfgPath = path.join(appDir, 'server', 'backup-config.json');
    try {
      fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, lastBackup: new Date().toISOString() }, null, 2));
    } catch {}
    return { ok: true, file: destName, path: destPath };
  } catch (err) {
    writeLauncherLog('error', `Backup failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function scheduleNextBackup() {
  const cfg = getBackupConfig();
  if (!cfg.enabled) return;
  const now = new Date();
  const target = new Date(now);
  const [h, m] = cfg.time.split(':').map(Number);
  target.setHours(h || 3, m || 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;
  writeLauncherLog('info', `Next backup scheduled for ${cfg.time} (${Math.round(delay / 60000)} minutes)`);
  setTimeout(() => {
    doBackup();
    setInterval(() => { if (getBackupConfig().enabled) doBackup(); }, 24 * 60 * 60 * 1000);
  }, delay);
}

// Server configuration
let SERVER_PORT = parseInt(process.env.PORT || '8080', 10);
let SERVER_URL = `http://localhost:${SERVER_PORT}`;
const MAX_PORT_RETRIES = 3;

// Version info
const APP_VERSION = '1.2.0';
const UPDATE_CHECK_URL = process.env.UPDATE_URL || null; // Set this to check for updates

// Update handling
let updateAvailable = false;
let updateVersion = null;
let updateDownloadPath = null;

function createWindow() {
  window = new BrowserWindow({
    width: 520,
    height: 620,
    minWidth: 380,
    minHeight: 480,
    show: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      zoomFactor: 1.0
    },
    icon: path.join(__dirname, 'icon.ico'),
    title: 'AOD Tracker Server'
  });

  window.loadFile(path.join(__dirname, 'tray.html'));

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.on('did-finish-load', () => {
    updateStatus('starting');
  });
}

function createTray() {
  // Use default system icon if custom not found
  let iconPath = path.join(__dirname, 'icon.ico');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      throw new Error('Icon empty');
    }
  } catch {
    // Fallback to empty icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('AOD Tracker Server');
  
  updateTrayMenu();
}

// Check for available update (from version file)
function checkForUpdate() {
  const versionFile = path.join(appDir, 'version.json');
  
  try {
    if (fs.existsSync(versionFile)) {
      const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const latestVersion = versionData.version;
      const downloadUrl = versionData.downloadUrl;
      
      if (latestVersion && latestVersion !== APP_VERSION) {
        updateAvailable = true;
        updateVersion = latestVersion;
        updateDownloadPath = downloadUrl;
        
        // Notify user
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `AOD Tracker ${latestVersion} is available!`,
          detail: `Current version: ${APP_VERSION}\nNew version: ${latestVersion}\n\nRun UPDATE.bat to install the update.`,
          buttons: ['OK', 'View Details']
        }).then(result => {
          if (result.response === 1 && downloadUrl) {
            shell.openExternal(downloadUrl);
          }
        });
        
        return true;
      }
    }
  } catch (err) {
    console.error('Update check failed:', err);
  }
  
  return false;
}

// Show update dialog
function showUpdateDialog() {
  if (!updateAvailable) {
    dialog.showMessageBox({
      type: 'info',
      title: 'No Updates',
      message: 'You are running the latest version.',
      detail: `Current version: ${APP_VERSION}`
    });
    return;
  }
  
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `AOD Tracker ${updateVersion} is available!`,
    detail: `Current version: ${APP_VERSION}\nNew version: ${updateVersion}\n\n1. Download the new installer\n2. Stop this server\n3. Run the new installer\n4. Your data will be preserved`,
    buttons: ['Remind Me Later', 'Download Update']
  }).then(result => {
    if (result.response === 1 && updateDownloadPath) {
      shell.openExternal(updateDownloadPath);
    }
  });
}

function updateTrayMenu() {
  const isRunning = serverProcess !== null;
  
  const menuItems = [
    {
      label: 'AOD Tracker Server',
      enabled: false
    },
    { type: 'separator' },
    {
      label: isRunning ? 'Server Running ✓' : 'Server Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal(SERVER_URL);
      },
      enabled: isRunning
    },
    {
      label: 'Show/Hide Window',
      click: () => {
        if (window.isVisible()) {
          window.hide();
        } else {
          window.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start Server',
      click: startServer,
      enabled: !isRunning
    },
    {
      label: 'Stop Server',
      click: stopServer,
      enabled: isRunning
    },
    { type: 'separator' },
    {
      label: 'Backup Database Now',
      click: () => {
        const result = doBackup();
        dialog.showMessageBox({
          type: result.ok ? 'info' : 'error',
          title: result.ok ? 'Backup Created' : 'Backup Failed',
          message: result.ok ? `Saved: ${result.file}` : result.error
        });
      }
    },
    {
      label: 'Open Backups Folder',
      click: () => { shell.openPath(backupsDir); }
    },
    {
      label: 'Open Logs Folder',
      click: () => { shell.openPath(logsDir); }
    }
  ];
  
  // Add update menu item if available
  if (updateAvailable) {
    menuItems.push(
      { type: 'separator' },
      {
        label: `⬆️ Update to ${updateVersion}...`,
        click: showUpdateDialog
      }
    );
  }
  
  menuItems.push(
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        if (checkForUpdate()) {
          // Update found - dialog shown by checkForUpdate
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'No Updates',
            message: 'You are running the latest version.',
            detail: `Current version: ${APP_VERSION}`
          });
        }
      }
    },
    {
      label: 'About',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'About',
          message: 'AOD Tracker Server',
          detail: `Version: ${APP_VERSION}\nServer Port: ${SERVER_PORT}\nApp Directory: ${appDir}${updateAvailable ? `\n\n⚠️ Update available: ${updateVersion}` : ''}`
        });
      }
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        stopServer();
        app.quit();
      }
    }
  );

  const contextMenu = Menu.buildFromTemplate(menuItems);

  tray.setContextMenu(contextMenu);
  
  // Show update notification icon if available
  if (updateAvailable) {
    tray.setToolTip(`AOD Tracker Server - Update available: ${updateVersion}`);
  } else {
    tray.setToolTip('AOD Tracker Server');
  }
  
  tray.on('click', () => {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
    }
  });
}

function startServer(portRetry = 0) {
  if (serverProcess) {
    return;
  }

  updateStatus('starting');

  // Set environment variables
  const env = {
    ...process.env,
    PORT: SERVER_PORT,
    NODE_ENV: 'production',
    SERVE_FRONTEND: '1',
    DB_PATH: path.join(appDir, 'server', 'database', 'aod_tracker.db')
  };

  // Read .env file if exists
  const envPath = path.join(appDir, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });
  }

  serverProcess = spawn('node', [serverScript], {
    cwd: appDir,
    env: env,
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    writeLauncherLog('info', `server: ${msg.trim()}`);
    if (msg.includes('server running on port') || msg.includes('Server listening') || msg.includes('listening on')) {
      updateStatus('running');
    }
    if (window) {
      window.webContents.send('server-log', { type: 'info', message: msg.trim() });
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const errMsg = data.toString();
    writeLauncherLog('error', `server stderr: ${errMsg.trim()}`);
    if (window) {
      window.webContents.send('server-log', { type: 'error', message: errMsg.trim() });
    }
    if (errMsg.includes('EADDRINUSE') && portRetry < MAX_PORT_RETRIES) {
      writeLauncherLog('warn', `Port ${SERVER_PORT} in use, retrying on ${SERVER_PORT + 1}`);
      serverProcess.kill();
      serverProcess = null;
      SERVER_PORT += 1;
      SERVER_URL = `http://localhost:${SERVER_PORT}`;
      setTimeout(() => startServer(portRetry + 1), 500);
    }
  });

  serverProcess.on('close', (code) => {
    writeLauncherLog('info', `Server process closed (code=${code})`);
    serverProcess = null;
    if (!isQuitting) {
      updateStatus('stopped');
    }
  });

  serverProcess.on('error', (err) => {
    writeLauncherLog('error', `Failed to start server process: ${err.message}`);
    serverProcess = null;
    updateStatus('error');
  });

  // Give it 5 seconds to start; if stdout hasn't confirmed yet, mark running anyway
  setTimeout(() => {
    if (serverProcess) {
      updateStatus('running');
    }
  }, 5000);
}

function stopServer() {
  if (!serverProcess) {
    return;
  }

  writeLauncherLog('info', 'Stopping server...');
  updateStatus('stopping');

  // Kill the entire process tree
  treeKill(serverProcess.pid, 'SIGTERM', (err) => {
    if (err) {
      writeLauncherLog('error', `Failed to kill server: ${err.message}`);
      serverProcess.kill('SIGKILL');
    } else {
      writeLauncherLog('info', 'Server stopped');
    }
    serverProcess = null;
    updateStatus('stopped');
  });
}

function updateStatus(status) {
  const statusMessages = {
    starting: { text: 'Starting...', color: '#f59e0b' },
    running: { text: 'Running', color: '#10b981' },
    stopping: { text: 'Stopping...', color: '#f59e0b' },
    stopped: { text: 'Stopped', color: '#ef4444' },
    error: { text: 'Error', color: '#ef4444' }
  };

  const statusInfo = statusMessages[status] || statusMessages.stopped;
  
  if (window) {
    const networkIP = status === 'running' ? getNetworkIP() : null;
    window.webContents.send('status-update', {
      status: status,
      text: statusInfo.text,
      color: statusInfo.color,
      url: status === 'running' ? SERVER_URL : null,
      networkUrl: networkIP ? `http://${networkIP}:${SERVER_PORT}` : null
    });
  }

  updateTrayMenu();
}

// ─── IPC handlers ───────────────────────────────────────────────────────────
ipcMain.on('start-server',      () => { startServer(); });
ipcMain.on('stop-server',       () => { stopServer(); });
ipcMain.on('get-app-path', (event) => { event.returnValue = appDir; });
ipcMain.on('minimise-to-tray',  () => { if (window) window.hide(); });

// Return all known storage paths
ipcMain.on('get-paths', (event) => {
  const logsDir    = path.join(appDir, 'server', 'logs');
  const dbPath     = path.join(appDir, 'server', 'database', 'aod_tracker.db');
  const uploadsDir = path.join(appDir, 'server', 'uploads');
  const backupsDir = path.join(appDir, 'server', 'database', 'backups');
  const envFile    = path.join(appDir, '.env');
  const dbDir      = path.join(appDir, 'server', 'database');

  const sz = (p) => { try { return fs.statSync(p).size; } catch { return null; } };
  const dirSz = (p) => {
    try {
      let total = 0;
      const walk = (d) => { for (const f of fs.readdirSync(d)) { try { const s = fs.statSync(path.join(d,f)); if (s.isDirectory()) walk(path.join(d,f)); else total += s.size; } catch {} } };
      walk(p); return total;
    } catch { return null; }
  };

  event.returnValue = {
    appDir,
    logsDir,   logsDirSize:    dirSz(logsDir),
    dbPath,    dbSize:         sz(dbPath),
    dbDir,
    uploadsDir, uploadsDirSize: dirSz(uploadsDir),
    backupsDir, backupsDirSize: dirSz(backupsDir),
    envFile,    envExists:      fs.existsSync(envFile),
  };
});

// Open a folder in Explorer
ipcMain.on('open-folder', (event, folderPath) => {
  shell.openPath(folderPath);
});

// Trigger an immediate database backup
ipcMain.on('backup-db', (event) => {
  event.returnValue = doBackup();
});

// Open the database backups folder
ipcMain.on('open-backup-dir', () => {
  shell.openPath(backupsDir);
});

// Open a file in its default app (Notepad for .log / .env / .txt)
ipcMain.on('open-file', (event, filePath) => {
  shell.openPath(filePath);
});

// List log files with metadata
ipcMain.on('list-logs', (event) => {
  const logsDir = path.join(appDir, 'server', 'logs');
  try {
    if (!fs.existsSync(logsDir)) { event.returnValue = []; return; }
    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const full = path.join(logsDir, f);
        const st = fs.statSync(full);
        return { name: f, path: full, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
    event.returnValue = files;
  } catch { event.returnValue = []; }
});

// Read last N lines of a log file
ipcMain.on('read-log', (event, { filePath, lines = 200 }) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const all = content.split('\n').filter(Boolean);
    event.returnValue = { lines: all.slice(-lines), total: all.length };
  } catch (e) { event.returnValue = { lines: [], total: 0, error: e.message }; }
});

// Read current .env file content (redact passwords)
ipcMain.on('read-env', (event) => {
  const envFile = path.join(appDir, '.env');
  try {
    if (!fs.existsSync(envFile)) { event.returnValue = { exists: false, content: '' }; return; }
    const raw = fs.readFileSync(envFile, 'utf8');
    // Redact password-like values for display
    const safe = raw.replace(/^(.*(?:PASSWORD|SECRET|KEY|TOKEN).*)=(.+)$/gim, '$1=[REDACTED]');
    event.returnValue = { exists: true, content: safe };
  } catch (e) { event.returnValue = { exists: false, content: '', error: e.message }; }
});

// Write a single key=value into .env (creates file if missing)
ipcMain.handle('write-env-key', async (event, { key, value }) => {
  const envFile = path.join(appDir, '.env');
  try {
    let lines = [];
    if (fs.existsSync(envFile)) lines = fs.readFileSync(envFile, 'utf8').split('\n');
    const idx = lines.findIndex(l => l.startsWith(key + '='));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry; else lines.push(entry);
    fs.writeFileSync(envFile, lines.filter(Boolean).join('\n') + '\n');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Open .env in Notepad for full manual editing
ipcMain.on('open-env', () => {
  const envFile = path.join(appDir, '.env');
  if (!fs.existsSync(envFile)) fs.writeFileSync(envFile, '# AOD Tracker configuration\n');
  require('child_process').spawn('notepad.exe', [envFile], { detached: true, stdio: 'ignore' }).unref();
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();
  startServer(); // Auto-start server
  scheduleNextBackup(); // Daily 03:00 database backup

  // Check for updates after 5 seconds (give server time to start)
  setTimeout(() => {
    checkForUpdate();
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in background (tray)
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
});
