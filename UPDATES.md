# AOD Tracker - Update Guide

## How Updates Work

### ✅ What always gets updated
- Application code (`server/`, `src/`, `dist/`)
- Node.js dependencies (only when `package.json` changes)
- Electron launcher files

### 🔒 What is NEVER touched by an update
| Item | Location |
|------|----------|
| **Database** | `server/database/aod_tracker.db` |
| **Uploaded files** | `server/uploads/` |
| **Environment config** | `.env` |
| **Backups** | `backups/` |

---

## Update Methods

### Method 1: Smart Update Script (Recommended)

Double-click **`UPDATE.bat`** in the AOD Tracker folder.

The script automatically:
1. Checks the server is not running (prompts you to stop it if so)
2. **Backs up the database** to `backups/aod_tracker-YYYYMMDD-HHMM.db`
3. Detects whether `package.json` changed — only runs `npm install` if needed
4. Rebuilds the frontend
5. Updates `version.txt`
6. Prunes old backups (keeps the 10 most recent)

> **No data loss possible** — the backup is made before any code changes.

---

### Method 2: INSTALL.bat on an existing machine

Running `INSTALL.bat` on a machine that already has a database automatically
routes to `UPDATE.bat`. You don't need to worry about which script to use —
both are safe.

---

### Method 3: In-App Update Check

**Best for:** Being notified of new versions

**How it works:**
1. AOD Tracker checks for `version.json` file on startup
2. If newer version exists, shows notification
3. Click "Download Update" in tray menu
4. System opens browser to download page
5. Install new version

**To enable:**
Edit `version.json` in the AOD Tracker folder:
```json
{
  "version": "1.1.0",
  "downloadUrl": "https://your-website.com/download"
}
```

---

## Version Information

### Check Current Version

**In the app:**
- Right-click system tray icon
- Click "About"
- Shows: `Version: X.X.X`

**In files:**
- Open `electron-launcher/main.js`
- Look for: `const APP_VERSION = '1.0.0'`

### Version File

Create `version.json` in the AOD Tracker folder to enable update notifications:

```json
{
  "version": "1.1.0",
  "buildDate": "2024-02-01",
  "downloadUrl": "https://your-clinic.com/downloads/aod-tracker-v1.1.0.exe",
  "releaseNotes": "https://your-clinic.com/changelog",
  "updateInstructions": "Download and run the installer. Your database will be preserved."
}
```

When app version ≠ version.json version → Update notification shown

---

## Database Safety

### Where Is My Data?
- **Database:** `server/database/app.db`
- **Backups:** `backups/app-YYYY-MM-DD.db`

### Automatic Backups
The update process automatically creates backups before any changes:
- Pre-update backup
- Daily backups (if configured)
- Manual backups via `UPDATE.bat`

### Database Never Deleted
The installer and update scripts **never** delete or overwrite:
- `server/database/app.db`
- `.env` configuration file
- `backups/` folder contents

---

## Rollback (If Update Goes Wrong)

If something breaks after update:

**Option 1: Restore from backup**
```powershell
# Stop server
# Copy backup over current database
copy backups\app-pre-update-YYYYMMDD.db server\database\app.db
# Restart server
```

**Option 2: Reinstall old version**
1. Uninstall current version
2. Install previous version
3. Database remains intact

---

## Best Practices for Updates

### Before Updating:
1. ✅ Note current version (About menu)
2. ✅ Verify database backup exists
3. ✅ Close all browsers using the app
4. ✅ Stop the server

### During Update:
1. ✅ Use official installer
2. ✅ Don't interrupt installation
3. ✅ Wait for completion

### After Updating:
1. ✅ Start server
2. ✅ Check app loads correctly
3. ✅ Verify data is present
4. ✅ Test critical features
5. ✅ Check version number updated

---

## Update Checklist for IT/Admin

When distributing updates to clinic:

```markdown
□ New version tested in staging
□ Database backup verified
□ Update instructions prepared
□ Installer tested on clean machine
□ Rollback procedure documented
□ Staff notified of changes
□ Update scheduled during low-use time
□ Post-update verification complete
```

---

## Troubleshooting Updates

### "Database is locked" error
- Close all browser tabs using the app
- Stop server properly (Quit from tray)
- Wait 30 seconds, try again

### Update appears to fail
- Check Windows Defender/antivirus
- Run installer as Administrator
- Check disk space available

### Data appears missing after update
- Check you're using same database path
- Look in `backups/` for pre-update backup
- Verify `.env` file settings

### Can't find new version
- Check `version.json` exists and is valid JSON
- Verify version number is higher than current
- Check download URL is accessible

---

## Automated Updates (Advanced)

For clinics with IT support, consider:

### Silent Installation
```powershell
# Silent install (no prompts)
AOD-Tracker-Server-Setup.exe /S
```

### Group Policy Deployment
- Deploy MSI via Active Directory
- Scheduled updates after hours
- Centralized version management

### Custom Update Server
Host `version.json` on internal server:
```json
{
  "version": "1.1.0",
  "downloadUrl": "\\\fileserver\shared\AOD-Tracker-Setup.exe"
}
```

---

## FAQ

**Q: Will I lose my data when updating?**
A: No. The database is never overwritten during updates.

**Q: Do I need to reconfigure settings after update?**
A: No. `.env` file and database settings are preserved.

**Q: Can I downgrade if I don't like the new version?**
A: Yes. Uninstall current version, install old version, database remains.

**Q: How do I know when an update is available?**
A: Set up `version.json` file, or check your email/website for announcements.

**Q: Can updates happen automatically?**
A: Not by default (for safety). You must run the installer manually.

**Q: What about security updates?**
A: These should be installed immediately. Check release notes.

---

## Summary

| Aspect | Behavior |
|--------|----------|
| **Database** | ✅ Never deleted/overwritten |
| **Settings** | ✅ Preserved (.env file) |
| **Process** | ⚡ Install new version, done! |
| **Rollback** | ✅ Restore from backup |
| **Notification** | ✅ Via version.json |

**Bottom line:** Updating is safe and simple. Your data is protected.
