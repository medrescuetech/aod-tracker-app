# AOD Tracker - Electron Launcher

Professional desktop launcher for AOD Tracker Server with system tray support.

## ⚡ Quick Start (Clinic Deployment)

### Recommended: Installed Version (Fastest)

```powershell
cd electron-launcher
BUILD-EXE.bat
```

Creates: `dist\AOD Tracker Server Setup.exe`

**Installation:**
1. Copy `AOD Tracker Server Setup.exe` to clinic PC
2. Double-click to install (takes 30 seconds)
3. Desktop + Start Menu shortcuts created
4. Run "AOD Tracker Server" from Desktop

**Benefits:**
- ✅ Installs once, runs instantly (no unpacking)
- ✅ Auto-start on Windows boot (optional)
- ✅ Professional installed application
- ✅ Easy to uninstall if needed

---

## 📦 Two Build Options Explained

### Option 1: Installed Application (RECOMMENDED)
```bash
npm run build
```
- Creates: `AOD Tracker Server Setup.exe`
- **Installs to**: `C:\Program Files\AOD Tracker Server\`
- **Speed**: Fast startup (files already unpacked)
- **Best for**: Daily clinic use, permanent installation
- **Distribution**: One-time install, then shortcuts work

### Option 2: Portable Application
```bash
npm run pack
```
- Creates: `AOD Tracker Server.exe` (single file)
- **Runs from**: Any folder (USB, Desktop, etc.)
- **Speed**: Slower startup (unpacks temp files each run)
- **Best for**: USB drives, temporary testing, demos
- **Distribution**: Copy single file anywhere

---

## 🖥️ How It Works

```
User clicks Desktop Icon
    ↓
Electron Launcher starts
    ↓
Node.js server starts in background
    ↓
System tray icon appears
    ↓
Staff click "Open in Browser"
    ↓
Web app opens in Chrome/Edge
```

## 🎯 Features

- ✅ **System Tray Icon** - Runs quietly in background
- ✅ **Auto-Start Server** - Server starts automatically
- ✅ **One-Click Browser** - Opens app in default browser
- ✅ **Visual Status Window** - See server status
- ✅ **Auto-Start on Boot** - Optional Windows startup
- ✅ **Professional Look** - Native Windows application
- ✅ **Update Notifications** - Automatic version checking
- ✅ **Safe Updates** - Database preserved during updates

## 🔧 Building

### Requirements
- Windows 10/11
- Node.js 18+

### Step 1: Install Dependencies
```bash
cd electron-launcher
npm install
```

### Step 2: Build (Choose One)

**For Clinic Production (Recommended):**
```bash
npm run build
# Creates: dist/AOD Tracker Server Setup.exe
```

**For USB/Portable:**
```bash
npm run pack
# Creates: dist/AOD Tracker Server.exe
```

## 📋 Distribution Guide

### Clinic Deployment (Installed Version)

**Your steps:**
1. Build: `BUILD-EXE.bat`
2. Copy `AOD Tracker Server Setup.exe` to USB
3. Take to clinic PC
4. Run installer
5. Done!

**Clinic staff steps:**
1. Double-click "AOD Tracker Server" on Desktop
2. System tray icon appears
3. Click icon → "Open in Browser"
4. Use the app

### USB Distribution (Portable Version)

```bash
npm run pack
```

Copy single `AOD Tracker Server.exe` to USB:
- Plug into any Windows PC
- Double-click to run
- No installation needed
- Slower startup (unpacks each time)

---

## 🔄 Updating the Application

### Automatic Update Notifications

The launcher checks for updates on startup:
1. Reads `version.json` in the application folder
2. Compares with current version
3. Shows notification if update available
4. User clicks to download

### Manual Update Process

**Simple Method:**
1. Stop AOD Tracker Server (right-click tray → Quit)
2. Run new `AOD Tracker Server Setup.exe`
3. Database preserved automatically
4. Launch from Desktop

**With Backup:**
1. Run `UPDATE.bat` in application folder
2. Script backs up database
3. Follow prompts to update
4. Safe and guided process

### What Gets Preserved

✅ **Database** (`server/database/app.db`) - All your data  
✅ **Settings** (`.env` file) - Configuration  
✅ **Backups** - Previous backup files

### What Gets Updated

🔄 Application code  
🔄 Node.js dependencies  
🔄 Electron launcher files

---

## 🛠️ Troubleshooting

### Build Fails
- Ensure you're in `electron-launcher` folder
- Run `npm install` first
- Check Node.js: `node --version`

### Installer Won't Run
- Check Windows Defender (may need to "Run anyway")
- Try right-click → "Run as Administrator"
- Ensure Windows 10/11 (not Windows 7)

### Server Won't Start
- Check if port 8080 is already in use
- Ensure `..\server\index.js` exists
- Check Windows Firewall (allow Node.js)

### App Won't Open in Browser
- Check if server status shows "Running"
- Try different browser (Chrome/Edge recommended)
- Check antivirus isn't blocking localhost

## 🚀 Advanced: Auto-Start on Windows Boot

After installing, the launcher can start automatically:

1. Press `Win + R`, type `shell:startup`, press Enter
2. Copy shortcut from: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\AOD Tracker Server`
3. Paste into Startup folder
4. App will auto-start on Windows boot

## 🗑️ Uninstalling

**If Installed:**
- Windows Settings → Apps → AOD Tracker Server → Uninstall
- Or: Control Panel → Programs and Features

**If Portable:**
- Just delete the .exe file
- No registry entries, clean removal

## 📁 File Structure

```
electron-launcher/
├── main.js              # Main Electron process
├── tray.html            # UI window
├── package.json         # Build configuration
├── BUILD-EXE.bat        # One-click builder
├── icon.ico            # App icon (optional)
└── README.md           # This file
```

## 💡 For End Users (Simple Instructions)

### Daily Use:
1. **Start**: Double-click "AOD Tracker Server" on Desktop
2. **Wait**: System tray icon appears (5 seconds)
3. **Open**: Click tray icon → "Open in Browser"
4. **Use**: Login and use normally
5. **Close**: Right-click tray icon → "Quit"

### One-Time Setup:
1. Install: `AOD Tracker Server Setup.exe`
2. Launch from Desktop shortcut
3. Bookmark the URL on other clinic PCs

No technical knowledge required! 🎉
