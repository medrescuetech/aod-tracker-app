# Clinic Tracker — TODO & Project Status

> **Current version:** 1.2.0 · **Last updated:** 2026-09-27
> **Repo:** https://github.com/agillam69/aod-tracker-app
> **Active folder:** `clinic-tracker-app/`

---

## Project Overview

All-in-one clinic management system covering AOD testing, patient tracking, training records, chemical safety (SDS), scheduling, and reporting. Deployed as a Node.js/Express + React (Vite) app with SQLite. Electron launcher provides a desktop wrapper.

---

## Implemented Features (Done)

### Core — AOD Testing
- [x] Record AOD tests (oral, BAC, urine)
- [x] Drug & alcohol final result auto-calculation
- [x] RFT (Request for Testing) logic
- [x] Non-negative case management
- [x] Pending results tracking
- [x] Confirmatory result & medication review workflow
- [x] Lab process integration (sent to lab, lab reference, confirmatory)
- [x] Override results with reason
- [x] Test history with search & filters
- [x] Test detail view with full audit trail

### Core — Patient Tracker
- [x] Patient event recording (WR/NWR, injury type, body location, classification)
- [x] Patient record view with event history
- [x] Patient search across AOD & clinical records
- [x] WR/NWR normalization and derived fields

### Core — Workers & Employers
- [x] Worker register with employer, badge, employee number
- [x] Employer management
- [x] Worker type classification (Contractor, SCJV Staff, etc.)

### Scheduling & Testing Management
- [x] Test scheduling (random selection, pre-employment, for cause, post incident)
- [x] Scheduling calendar view
- [x] Testing management dashboard
- [x] Clinician / tester management

### Training Tracker
- [x] Training records (type, trainer, dates, expiry)
- [x] ESO report generation
- [x] Training expiry warnings

### Checks Tracker
- [x] Equipment / compliance checks

### SDS Manager (v1.2.0)
- [x] Chemical register (52 chemicals imported)
- [x] SDS PDF upload/viewer
- [x] Photo upload/viewer
- [x] Reports by location, DG class, status
- [x] Overdue SDS review warnings
- [x] Excel import script (`server/import-sds.js`)

### Reports Hub
- [x] 12 report categories (AOD Operational, Compliance, Trend, Clinical, etc.)
- [x] Custom report builder (AOD, Patient, Training datasets)
- [x] Saved report templates
- [x] Excel export (`.xlsx` download)
- [x] PDF export (print-ready HTML)
- [x] Drill-down from aggregate to raw records

### Quarterly Report
- [x] Quarterly AOD contractor report generator
- [x] Matches Excel report format (Random / Pre-Employment / Cause / Post Incident / Other)
- [x] Drug totals (negative, non-negative, confirmed positive, pending)
- [x] Alcohol totals (negative, positive)
- [x] Unique worker counts
- [x] Detail sections: non-neg, BAC positive, for cause, pending
- [x] Copy-to-clipboard for each table (paste into Excel)
- [x] Print view

### Admin & Data Management
- [x] Admin panel with authentication
- [x] Bulk edit tab (view/search/edit/delete tests, patients, workers, employers)
- [x] Excel import for AOD & Patient data (idempotent, duplicates skipped)
- [x] Automatic database backup before imports and bulk changes
- [x] Scheduled backups (configurable interval & retention)
- [x] User management
- [x] Audit logging

### Documents
- [x] Document management page
- [x] Site documents, policies, reference materials

### Settings
- [x] Font size preference
- [x] Medication integration settings

### Infrastructure
- [x] Electron launcher (desktop wrapper)
- [x] Windows installer (NSIS via electron-builder)
- [x] UPDATE.bat for in-place updates
- [x] INSTALL.bat with auto-detection of fresh vs update
- [x] `.env` configuration for DB_PATH, DB_TYPE, ports, etc.
- [x] SQLite + MSSQL support
- [x] Version checking & update notifications

---

## Remaining Tasks / Improvements

### High Priority

- [ ] **Version bump to 1.3.0** — Increment version for all changes since 1.2.0 (quarterly report, settings expansion, medication integration, DOB cleanup)
- [ ] **Rebuild installer** — Recompile electron-launcher after version bump
- [ ] **Git sync** — Push all current local changes to `aod-tracker-app` repo
- [ ] **Archive/delete other GitHub repos** — `aod-tracker` and `Clinic-Tracker` repos are stale; archive or delete to avoid confusion

### Medium Priority

- [ ] **Quarterly report — Excel export** — Add direct `.xlsx` download button matching the contractor report template format (currently copy-paste only)
- [ ] **Quarterly report — date range validation** — Warn if selected quarter has no data
- [ ] **SDS Manager — bulk photo/SDS upload** — Allow batch upload of PDF/photo files matched by chemical code
- [ ] **SDS Manager — expiry notifications** — Dashboard widget or email alert for upcoming SDS reviews
- [ ] **Patient Tracker — weekly report** — Auto-generate weekly summary (total presentations, WR/NWR breakdown, ED referrals)
- [ ] **Move SQLite DB out of OneDrive** — Configure `DB_PATH` to a local folder to prevent cloud sync conflicts
- [ ] **Test suite** — Playwright E2E tests exist but need updating for new features (SDS, Quarterly, Settings)

### Low Priority / Nice-to-Have

- [ ] **Dark mode** — Theme toggle in Settings
- [ ] **Dashboard widgets** — Configurable dashboard tiles (overdue SDS, pending results, upcoming training expiry)
- [ ] **Mobile responsive** — Improve layout for tablet/phone use on-site
- [ ] **Donor management** — `Donors.jsx` page exists but may need completion
- [ ] **Email notifications** — SMTP integration for overdue alerts (SDS, training, pending results)
- [ ] **Multi-site support** — Filter all data by site/location for multi-clinic deployments
- [ ] **API documentation** — OpenAPI/Swagger spec for server endpoints

### Technical Debt

- [ ] **Clean up archive folder** — `archive/` contains old import scripts and test Excel files; review and delete if no longer needed
- [ ] **Consolidate .md documentation** — Multiple deployment guides (`DEPLOYMENT.md`, `CLINIC_DEPLOYMENT.md`, `DEPLOY_README.md`, `STAGING.md`); merge into one
- [ ] **Remove old installer artifacts** — `electron-launcher/dist/` has v1.0.0 files alongside v1.2.0; clean up old builds
- [ ] **Controller dist** — `controller/dist/` is ~450MB of packaged Electron; should not be in source tree. Build on demand only

---

## Deployment Instructions

### Development
```powershell
cd "clinic-tracker-app"
npm run dev              # Vite dev server with hot reload
cd server && node index.js  # Backend
```

### Production Update (Existing Install)
```powershell
cd "clinic-tracker-app"
.\UPDATE.bat             # Backs up DB, rebuilds frontend, updates version
```

### Fresh Install
```powershell
cd "clinic-tracker-app"
.\INSTALL.bat            # Full setup
```

### Build Installer
```powershell
cd "clinic-tracker-app\electron-launcher"
.\BUILD-EXE.bat          # Produces Setup .exe in dist/
```

### Import Data
```powershell
cd "clinic-tracker-app\server"
node import-sds.js "path/to/chemical_register.xlsx" --dry-run   # Preview
node import-sds.js "path/to/chemical_register.xlsx"              # Live import
```

### Git Sync
```powershell
cd "AOD tracker"
git add -A
git commit -m "description of changes"
git push origin master
```

---

## File Structure (Key Files)

```
clinic-tracker-app/
├── src/
│   ├── pages/              # React pages (27 pages)
│   ├── components/         # Shared components (Layout, ReportViewer, etc.)
│   └── services/api.js     # API client
├── server/
│   ├── index.js            # Express API (~10,800 lines)
│   ├── db.js               # Database abstraction (SQLite/MSSQL)
│   ├── database/schema.sql # Full schema
│   └── import-sds.js       # Chemical register import
├── electron-launcher/      # Electron desktop wrapper + installer build
├── controller/             # Alternative Electron controller
├── package.json            # v1.2.0
├── version.json            # Release metadata
└── .env                    # Environment config (not tracked)
```

---

## GitHub Repos

| Repo | Status | Action |
|------|--------|--------|
| `agillam69/aod-tracker-app` | **Active** — this is the one | Keep, push to |
| `agillam69/aod-tracker` | Stale | Archive or delete |
| `agillam69/Clinic-Tracker` | Stale | Archive or delete |

---

## Notes

- Database is currently in OneDrive-synced folder — works for single machine but will cause conflicts on multi-device sync. Set `DB_PATH` in `.env` for production.
- The `controller/dist/` folder (~450MB) is a packaged Electron build. It's gitignored and should be rebuilt when needed, not stored in source.
- DOB cleanup was run on 2026-06-08 — 10 records with guessed 1-Jan DOBs set to NULL.
- Chemical register imported on 2026-06-07 — 52 chemicals from Excel.
