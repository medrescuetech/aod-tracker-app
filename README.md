# AOD Tracker

Single repository containing the Clinic / AOD / Patient / Training tracker and its legacy versions.

## Active Package

| Folder | Status | Description |
|--------|--------|-------------|
| `clinic-tracker-app/` | **Active** | Clinic Tracker v1.2.0 — AOD testing, patient events, training records, SDS register. This is the package being deployed. |

## Legacy / Archive Folders

| Folder | Status | Description |
|--------|--------|-------------|
| `aod-tracker-app/` | Legacy | Earlier AOD-only tracker. Superseded by `clinic-tracker-app`. |
| `clinical-ai-sidebar/` | Archive | Experimental AI sidebar, not currently maintained. |
| `V1/` | Archive | Version 1 files. |
| `V2/` | Archive | Version 2 design / prototype files. |
| `_archive/` | Archive | Miscellaneous archived files. |

## Local Resources (not tracked in Git)

| Item | Location | Purpose |
|------|----------|---------|
| Backups | `Backups/` | Local backup copies |
| Excel templates | `*.xlsx` | Roster / tracker templates |
| PDF forms | `*.pdf` | Site forms and notifications |
| Python venv | `.venv/` | Local Python environment |

## Quick Start

All active work is in `clinic-tracker-app/`:

```powershell
cd "clinic-tracker-app"
npm run build
cd server
npm test
```

## Deployment

See the guides inside `clinic-tracker-app/`:

- `clinic-tracker-app/CLINIC_DEPLOYMENT.md` — small clinic setup
- `clinic-tracker-app/DEPLOYMENT.md` — production server deployment
- `clinic-tracker-app/STAGING.md` — pre-deployment testing

## Notes

- The `.env` file inside `clinic-tracker-app/` is ignored by Git and must be configured per environment.
- Do not place the production SQLite database inside a OneDrive / cloud-synced folder. Use a local `DB_PATH`.
