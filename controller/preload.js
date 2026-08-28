const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controllerApi', {
  startServer:        (args)  => ipcRenderer.invoke('start-server', args),
  stopServer:         ()      => ipcRenderer.invoke('stop-server'),
  openWeb:            (args)  => ipcRenderer.invoke('open-web', args),
  getStatus:          ()      => ipcRenderer.invoke('get-status'),
  minimizeToTray:     ()      => ipcRenderer.invoke('minimize-to-tray'),
  quitApp:            ()      => ipcRenderer.invoke('quit-app'),
  // Database configuration
  getDbConfig:        ()      => ipcRenderer.invoke('get-db-config'),
  saveDbConfig:       (cfg)   => ipcRenderer.invoke('save-db-config', cfg),
  testDbConnection:   (cfg)   => ipcRenderer.invoke('test-db-connection', cfg),
  browseSqlitePath:   ()      => ipcRenderer.invoke('browse-sqlite-path'),
  openDbDir:          ()      => ipcRenderer.invoke('open-db-dir'),
  // Server IP
  getServerIps:       (port)  => ipcRenderer.invoke('get-server-ips', port),
  // Backup / Restore
  listBackups:        ()      => ipcRenderer.invoke('list-backups'),
  backupDb:           (args)  => ipcRenderer.invoke('backup-db', args),
  restoreDb:          (args)  => ipcRenderer.invoke('restore-db', args),
  browseBackupRestore:()      => ipcRenderer.invoke('browse-backup-restore'),
  browseBackupDir:    ()      => ipcRenderer.invoke('browse-backup-dir'),
  openBackupDir:      ()      => ipcRenderer.invoke('open-backup-dir'),
  // Events
  onLog:              (cb) => ipcRenderer.on('log',           (_e, line)   => cb(line)),
  onServerStatus:     (cb) => ipcRenderer.on('server-status', (_e, status) => cb(status)),
});
