const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');

let mainWindow;
let serverProcess = null;
let shouldKeepRunning = false;
let lastStartConfig = null;
let lastServerHadAddrInUse = false;
let tray = null;
let isQuitting = false;

const DEFAULT_PORT = 8080;

function getProjectRoot() {
  // In dev, controller/ is inside project root.
  // In packaged app, extraResources are in process.resourcesPath
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..');
}

function getServerCwd() {
  return path.join(getProjectRoot(), 'server');
}

function getDbConfigPath() {
  return path.join(getServerCwd(), 'database', 'db-config.json');
}

function loadDbConfig() {
  try {
    const p = getDbConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return {
    type: 'sqlite',
    sqlite: { path: path.join(getServerCwd(), 'database', 'aod_tracker.db') },
    mssql: { host: 'localhost', port: 1433, database: 'AODTracker', user: '', password: '', encrypt: false, trustCert: true }
  };
}

function saveDbConfig(config) {
  try {
    const dir = path.join(getServerCwd(), 'database');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getDbConfigPath(), JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getServerEntry() {
  return path.join(getServerCwd(), 'index.js');
}

function getDistPath() {
  return path.join(getProjectRoot(), 'dist');
}

function sendLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', String(line));
  }
}

function getNodeCommand() {
  // In dev this is fine; in packaged app electron.exe does not provide node.
  // For portable builds, we rely on Node being installed OR we can swap to a bundled node later.
  return process.platform === 'win32' ? 'node' : 'node';
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (inUse) => {
      try { socket.destroy(); } catch {}
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => onDone(true));
    socket.once('timeout', () => onDone(false));
    socket.once('error', () => onDone(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function startServer({ port = DEFAULT_PORT } = {}) {
  if (serverProcess) return { ok: true, started: false, reason: 'already-starting' };

  const inUse = await checkPortInUse(port);
  if (inUse) {
    sendLog(`Port ${port} is already in use. If the server is already running, use Open Web Page.`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { running: true, external: true });
    }
    return { ok: true, started: false, reason: 'port-in-use' };
  }

  const serverEntry = getServerEntry();
  const serverCwd = getServerCwd();

  lastStartConfig = { port };
  shouldKeepRunning = true;

  // Read DB config and convert to env vars for the server process
  const dbCfg = loadDbConfig();
  const dbEnv = { DB_TYPE: dbCfg.type || 'sqlite' };
  if (dbCfg.type === 'mssql') {
    Object.assign(dbEnv, {
      DB_HOST:      dbCfg.mssql?.host     || 'localhost',
      DB_PORT:      String(dbCfg.mssql?.port || 1433),
      DB_NAME:      dbCfg.mssql?.database || 'AODTracker',
      DB_USER:      dbCfg.mssql?.user     || '',
      DB_PASSWORD:  dbCfg.mssql?.password || '',
      DB_ENCRYPT:   String(dbCfg.mssql?.encrypt    ?? false),
      DB_TRUST_CERT:String(dbCfg.mssql?.trustCert  ?? true),
    });
  } else {
    dbEnv.DB_PATH = dbCfg.sqlite?.path || path.join(getServerCwd(), 'database', 'aod_tracker.db');
  }

  const env = {
    ...process.env,
    PORT: String(port),
    SERVE_FRONTEND: '1',
    DIST_PATH: getDistPath(),
    ...dbEnv
  };

  sendLog(`Starting server: ${serverEntry}`);
  sendLog(`Server CWD: ${serverCwd}`);
  sendLog(`Dist path: ${getDistPath()}`);
  sendLog(`DB path: ${env.DB_PATH}`);

  lastServerHadAddrInUse = false;

  try {
    serverProcess = spawn(getNodeCommand(), [serverEntry], {
      cwd: serverCwd,
      env,
      windowsHide: true
    });
  } catch (err) {
    sendLog(`Failed to spawn server: ${err.message}`);
    return { ok: false, error: err.message };
  }

  serverProcess.stdout.on('data', (d) => sendLog(d.toString()));
  serverProcess.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.includes('EADDRINUSE')) lastServerHadAddrInUse = true;
    sendLog(s);
  });

  serverProcess.on('error', (err) => {
    sendLog(`Server process error: ${err.message}`);
    if (err.code === 'ENOENT') {
      sendLog('Node.js not found! Please install Node.js from https://nodejs.org');
      shouldKeepRunning = false;
    }
    serverProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { running: false, error: err.message });
    }
  });

  serverProcess.on('exit', (code, signal) => {
    sendLog(`Server exited (code=${code}, signal=${signal})`);
    serverProcess = null;

    if (lastServerHadAddrInUse) {
      shouldKeepRunning = false;
      sendLog('Port is already in use. Auto-restart disabled. Choose a different port or stop the other server.');
    }

    if (shouldKeepRunning) {
      sendLog('Restarting server in 2s...');
      setTimeout(() => {
        if (shouldKeepRunning && !serverProcess) startServer(lastStartConfig || { port });
      }, 2000);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { running: false });
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-status', { running: true });
  }

  return { ok: true, started: true };
}

function stopServer() {
  shouldKeepRunning = false;

  if (!serverProcess) return;

  sendLog('Stopping server...');

  try {
    if (process.platform === 'win32') {
      // Kill process tree on Windows
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/t', '/f'], { windowsHide: true });
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch (e) {
    sendLog(`Failed to stop server: ${e.message}`);
  }
}

function getAppIcon() {
  const p = path.join(__dirname, 'icon.png');
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Handle close event - only quit if isQuitting is true
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // Normal close - just close the window, don't quit
      // Tray minimize is handled separately via IPC
    }
  });
}

function createTray() {
  const icon = getAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Clinic Tracker — Server Controller');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Controller',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        stopServer();
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function minimizeToTray() {
  if (mainWindow) {
    mainWindow.hide();
  }
  if (!tray) {
    createTray();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit when window is closed - might be in tray
  // Only quit when isQuitting is true
  if (isQuitting && process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.handle('start-server', async (_evt, args) => {
  return await startServer(args || {});
});

ipcMain.handle('stop-server', async () => {
  stopServer();
  return { ok: true };
});

ipcMain.handle('open-web', async (_evt, args) => {
  const port = args?.port || DEFAULT_PORT;
  const url = `http://localhost:${port}`;
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle('get-status', async () => {
  return { running: !!serverProcess, shouldKeepRunning, lastStartConfig };
});

ipcMain.handle('minimize-to-tray', async () => {
  minimizeToTray();
  return { ok: true };
});

ipcMain.handle('quit-app', async () => {
  isQuitting = true;
  stopServer();
  app.quit();
  return { ok: true };
});

// ── Database configuration IPC ────────────────────────────────────────────────

ipcMain.handle('get-db-config', async () => {
  return loadDbConfig();
});

ipcMain.handle('save-db-config', async (_evt, config) => {
  return saveDbConfig(config);
});

ipcMain.handle('test-db-connection', async (_evt, config) => {
  // For SQLite just check path / dir exists
  if (config.type === 'sqlite') {
    const p = config.sqlite?.path || '';
    if (!p) return { ok: false, error: 'No database path specified.' };
    const dir = path.dirname(p);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return { ok: true, message: `SQLite path OK: ${p}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  // For MSSQL, try a TCP connection to the host:port as a quick reachability check
  if (config.type === 'mssql') {
    const host = config.mssql?.host || 'localhost';
    const port = config.mssql?.port || 1433;
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(4000);
      sock.once('connect', () => { sock.destroy(); resolve({ ok: true, message: `Reached ${host}:${port}` }); });
      sock.once('timeout', () => { sock.destroy(); resolve({ ok: false, error: `Timeout connecting to ${host}:${port}` }); });
      sock.once('error',   (e) => { sock.destroy(); resolve({ ok: false, error: e.message }); });
      sock.connect(port, host);
    });
  }
  return { ok: false, error: 'Unknown DB type' };
});

ipcMain.handle('browse-sqlite-path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Choose SQLite database location',
    defaultPath: path.join(getServerCwd(), 'database', 'aod_tracker.db'),
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('open-db-dir', async () => {
  const dir = path.join(getServerCwd(), 'database');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return { ok: true };
});

// ── Server IP addresses ───────────────────────────────────────────────────────

ipcMain.handle('get-server-ips', async (_evt, port) => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of (addrs || [])) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ name, address: addr.address });
      }
    }
  }
  return { ips, port: port || DEFAULT_PORT };
});

// ── Database Backup / Restore ─────────────────────────────────────────────────

function getBackupDir() {
  const dir = path.join(getServerCwd(), 'database', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getActiveSqlitePath() {
  const cfg = loadDbConfig();
  return cfg.sqlite?.path || path.join(getServerCwd(), 'database', 'aod_tracker.db');
}

ipcMain.handle('list-backups', async () => {
  try {
    const dir = getBackupDir();
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.db') || f.endsWith('.sqlite') || f.endsWith('.bak'))
      .map(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return { name: f, path: full, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
    return { ok: true, backups: files };
  } catch (err) {
    return { ok: false, error: err.message, backups: [] };
  }
});

ipcMain.handle('backup-db', async (_evt, args) => {
  try {
    const dbPath = getActiveSqlitePath();
    if (!fs.existsSync(dbPath)) return { ok: false, error: `Database not found: ${dbPath}` };

    const dir = args?.dir || getBackupDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const label = args?.label ? `_${args.label.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
    const destName = `aod_tracker_backup_${stamp}${label}.db`;
    const destPath = path.join(dir, destName);

    fs.copyFileSync(dbPath, destPath);
    const stat = fs.statSync(destPath);
    return { ok: true, file: destName, path: destPath, size: stat.size };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('restore-db', async (_evt, args) => {
  try {
    const sourcePath = args?.path;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Backup file not found.' };
    }
    const dbPath = getActiveSqlitePath();

    // Auto-backup current DB before restore
    const dir = getBackupDir();
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const preName = `aod_tracker_pre-restore_${stamp}.db`;
    const prePath = path.join(dir, preName);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, prePath);
    }

    fs.copyFileSync(sourcePath, dbPath);
    return { ok: true, message: `Database restored. Pre-restore backup saved as ${preName}.` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browse-backup-restore', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File to Restore',
    defaultPath: getBackupDir(),
    filters: [
      { name: 'Database Files', extensions: ['db', 'sqlite', 'sqlite3', 'bak'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('browse-backup-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder to Save Backup',
    defaultPath: getBackupDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-backup-dir', async () => {
  const dir = getBackupDir();
  shell.openPath(dir);
  return { ok: true };
});
