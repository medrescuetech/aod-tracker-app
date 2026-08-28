# Deployment Guide - AOD Tracker

## Prerequisites
- Node.js 18+ 
- SQLite3
- Windows Server or compatible environment

## Pre-Deployment Checklist

### 1. Build Application
```bash
npm ci
npm run build
```

### 2. Run Tests
```bash
# Unit tests
npm test

# E2E tests
npx playwright test

# Or run specific test suites
npx playwright test 10-quarterly-reports.spec.ts
npx playwright test 11-tc-site-reports.spec.ts
npx playwright test 12-bac-workflow.spec.ts
```

### 3. Run Pre-Deployment Checks
```bash
# Full pre-deployment check
node scripts/pre-deploy-check.cjs

# Production readiness checklist
node scripts/production-checklist.cjs

# Staging simulation test (starts temporary server)
node scripts/staging-test.js
```

### 4. Verify Environment Variables

**Copy and configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your production values
```

**Required for Production:**
```env
PORT=3000
NODE_ENV=production
SERVE_FRONTEND=1
DB_PATH=./database/app.db
JWT_SECRET=your-generated-secret-key
ADMIN_PASSWORD=your-strong-admin-password
```
Required environment variables:
```env
PORT=3000                    # Or your preferred port
SERVE_FRONTEND=1           # Set to serve built frontend
NODE_ENV=production
DB_PATH=./database/app.db  # Path to database file
```

## Deployment Steps

### Option 1: Direct Server Start
```bash
npm run start:prod
```

### Option 2: Separate Build and Server
```bash
npm run build
set SERVE_FRONTEND=1
set NODE_ENV=production
node server/index.js
```

### Option 3: Using PM2 (Recommended for Production)
```bash
npm install -g pm2
pm2 start server/index.js --name "aod-tracker"
pm2 save
```

## Testing After Deployment

### 1. Basic Health Check
```bash
curl http://localhost:3000/api/health
```

### 2. Verify Frontend
Open browser to `http://localhost:3000` and verify:
- Login page loads
- Can authenticate
- Dashboard displays

### 3. Verify Critical Workflows

#### BAC Positive Test
1. Navigate to AOD Tests → New Test
2. Select a person
3. Enable BAC testing
4. Enter BAC = 0.025
5. Verify workplace violation warning appears
6. Verify 20-minute observation period required
7. Save and verify test created with Positive outcome

#### Quarterly Report Generation
1. Navigate to Reports → AOD Quarterly Reports
2. Select Quarter Results
3. Set date range
4. Run report
5. Verify data displays correctly

#### TC Site Weekly Report
1. Navigate to Reports → TC Site Weekly Reports
2. Select TC Site Weekly Dashboard
3. Set week date range
4. Run report
5. Verify all sections display (WR/NWR, AOD summary, etc.)

### 4. Database Backup
Before going live, ensure database backup strategy:
```bash
# Backup SQLite database
cp database/app.db database/backups/app-$(date +%Y%m%d).db
```

## Post-Deployment Monitoring

### Check Server Logs
```bash
# If using PM2
pm2 logs aod-tracker

# Direct start
# Logs go to console, redirect to file if needed
```

### Monitor Key Metrics
- Login success rate
- Test recording errors
- Report generation time
- Database size growth

## Rollback Plan

If issues detected:
1. Stop current server
2. Restore database from backup
3. Revert to previous version if needed
4. Restart server

## Troubleshooting

### Issue: Frontend not loading
- Check `SERVE_FRONTEND=1` is set
- Verify `dist/` folder exists with built files
- Check browser console for errors

### Issue: Database errors
- Verify `DB_PATH` is correct and writable
- Check database file permissions
- Review SQLite version compatibility

### Issue: Reports not generating
- Verify database has data in date range
- Check server logs for SQL errors
- Test database queries directly

### Issue: BAC logic not working
- Verify backend code has `effectiveBAC > 0` checks
- Check database has BAC values stored correctly
- Review browser console for JavaScript errors

## Security Considerations

1. **Database File**: Ensure database file is not accessible via web server
2. **Environment Variables**: Don't commit `.env` files with secrets
3. **File Uploads**: Limit upload size and validate file types
4. **Authentication**: Review session timeout settings
5. **Audit Trail**: Ensure audit logging is enabled

## Support Contacts

For deployment issues, check:
1. Application logs
2. Browser console errors
3. Database integrity
4. System resources (CPU, memory, disk space)

## Version History

- v1.0.0 - Initial deployment with full report suite
  - TC Site Weekly Reports (8 reports)
  - AOD Quarterly Reports (7 reports)
  - BAC workplace safety warnings
  - Dynamic employer categories
