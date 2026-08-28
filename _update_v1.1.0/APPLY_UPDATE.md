# AOD Tracker — Update v1.1.0 (differential package)

This package contains only the files that changed in v1.1.0. Applying it upgrades
your existing installation **in place** and does **not** touch your data.

## What's new in v1.1.0
- **Admin → Import Data**: upload the AOD Tracker / Patient Tracker Excel files.
  Re-importing is safe — existing records are detected and skipped (no duplicates).
- **Admin → Bulk Edit**: view, search, inline-edit, bulk-update and delete
  AOD tests, patient events, workers and employers.
- **Automatic safety backup** before every import and every bulk change.
- **Scheduled automatic backups** (configurable via `BACKUP_INTERVAL_HOURS`,
  retention via `BACKUP_KEEP`).

## What is NOT touched
- Database — `server/database/aod_tracker.db`
- Uploaded files — `server/uploads/`
- Config — `.env`
- Backups — `backups/`

## Files included
```
version.json
version.txt
package.json
UPDATE.bat
server/index.js
server/importers.js        (new)
server/import-cli.js        (new)
src/pages/Admin.jsx
```

## How to apply (on the machine running the server)

1. **Stop the server.** Right-click the AOD Tracker tray icon → Quit
   (or close the server window). Confirm no `node.exe` is running.

2. **Back up first (optional but recommended).** Copy
   `server\database\aod_tracker.db` somewhere safe. (UPDATE.bat also does this.)

3. **Copy these files over the existing install.** Extract this package and copy
   its contents into your AOD Tracker application folder, letting it **overwrite**
   the existing files. Keep the same folder layout (server\ over server\, etc.).
   Your database / .env / uploads / backups are not in this package, so they stay.

4. **Run `UPDATE.bat`** (double-click). It will:
   - confirm the server isn't running,
   - back up the database to `backups\`,
   - run `npm install` only if `package.json` changed,
   - rebuild the frontend (compiles the new Admin tabs),
   - stamp the version to 1.1.0.

5. **Start the server** and open the app. Log in to **Admin** — you should see the
   new **Import Data** and **Bulk Edit** tabs.

## Importing your spreadsheets after updating
- Go to **Admin → Import Data**.
- Use **Preview (dry run)** first to see what would be added (nothing is written).
- Then **Import**. A safety backup is taken automatically beforehand.
- Re-running the same file later only adds new rows — duplicates are skipped.

(Equivalent command-line option, run from the `server` folder:)
```
node import-cli.js aod      "C:\path\to\AOD Tracker V2.xlsx"      --dry-run
node import-cli.js patient  "C:\path\to\Patient Tracker V2.xlsx"  --dry-run
```
Drop `--dry-run` to write for real.

## Rollback
If anything looks wrong, stop the server and restore the pre-update database
copy from `backups\` over `server\database\aod_tracker.db`, then restart.
