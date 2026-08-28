# Clinic Tracker — Server Controller

Desktop application (Electron) that manages the Clinic Tracker backend server.

## What it does

- **Starts/stops** the Node.js backend server
- **Auto-restarts** the server if it crashes
- **Database config** — switch between SQLite and SQL Server from a GUI
- **System tray** — minimises to tray so the server runs in the background
- **Port selection** — run on any port (default 8080)

## Usage

### Development
```bash
cd controller
npm install
npm start
```

### Build portable EXE
```bash
cd controller
npm run pack
```
Output: `controller/dist/Clinic Tracker - Server Controller 1.0.0.exe`

The portable EXE bundles the server and frontend — no Node.js install required on the target machine.

## Architecture

```
controller/
├── main.js          # Electron main process — server lifecycle, IPC, tray
├── preload.js       # Context bridge (renderer ↔ main process)
├── renderer/
│   ├── index.html   # Controller UI — Server tab + Database tab
│   ├── renderer.js  # UI logic
│   └── styles.css   # Dark theme styling
├── icon.png         # App icon
└── package.json     # Electron + electron-builder config
```
