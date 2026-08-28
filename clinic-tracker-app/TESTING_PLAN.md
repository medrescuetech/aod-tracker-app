# Comprehensive Testing Plan - AOD Tracker

## Overview
This document outlines the testing strategy for the AOD Tracker application, covering unit tests, E2E tests, and manual testing checklists.

## Test Infrastructure

### E2E Testing (Playwright)
- **Location**: `e2e/` directory
- **Config**: `playwright.config.ts`
- **Test DB**: `server/database/e2e_test.db`
- **Base URL**: `http://localhost:3099`
- **Command**: `npx playwright test`

### Unit Testing (Jest)
- **Location**: `server/tests/`
- **Command**: `npm test`

## Test Coverage Matrix

### 1. Authentication & Access Control
| Test | Status | File |
|------|--------|------|
| Login with valid credentials | ✅ | `01-login.spec.ts` |
| Login with invalid credentials | ✅ | `01-login.spec.ts` |
| Dashboard loads after login | ✅ | `02-dashboard.spec.ts` |
| Session persistence | ⏳ | Manual |
| Role-based access | ⏳ | Manual |

### 2. Person/Patient Management
| Test | Status | File |
|------|--------|------|
| Create new person | ✅ | `04-people.spec.ts` |
| Edit person details | ✅ | `04-people.spec.ts` |
| Search/filter people | ✅ | `04-people.spec.ts` |
| Merge duplicate persons | ⏳ | Manual |

### 3. AOD Testing Workflow
| Test | Status | File |
|------|--------|------|
| Record new AOD test | ✅ | `03-record-test.spec.ts` |
| BAC = 0 shows Negative | ✅ | `12-bac-workflow.spec.ts` |
| BAC > 0 shows Positive + warning | ✅ | `12-bac-workflow.spec.ts` |
| Oral Non-Negative triggers RFT | ✅ | `03-record-test.spec.ts` |
| Urine test pathway | ⏳ | Manual |
| Drug confirmation workflow | ⏳ | Manual |
| BAC auto-close with no drug tests | ⏳ | Manual |

### 4. Non-Negative Management
| Test | Status | File |
|------|--------|------|
| View non-negative list | ✅ | `05-non-negative.spec.ts` |
| Record lab result | ✅ | `05-non-negative.spec.ts` |
| Medication review workflow | ⏳ | Manual |
| Close case workflow | ⏳ | Manual |
| BAC workplace warning | ✅ | `12-bac-workflow.spec.ts` |

### 5. Patient Events
| Test | Status | File |
|------|--------|------|
| Create patient event | ✅ | `06-patient-events.spec.ts` |
| WR/NWR classification | ✅ | Unit tests |
| Body location tracking | ✅ | Unit tests |
| Injury type tracking | ✅ | Unit tests |
| RTW plan tracking | ✅ | Unit tests |

### 6. Employer Management
| Test | Status | File |
|------|--------|------|
| Create employer | ✅ | `07-employers.spec.ts` |
| Edit employer category | ✅ | `07-employers.spec.ts` |
| Merge employers | ✅ | `07-employers.spec.ts` |
| Dynamic category labels | ✅ | Unit tests |

### 7. Reports - AOD Quarterly
| Test | Status | File |
|------|--------|------|
| Quarter Results (Contractors) | ✅ | `10-quarterly-reports.spec.ts` |
| SCJV Employees Summary | ✅ | `10-quarterly-reports.spec.ts` |
| For Cause Report | ✅ | `10-quarterly-reports.spec.ts` |
| POS Bac Report | ✅ | `10-quarterly-reports.spec.ts` |
| Quarter Non-Negs | ✅ | `10-quarterly-reports.spec.ts` |
| Pending & Other Report | ✅ | `10-quarterly-reports.spec.ts` |
| Unique Employees | ✅ | `10-quarterly-reports.spec.ts` |
| Test category normalization | ✅ | Unit tests |

### 8. Reports - TC Site Weekly
| Test | Status | File |
|------|--------|------|
| TC Site Weekly Dashboard | ✅ | `11-tc-site-reports.spec.ts` |
| WR Injury Locations | ✅ | `11-tc-site-reports.spec.ts` |
| WR Injury Types | ✅ | `11-tc-site-reports.spec.ts` |
| WR/NWR Classification | ✅ | `11-tc-site-reports.spec.ts` |
| NWR Detailed Classification | ✅ | `11-tc-site-reports.spec.ts` |
| RTW Outcomes | ✅ | `11-tc-site-reports.spec.ts` |
| AOD Weekly Summary | ✅ | `11-tc-site-reports.spec.ts` |
| AOD Non-Negative | ✅ | `11-tc-site-reports.spec.ts` |

### 9. Reports - General
| Test | Status | File |
|------|--------|------|
| Reports hub loads | ✅ | `09-reports.spec.ts` |
| Report categories visible | ✅ | `09-reports.spec.ts` |
| Custom builder loads | ✅ | `09-reports.spec.ts` |
| Date range filtering | ✅ | E2E tests |
| Employer filtering | ⏳ | Manual |

### 10. Admin Settings
| Test | Status | File |
|------|--------|------|
| BAC auto-close setting | ⏳ | Manual |
| Employer categories config | ⏳ | Manual |
| Lookups management | ⏳ | Manual |

## Running Tests

### E2E Tests

**Prerequisite**: Start the test server first (in a separate terminal):
```bash
# Terminal 1: Start test server
npm run server:test

# Terminal 2: Run E2E tests
npx playwright test
```

Or manually start the server:
```bash
# Windows PowerShell
$env:PORT=3100; $env:NODE_ENV="test"; $env:SERVE_FRONTEND="1"; $env:DB_PATH="./server/database/e2e_test.db"; node server/index.js

# Windows CMD
set PORT=3100 && set NODE_ENV=test && set SERVE_FRONTEND=1 && set DB_PATH=./server/database/e2e_test.db && node server/index.js
```

**Then run tests:**
```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test 10-quarterly-reports.spec.ts

# Run with UI mode
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

### Unit Tests
```bash
# Run all unit tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Test Data

Test data is seeded via `e2e/helpers/data.ts`:
- Test employers (Employee + Contractor categories)
- Test people with various attributes
- Test AOD records (Negative, Positive BAC, Non-Negative Drug)
- Test patient events (WR, WR Review, NWR, NWR Hospital)

## Critical Workflows for Manual Testing

### 1. Complete AOD Test Flow
1. Create person → Record test (Oral + BAC) → Review non-negative → Close case

### 2. Quarterly Reporting
1. Run multiple test types over a quarter → Generate all quarterly reports → Verify Excel exports

### 3. TC Weekly Reporting
1. Record patient events throughout week → Generate weekly dashboard → Verify all sections

### 4. BAC Positive Workflow
1. Record BAC > 0 → Verify workplace warning → 20-min observation → Final BAC → Case closure

### 5. Drug Non-Negative Workflow
1. Oral Non-Negative → RFT created → Lab sample sent → Lab result → Medication review → Close

## Deployment Readiness Checklist

- [x] Unit tests for BAC logic
- [x] Unit tests for category normalization
- [x] Unit tests for WR/NWR classification
- [x] E2E tests for core workflows
- [x] E2E tests for quarterly reports
- [x] E2E tests for TC site weekly reports
- [x] E2E tests for BAC workplace safety
- [ ] Database migration tests (if applicable)
- [ ] Performance tests for large datasets
- [ ] Security audit
- [ ] Backup/restore verification
- [ ] Browser compatibility (Chrome, Edge, Firefox)

## Known Test Gaps

1. **Drug confirmation workflow** - Complex state transitions
2. **Excel export functionality** - File generation testing
3. **Email notifications** - If implemented
4. **Audit trail completeness** - Comprehensive logging check
5. **Multi-user concurrent access** - Race condition testing

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npx playwright test
```
