# AOD Tracker - Deployment Version

This is a deployment-ready version of the AOD Tracker application configured for hosting platforms.

## Deployment Requirements Checklist

✅ **package.json** - Contains `name`, `version`, `main`, `build`, and `start` scripts  
✅ **Port binding** - Server listens on `process.env.PORT`  
✅ **Dependencies** - All runtime deps in root `package.json`  
✅ **Environment variables** - Uses `JWT_SECRET`, `ADMIN_PASSWORD`, `PORT`, `HOST`  
✅ **Vite build** - `npm run build` creates production bundle  
✅ **File size** - `node_modules/`, `dist/`, `*.db` excluded via `.gitignore`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 8080 | Server port |
| `HOST` | No | 0.0.0.0 | Server bind address |
| `JWT_SECRET` | Yes (prod) | dev-fallback | JWT signing secret |
| `ADMIN_PASSWORD` | Yes (prod) | admin123 | Admin panel password |
| `NODE_ENV` | No | - | Set to 'production' for production mode |

## Deployment Steps

1. **Zip the project** (exclude node_modules):
   ```bash
   # Windows PowerShell
   Compress-Archive -Path * -DestinationPath aod-tracker-deploy.zip -Exclude @("node_modules","dist","*.db")
   ```

2. **Upload** the zip to your hosting platform

3. **Set environment variables** in platform dashboard:
   - `JWT_SECRET` - generate a secure random string
   - `ADMIN_PASSWORD` - set a strong admin password
   - `NODE_ENV=production`

4. **Platform will automatically**:
   - Run `npm install` to install dependencies
   - Run `npm run build` to build the frontend
   - Run `npm start` to start the server

## Local Testing (Pre-deployment)

```bash
# Install dependencies
npm install

# Build and start (simulates platform behavior)
npm start

# Or manually:
npm run build
node server/index.js
```

## Default Test Users

For testing purposes, three default user accounts are available:

| Username | Password | Role | Display Name | Unique ID |
|----------|----------|------|--------------|-----------|
| `admin` | `Admin123!` | admin | Administrator | ADMIN001 |
| `supervisor` | `Super123!` | supervisor | T Supervisor | SUPER001 |
| `user` | `User123!` | user | T User | USER001 |

Run `node setup-default-users.mjs` to create these users in the database.

## Changes Made for Deployment

1. **package.json**: Added `main: server/index.js`, merged server dependencies, updated `start` script to build then start
2. **server/index.js**: Uses `process.env.PORT` (line 23), all secrets from environment variables
3. **.gitignore**: Excludes `node_modules/`, `dist/`, `*.db` for file size compliance
4. **User System**: Added DisplayName field, RBAC with 3 roles, user self-management API
5. **Top-right user menu**: Added UserProfile component for profile/password management

## Notes

- This deployment version includes **all server dependencies** in the root `package.json`
- The original project structure is preserved under `server/` directory
- Database is SQLite (file-based) - configure `DB_PATH` env var to change location
- Frontend is served statically by Express (no separate Vite preview needed)
