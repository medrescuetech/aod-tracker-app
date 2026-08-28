# AOD Tracker

## Active Project

The current working application is in **`clinic-tracker-app/`**.

Everything else in this folder is archive, legacy or superseded:

| Folder | Status |
|--------|--------|
| `clinic-tracker-app/` | **Active — Clinic Tracker v1.2.0** |
| `aod-tracker-app/` | Superseded by `clinic-tracker-app` |
| `clinical-ai-sidebar/` | Not currently maintained |
| `V1/` | Legacy version |
| `V2/` | Legacy version |
| `_archive/` | Archive |
| `Backups/` | File backups |

## Quick Start

All commands are run from `clinic-tracker-app/`:

```powershell
cd "clinic-tracker-app"
npm run build
cd server
npm test
```

## Deployment

See the deployment guides inside `clinic-tracker-app/`:

- `clinic-tracker-app/CLINIC_DEPLOYMENT.md` — single PC / small clinic setup
- `clinic-tracker-app/DEPLOYMENT.md` — production server deployment
- `clinic-tracker-app/STAGING.md` — pre-deployment testing

## Important Notes

- The `.env` file inside `clinic-tracker-app/` is ignored by Git and must be configured per environment.
- Do not place the production SQLite database inside a OneDrive / cloud-synced folder. Use a local path for `DB_PATH`.
