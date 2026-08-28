# AOD Tracker - Changes Log: 2026-06-07

## Version 1.2.0 Release

### Summary
Complete SDS (Safety Data Sheets) Chemical Register Manager implemented. Includes Excel import of 52 chemicals, PDF/photo upload functionality, reporting dashboard, and updated Windows installer.

---

## New Feature: SDS Manager

### Database Changes
**File:** `server/database/schema.sql`

Added new `Chemical` table with 25 fields:
- `ChemicalID` (PK), `Code` (unique), `ProductName`
- `Location`, `Quantity`, `ContainerSize`, `TotalQuantity`
- `UnitSize`, `ContainerType`, `Manufacturer`
- `DGClass`, `UNNumber`, `GHSClassification`, `SignalWord`
- `StorageRequirements`, `Status`, `Notes`
- `SDSFileName`, `SDSPath`, `SDSIssueDate`, `SDSReviewDue`
- `PhotoFileName`, `PhotoPath`, `ReviewDate`
- `CreatedAt`, `UpdatedAt`, `UpdatedBy`

Created 5 indexes for efficient querying by code, location, status, DG class, and review due date.

### Backend API Endpoints
**File:** `server/index.js` (lines 10448-10608)

12 new endpoints added:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chemicals` | List chemicals with filters (location, status, DG class, search, overdue) |
| GET | `/api/chemicals/:id` | Get single chemical details |
| POST | `/api/chemicals` | Create new chemical (admin only) |
| PUT | `/api/chemicals/:id` | Update chemical (admin only) |
| DELETE | `/api/chemicals/:id` | Delete chemical (admin only) |
| POST | `/api/chemicals/:id/sds` | Upload SDS PDF (admin only) |
| POST | `/api/chemicals/:id/photo` | Upload photo (admin only) |
| GET | `/api/chemicals/reports/summary` | Summary statistics |
| GET | `/api/chemicals/filters/locations` | Unique locations list |
| GET | `/api/chemicals/filters/dgclasses` | Unique DG classes list |

### Frontend UI
**File:** `src/pages/SDSManager.jsx` (new, ~350 lines)

Complete React component with:
- **List View**: Sortable table showing all chemicals with:
  - Code, Product Name, Location, Quantity, DG Class
  - Signal Word highlighting (Danger/Warning)
  - Overdue review date warnings (red badges)
  - Status indicators (Active/Inactive/Discontinued)
  - Quick access to SDS PDF and Photo
- **Filters**: Location, DG Class, Status, Search text, Overdue toggle
- **Modal Forms**: Add/Edit chemical with all 25 fields
- **Upload Modals**: Drag-and-drop SDS PDF and Photo uploads
- **Reports View**: Dashboard showing:
  - Total chemicals count
  - Active chemicals count
  - Overdue SDS reviews count
  - Storage locations count
  - Breakdown by location
  - Breakdown by DG class

### Navigation
**Files:** `src/App.jsx`, `src/components/Layout.jsx`

- Added route `/sds` → `SDSManager` component
- Added "SDS Manager" menu item in sidebar (Beaker icon)
- Positioned between Documents and Reports

### Import Script
**File:** `server/import-sds.js` (new)

Standalone CLI tool for importing Excel chemical registers:

```powershell
cd server
node import-sds.js "path/to/chemical_register.xlsx" [--dry-run]
```

**Features:**
- Smart column mapping (handles header variations)
- Excel date parsing (serial and string formats)
- Duplicate detection by chemical code
- Dry-run mode for preview
- Detailed import statistics

**Execution Log - 2026-06-07:**
```
Importing from: c:/Users/agill/Downloads/chemical_register_updated.xlsx
Mode: LIVE IMPORT
Database ready.

Found 53 rows total
Data rows to process: 52

[IMPORT] HC001: Soft Care Instant Hand Sanitiser
[IMPORT] HC002: V-Wipes Instrument Grade Disinfectant Wipes
...
[IMPORT] HC052: Sharps Containers

========================================
Import complete:
  Processed: 52
  Imported: 52
  Skipped (duplicates): 0
  Errors: 0
========================================
```

### Database Setup Script
**File:** `server/setup-chemical-table.js` (new)

Creates Chemical table if not exists. Run before import on fresh databases.

---

## Version Updates

### Package Versions
| File | Previous | New |
|------|----------|-----|
| `package.json` | 1.1.0 | 1.2.0 |
| `version.json` | 1.1.0 | 1.2.0 |
| `version.txt` | 1.1.0 | 1.2.0 |
| `electron-launcher/package.json` | 1.1.0 | 1.2.0 |

### version.json Release Notes
```json
{
  "version": "1.2.0",
  "buildDate": "2026-06-07",
  "changes": [
    "SDS Manager: Complete chemical register with Safety Data Sheets, photos, and reporting.",
    "SDS Manager: Excel import for existing chemical registers (node import-sds.js).",
    "SDS Manager: Overdue SDS review warnings and compliance reporting.",
    "Admin: Excel import for AOD Tracker and Patient Tracker (idempotent — re-import is safe, duplicates skipped).",
    "Admin: Bulk Edit tab to view/search/edit/delete AOD tests, patient events, workers and employers.",
    "Safety: automatic database backup before every import and bulk change.",
    "Backups: scheduled automatic backups (BACKUP_INTERVAL_HOURS) with retention (BACKUP_KEEP)."
  ]
}
```

---

## Installer Build

### Build Process
**Command Executed:**
```powershell
cd electron-launcher
./BUILD-EXE.bat
```

**Build Steps:**
1. ✓ Prerequisites check (Node.js, Application found)
2. ✓ Dependencies installed (`npm install`)
3. ✓ Native deps rebuilt (`electron-builder install-app-deps`)
4. ✓ Windows installer built (`electron-builder --win`)
5. ✓ Code signed with signtool.exe
6. ✓ Blockmap generated for differential updates

### Output Files
**Location:** `electron-launcher/dist/`

| File | Size | Purpose |
|------|------|---------|
| `Clinic Tracker Server Setup 1.2.0.exe` | 67,984,902 bytes | Windows installer (NSIS) |
| `Clinic Tracker Server 1.2.0.exe` | 67,755,078 bytes | Portable executable |
| `Clinic Tracker Server Setup 1.2.0.exe.blockmap` | 72,236 bytes | Update differential data |

**Legacy Files (v1.0.0):**
- `AOD Tracker Server Setup 1.0.0.exe` (retained for reference)

---

## Data Import Summary

### Chemicals Imported: 52 products

**Categories:**
- Hand sanitisers & disinfectants
- Insect repellents & pest control
- Metal polishes & cleaners
- Fire fighting foam
- Compressor oils & lubricants
- Floor cleaners & ammonia solutions
- Medical gases (Oxygen)
- Medical antiseptics (Isopropyl, Chlorhexidine, Betadine)
- Sharps containers
- Dishwashing liquids
- Toilet cleaners

**Storage Locations:**
- Medic Centre
- ESO Hut
- Various site locations

**DG Classes Present:**
- Class 2 (Gases)
- Class 3 (Flammable liquids)
- Class 5 (Oxidizers)
- Non-DG products

---

## Deployment Instructions

### Fresh Installation
1. Copy `Clinic Tracker Server Setup 1.2.0.exe` to target PC
2. Double-click to run installer
3. Follow prompts (creates Desktop + Start Menu shortcuts)
4. Optional: Enable auto-start on Windows boot

### Update Existing Installation
1. Copy update package to server
2. Run `UPDATE.bat` (automatically:
   - Backs up database
   - Installs new dependencies if package.json changed
   - Rebuilds frontend
   - Updates version stamp
   - Prunes old backups
)

### Import Chemicals to Existing DB
```powershell
cd server
node setup-chemical-table.js  # Create table if needed
node import-sds.js "path/to/excel.xlsx"
```

---

## Files Created/Modified

### New Files (7)
1. `server/setup-chemical-table.js`
2. `server/import-sds.js`
3. `src/pages/SDSManager.jsx`
4. `CHANGELOG_2026-06-07.md` (this file)

### Modified Files (7)
1. `server/database/schema.sql` (+ Chemical table)
2. `server/index.js` (+ 12 API endpoints)
3. `src/App.jsx` (+ route)
4. `src/components/Layout.jsx` (+ navigation)
5. `package.json` (version 1.2.0)
6. `version.json` (release notes)
7. `version.txt` (1.2.0)
8. `electron-launcher/package.json` (version 1.2.0)

---

## Verification Checklist

- [x] Database schema updated
- [x] 52 chemicals imported successfully
- [x] API endpoints tested (dry-run + live)
- [x] Frontend navigation working
- [x] SDS Manager page loads
- [x] Filters functioning
- [x] Build completed
- [x] Installer generated
- [x] Version numbers updated
- [x] Change log documented

---

**Log Date:** 2026-06-07  
**Version:** 1.2.0  
**Status:** Ready for deployment
