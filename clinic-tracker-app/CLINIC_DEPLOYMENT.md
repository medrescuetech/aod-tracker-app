# AOD Tracker - Clinic Deployment Guide

## Overview
Deployment options for clinic environments without dedicated servers.

## 🎯 Recommended: Option 1 - Single Desktop Server

### Best For:
- 2-10 computers in clinic
- Existing Windows PCs
- Basic WiFi network
- No IT department

### Setup Steps:

#### 1. Choose the "Server" Computer
Select a PC that:
- Stays on during clinic hours
- Has Windows 10/11
- Connected to clinic WiFi
- Has 4GB+ RAM

#### 2. Install on Server PC
```powershell
# 1. Copy application folder to C:\AODTracker\
# 2. Open PowerShell as Administrator

# Install Node.js if not present (download from nodejs.org)
# Then:
cd C:\AODTracker
npm install
npm run build

# 3. Create startup script
# Save as C:\AODTracker\start-server.bat
@echo off
cd /d C:\AODTracker
set PORT=8080
set NODE_ENV=production
set SERVE_FRONTEND=1
set ADMIN_PASSWORD=YourClinicPassword123
node server/index.js
```

#### 3. Configure Windows Firewall
```powershell
# Allow port 8080 through Windows Firewall
netsh advfirewall firewall add rule name="AOD Tracker" dir=in action=allow protocol=tcp localport=8080
```

#### 4. Find Server IP Address
```powershell
ipconfig
# Look for "IPv4 Address" - e.g., 192.168.1.100
```

#### 5. Auto-Start on Boot
```powershell
# Create shortcut to start-server.bat
# Place in: C:\Users\[Username]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

### Client Setup (Other PCs)

Simply open browser and navigate to:
```
http://192.168.1.100:8080
```

Bookmark this on all clinic computers.

### Backup Strategy
```powershell
# Create backup script (C:\AODTracker\backup.bat)
@echo off
set BACKUP_DIR=C:\AODTracker\backups
set DB_FILE=C:\AODTracker\server\database\app.db

if not exist %BACKUP_DIR% mkdir %BACKUP_DIR%

set TIMESTAMP=%date:~10,4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%
copy %DB_FILE% %BACKUP_DIR%\app_%TIMESTAMP%.db

# Keep only last 7 backups
forfiles /p %BACKUP_DIR% /s /m *.db /d -7 /c "cmd /c del @path"
```

Schedule daily backup with Windows Task Scheduler.

---

## 💻 Option 2: Desktop App (Single User)

### Best For:
- Single reception desk
- Offline operation needed
- Simplest possible setup

### Create Desktop App Package
```bash
# Build Electron wrapper
npm run build

# Package with electron-builder
cd controller
npm run pack

# Creates: Clinic Tracker - Server Controller Setup 1.0.0.exe
# Install on single PC
```

### Features:
- Double-click to start
- Runs in system tray
- Auto-opens browser
- Includes database

---

## 🥧 Option 3: Raspberry Pi / Mini PC Appliance

### Best For:
- Always-on operation
- Professional setup
- Low power consumption

### Hardware Needed:
- Raspberry Pi 4 (4GB) ~$100 OR
- Intel NUC / Beelink Mini PC ~$200
- MicroSD card 32GB+
- Ethernet cable (recommended)

### Setup:
```bash
# On Raspberry Pi (Raspberry Pi OS)
sudo apt update
sudo apt install nodejs npm

# Copy application
cd /home/pi
mkdir aod-tracker
cd aod-tracker
# Copy files...

# Install dependencies
npm install
npm run build

# Create service
sudo nano /etc/systemd/system/aod-tracker.service
```

**Service file content:**
```ini
[Unit]
Description=AOD Tracker Clinic Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aod-tracker
ExecStart=/usr/bin/node server/index.js
Environment=PORT=8080 NODE_ENV=production SERVE_FRONTEND=1 ADMIN_PASSWORD=YourPassword
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable service
sudo systemctl enable aod-tracker
sudo systemctl start aod-tracker
```

---

## 🔐 Security for Clinic Environment

### 1. WiFi Security
- Use WPA3 or WPA2 (not WEP)
- Separate guest WiFi from clinic network
- Consider hiding SSID

### 2. Application Security
```powershell
# Set strong admin password
set ADMIN_PASSWORD=Clinic2024!Secure

# Change JWT secret (generate random)
set JWT_SECRET=your-random-generated-secret-key-here
```

### 3. Windows Security
- Keep Windows updated
- Use Windows Defender
- Don't install unnecessary software on server PC

### 4. Database Security
- Database file is only accessible locally
- Encrypted by default (SQLite)
- Backups stored locally

---

## 📱 Tablet/Mobile Access

Any device on WiFi can access:
- iPad/Android tablets
- Staff smartphones
- Laptop computers

Just open browser to: `http://[server-ip]:8080`

---

## 🔄 Updates

### Simple Update Process:
1. Stop server
2. Backup database
3. Replace files with new version
4. Run `npm install` if dependencies changed
5. Restart server

### Zero-Downtime Update (if needed):
1. Copy app to new folder
2. Start on different port (8081)
3. Test new version
4. Stop old version
5. Switch port to 8080

---

## 🆘 Troubleshooting Clinic Setup

### Can't Access from Other Computers?
1. Check Windows Firewall (allow port 8080)
2. Check if server PC WiFi is "Private" network
3. Try accessing by IP: `http://192.168.x.x:8080`
4. Ping test: `ping 192.168.x.x`

### Server PC Goes to Sleep?
- Windows Settings → Power → Never sleep
- Advanced power settings → Disable sleep

### Database Locked?
- Only one user can write at a time (SQLite limitation)
- Reads are concurrent
- Errors are rare with typical clinic usage

### Forgot Admin Password?
1. Stop server
2. Delete database file (app.db) - **WARNING: All data lost**
3. Restart server (creates new admin)
4. Or: Edit database directly with SQLite browser

---

## 📊 Recommended Setup for Different Clinic Sizes

### Small Clinic (1-3 computers)
**Option 1** - Reception PC as server
- Simple, cost-effective
- No additional hardware

### Medium Clinic (4-10 computers)
**Option 1** - Dedicated old PC as server
- More reliable than daily-use PC
- Can use retired/replaced computer

### Large Clinic (10+ computers)
**Option 3** - Raspberry Pi or Mini PC
- Professional always-on setup
- Low power, reliable

---

## ✅ Pre-Deployment Checklist

- [ ] Server PC selected and stays on
- [ ] Node.js installed (v18+)
- [ ] Application files copied
- [ ] Dependencies installed (`npm install`)
- [ ] Built successfully (`npm run build`)
- [ ] Firewall configured (port 8080)
- [ ] IP address identified
- [ ] Admin password set
- [ ] Backup script created
- [ ] Test from another computer
- [ ] Staff trained on URL/bookmark
- [ ] Backup schedule configured

---

## 📞 Support

Common Issues:
1. **Can't connect**: Check firewall and WiFi network
2. **Slow**: Server PC may be underpowered or busy
3. **Data loss**: Ensure backups are running
4. **Updates**: Follow backup → update → test process

Emergency Contact:
- Keep server PC admin credentials secure
- Document your specific IP address and port
- Maintain recent database backups
