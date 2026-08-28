# Staging/Production Testing Guide

## Overview
This guide provides instructions for testing the AOD Tracker application in a staging/production-like environment before deployment.

## Pre-Deployment Testing

### 1. Build Verification
```bash
# Clean build
npm run build

# Verify build output
ls -la dist/
```

### 2. Local Production Simulation

**Option A: Using the staging test script (automated)**
```bash
node scripts/staging-test.js
```

This will:
- Start a fresh server on port 3999
- Run smoke tests (health, API endpoints, data operations)
- Run light load test (10 concurrent requests)
- Clean up after completion

**Option B: Manual staging server**
```bash
# Windows PowerShell
$env:PORT=3999; $env:NODE_ENV="staging"; $env:SERVE_FRONTEND="1"; $env:DB_PATH="./server/database/staging.db"; node server/index.js

# Windows CMD
set PORT=3999 && set NODE_ENV=staging && set SERVE_FRONTEND=1 && set DB_PATH=./server/database/staging.db && node server/index.js
```

Then test manually:
```bash
# Health check
curl http://localhost:3999/api/health

# Frontend
curl http://localhost:3999/

# API
curl http://localhost:3999/api/employers
```

### 3. Production Checklist
```bash
node scripts/production-checklist.cjs
```

Verifies:
- ✅ Build output exists
- ✅ Server code present
- ✅ Database schema present
- ✅ Environment variables documented
- ✅ Start scripts configured
- ✅ No hardcoded secrets
- ✅ CORS configured
- ✅ Admin password hashing
- ✅ Health endpoint present
- ✅ Test infrastructure present

## Manual Deployment Simulation

### 1. Fresh Database Test
```bash
# Create a fresh database
set DB_PATH=./fresh-test.db
node server/index.js
```

Verify:
- Server starts without errors
- Schema is created automatically
- Admin user is created
- Health endpoint responds

### 2. Full Workflow Test
1. **Login**: Access the app and log in with admin/admin123
2. **Create employer**: Add a test employer
3. **Create person**: Add a test person
4. **Record AOD test**: 
   - Test with BAC = 0 (should be negative)
   - Test with BAC > 0 (should show workplace warning)
5. **View reports**: Generate daily activity report
6. **Verify data persistence**: Restart server, verify data remains

### 3. Error Handling Test
```bash
# Test invalid requests
curl -X POST http://localhost:3999/api/tests -d "{}"
# Should return 400 error, not crash
```

### 4. Concurrent User Simulation
```bash
# Run 20 parallel health checks
for i in {1..20}; do curl -s http://localhost:3999/api/health & done; wait
```

## Performance Baseline

### Expected Performance (Local)
- Health endpoint: < 50ms
- Page load: < 2s
- Report generation: < 5s (for 1000 records)
- Database operations: < 100ms

### Load Testing
```bash
# Using ab (Apache Bench) if available
ab -n 1000 -c 10 http://localhost:3999/api/health
```

## Security Checks

### 1. API Security
- Test without authentication (should fail or redirect)
- Test with invalid credentials
- Verify rate limiting (if implemented)

### 2. Data Validation
- Submit invalid dates
- Submit extremely long strings
- Submit SQL injection attempts (should be sanitized)

### 3. File Upload (if applicable)
- Try uploading non-allowed file types
- Try uploading oversized files

## Database Testing

### 1. Migration Test
```bash
# Test with older database version
# Backup current, restore old, start server
# Verify migrations run automatically
```

### 2. Backup/Restore Test
```bash
# Backup
cp database/app.db backup/app-$(date +%Y%m%d).db

# Restore
cp backup/app-YYYYMMDD.db database/app.db
```

### 3. Data Integrity
- Create records with all field types
- Update records
- Delete records (soft delete if applicable)
- Verify foreign key constraints

## Browser Compatibility

Test on:
- Chrome (latest)
- Edge (latest)
- Firefox (latest)

Verify:
- Login works
- Forms submit correctly
- Reports display properly
- File downloads work

## Production Deployment Steps

### 1. Final Verification
```bash
# Run all checks
node scripts/pre-deploy-check.cjs
node scripts/production-checklist.cjs
npm test
npm run build
```

### 2. Database Preparation
```bash
# Backup production database if exists
cp database/app.db database/app-backup-$(date +%Y%m%d).db

# Or start fresh for new deployment
```

### 3. Environment Setup
```bash
# Set production environment variables
export NODE_ENV=production
export PORT=3000
export SERVE_FRONTEND=1
export DB_PATH=/path/to/production.db
```

### 4. Start Application
```bash
# Using npm script
npm run start:prod

# Or directly
node server/index.js
```

### 5. Post-Deployment Verification
```bash
# Health check
curl http://localhost:3000/api/health

# View logs
tail -f logs/error-*.log
```

## Rollback Plan

If issues are detected:
1. Stop the server: `Ctrl+C` or `pm2 stop`
2. Restore database from backup
3. Revert code if necessary (git checkout)
4. Restart server

## Monitoring

After deployment, monitor:
- Server logs (logs/ directory)
- Database size growth
- Response times
- Error rates
- Disk space

## Support

For deployment issues:
1. Check server logs
2. Verify environment variables
3. Test database connectivity
4. Check file permissions
5. Verify port availability
