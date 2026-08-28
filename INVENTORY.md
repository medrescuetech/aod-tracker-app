# AOD Tracker — Full Application Inventory

## Database Tables (from schema.sql + index.js DDL)
| Table | Purpose |
|---|---|
| Sex | Lookup: sex values |
| WorkerType | Lookup: worker types |
| TestType | AOD test type codes (RND, PRE, etc.) |
| ResultClassification | Result outcome classifications |
| Role | User roles |
| Employer | Companies/contractors |
| Person | Workers/donors |
| Clinician | Clinicians/testers |
| User | App users |
| AODTest | Core test records |
| NonNegativeRecord | Non-negative outcomes |
| NonNegativeNote | Notes on non-negatives |
| PendingResult | Lab pending results |
| PositiveBACRecord | Positive BAC records |
| ScheduledTest | Scheduled/random tests |
| AttendanceRecord | DNA attendance records |
| ReportParameter | Saved report params |
| SystemConfig | Key/value config store |
| AppSettings | JSON blob admin settings |
| AuditLog | Audit trail |
| Attachment | File attachments for tests |
| PatientEvent | Patient/clinical events |
| RandomTestList | Imported random test lists |
| RandomTestEntry | Entries within random lists |
| ReferralOption | Referral lookup options |
| ComplianceCheck | Compliance check definitions |
| CheckCompletion | Completions of compliance checks |
| ReportTemplate | Saved report templates |
| PendingMedical | Pending medical reviews |
| TrainingRecord | Training session records |
| TrainingUnit | Training unit definitions |
| Trainer | Trainer roster |
| TrainingAttendee | Attendees per training session |
| CPDType | CPD type definitions |
| ESOCertUnit | ESO certificate unit definitions |
| Document | Document library files |

## Backend API Routes (238 total)

### Auth & Config
- GET  /api/config
- POST /api/auth/login
- GET  /api/auth/me
- GET  /api/health
- GET  /api/lookups
- GET  /api/app-config
- POST /api/log-client-error

### Test Types
- GET    /api/test-types
- POST   /api/test-types
- PUT    /api/test-types/:id
- DELETE /api/test-types/:id

### Employers
- GET    /api/employers
- POST   /api/employers
- PUT    /api/employers/:id
- POST   /api/employers/merge
- POST   /api/employers/:id/aliases
- DELETE /api/employers/:id/aliases/:aliasId
- GET    /api/employers/:id/aliases
- POST   /api/employers/:id/unmerge
- GET    /api/employers/merged
- POST   /api/employers/import-excel
- POST   /api/employers/bulk-import
- PUT    /api/employers/:id/category
- POST   /api/employers/reclassify
- GET    /api/employers/export/csv
- POST   /api/employers/import/csv

### Persons (Workers/Donors)
- GET    /api/persons
- POST   /api/persons
- PUT    /api/persons/:id
- DELETE /api/persons/:id
- GET    /api/persons/:id
- GET    /api/persons/:id/history
- GET    /api/persons/:id/merge-preview
- POST   /api/persons/:id/merge
- POST   /api/persons/import
- POST   /api/persons/import/simple
- POST   /api/persons/import/csv
- GET    /api/persons/export/csv
- GET    /api/persons/check-duplicate

### Clinicians
- GET    /api/clinicians
- GET    /api/clinicians/:id
- POST   /api/clinicians
- PUT    /api/clinicians/:id
- DELETE /api/clinicians/:id
- GET    /api/clinicians/export/csv
- POST   /api/clinicians/import/csv

### AOD Tests
- GET    /api/tests
- GET    /api/tests/:id
- POST   /api/tests
- PUT    /api/tests/:id
- DELETE /api/tests/:id
- GET    /api/tests/check-duplicate
- POST   /api/tests/:id/lab-result
- POST   /api/tests/:id/send-email
- POST   /api/aod-tests

### Attachments
- POST   /api/tests/:testId/attachments
- GET    /api/tests/:testId/attachments
- GET    /api/attachments/:attachmentId/download
- DELETE /api/attachments/:attachmentId
- GET    /api/tests/:testId/attachments/summary

### Pending Results
- GET    /api/pending
- POST   /api/pending/:id/lab-result

### Non-Negative Records
- GET    /api/nonnegative
- GET    /api/nonnegative/:id
- PUT    /api/nonnegative/:id
- PUT    /api/nonnegative/:id/lab
- GET    /api/nonnegative/:id/history
- POST   /api/nonnegative/:id/notes
- POST   /api/nonnegative/:testId/close
- PUT    /api/nonnegative/:testId/status

### Scheduling & Random Lists
- POST   /api/schedule/random
- GET    /api/schedule
- PUT    /api/schedule/:id
- DELETE /api/schedule/:id
- GET    /api/schedule/match
- POST   /api/schedule
- GET    /api/random-lists
- GET    /api/random-lists/for-date/:date
- GET    /api/random-lists/today/pending
- GET    /api/random-lists/:listId
- GET    /api/random-lists/:listId/entries
- POST   /api/random-lists
- POST   /api/random-lists/:listId/entries
- PUT    /api/random-lists/entries/:entryId
- DELETE /api/random-lists/entries/:entryId
- PUT    /api/random-lists/entries/:entryId/edit
- DELETE /api/random-lists/:listId
- PUT    /api/random-entries/:entryId/status
- DELETE /api/random-entries/:entryId
- POST   /api/random-lists/preview-pdf
- POST   /api/random-lists/import
- POST   /api/random-lists/generate
- POST   /api/random-lists/from-csv
- GET    /api/random-lists/:listId/export/excel
- GET    /api/random-lists/:listId/export/pdf
- POST   /api/random-lists/:listId/add-to-pending

### Patient Events
- GET    /api/patient-events
- POST   /api/patient-events
- PUT    /api/patient-events/:id
- DELETE /api/patient-events/:id
- GET    /api/patient-search

### Attendance & DNA
- GET    /api/attendance
- POST   /api/attendance
- PUT    /api/attendance/:id
- DELETE /api/attendance/:id

### Pending Medicals & Review Appointments
- GET    /api/pending-medicals
- POST   /api/pending-medicals
- PUT    /api/pending-medicals/:id
- DELETE /api/pending-medicals/:id
- GET    /api/review-appointments
- GET    /api/review-appointments/upcoming
- GET    /api/review-appointments/:id
- POST   /api/review-appointments
- PUT    /api/review-appointments/:id
- DELETE /api/review-appointments/:id

### Training
- GET    /api/training
- POST   /api/training
- PUT    /api/training/:id
- DELETE /api/training/:id
- GET    /api/training/:id/attendees
- POST   /api/training/:id/attendees
- DELETE /api/training/:id/attendees/:aid
- GET    /api/training/summary
- GET    /api/training/duplicates
- POST   /api/training/cleanup-duplicates
- GET    /api/training-units
- POST   /api/training-units
- PUT    /api/training-units/:id
- DELETE /api/training-units/:id
- GET    /api/training-units/export/csv
- POST   /api/training-units/import/csv
- GET    /api/trainers
- POST   /api/trainers
- PUT    /api/trainers/:id
- DELETE /api/trainers/:id

### CPD & ESO
- GET    /api/cpd-types
- POST   /api/cpd-types
- PUT    /api/cpd-types/:id
- DELETE /api/cpd-types/:id
- GET    /api/eso-cert-units
- POST   /api/eso-cert-units
- PUT    /api/eso-cert-units/:id
- DELETE /api/eso-cert-units/:id

### Referral Options
- GET    /api/referral-options
- POST   /api/referral-options
- PUT    /api/referral-options/:id
- DELETE /api/referral-options/:id

### Compliance Checks
- GET    /api/checks
- POST   /api/checks
- PUT    /api/checks/:id
- DELETE /api/checks/:id
- GET    /api/checks/:id/completions
- POST   /api/checks/:id/completions
- DELETE /api/checks/:id/completions/:cid

### Documents Library
- GET    /api/documents
- GET    /api/documents/categories
- GET    /api/documents/:id/file
- GET    /api/documents/:id/download
- POST   /api/documents
- PUT    /api/documents/:id
- DELETE /api/documents/:id

### Users & Audit
- GET    /api/users
- POST   /api/users
- PUT    /api/users/:id
- GET    /api/audit

### Reports (AOD)
- GET    /api/reports/weekly
- GET    /api/reports/analytics
- GET    /api/reports/analytics.xlsx
- GET    /api/reports/dna
- GET    /api/reports/pending
- GET    /api/reports/variation
- GET    /api/reports/dashboard
- GET    /api/reports/custom-query
- GET    /api/reports/custom-query.xlsx
- GET    /api/reports/weekly.xlsx
- GET    /api/reports/quarterly
- GET    /api/reports/quarterly.xlsx
- GET    /api/reports/quarterly.template.xlsx
- GET    /api/reports/eso-certificate
- GET    /api/reports/weekly-events
- GET    /api/reports/aod-weekly-summary
- GET    /api/reports/aod-nonnegative
- GET    /api/reports/aod-quarterly-summary
- GET    /api/reports/aod-quarterly-detail
- GET    /api/reports/aod-quarterly-positive-bac
- GET    /api/reports/aod-quarterly-for-cause
- GET    /api/reports/aod-quarterly-pending
- GET    /api/reports/aod-quarterly-nonnegative
- GET    /api/reports/summary-inputs
- GET    /api/reports/site-weekly-event
- GET    /api/reports/patient-wr-location
- GET    /api/reports/patient-wr-type
- GET    /api/reports/patient-wr-class
- GET    /api/reports/patient-nwr-class
- GET    /api/reports/wr-injury-outcome
- POST   /api/reports/export/excel/:reportId
- POST   /api/reports/export/pdf/:reportId
- POST   /api/reports/custom
- POST   /api/reports/drilldown
- GET    /api/report-templates
- POST   /api/report-templates
- PUT    /api/report-templates/:id
- DELETE /api/report-templates/:id

### Admin
- POST   /api/admin/verify
- GET    /api/admin/app-settings
- PUT    /api/admin/app-settings
- GET    /api/admin/settings        (SystemConfig array)
- PUT    /api/admin/settings/:key
- GET    /api/admin/classification-patterns
- PUT    /api/admin/classification-patterns
- GET    /api/admin/smtp
- PUT    /api/admin/smtp
- POST   /api/admin/smtp/test
- GET    /api/admin/email-rules
- PUT    /api/admin/email-rules
- GET    /api/admin/audit-logs
- GET    /api/admin/error-logs
- GET    /api/admin/log-dates
- GET    /api/admin/stats
- GET    /api/admin/archive/settings
- PUT    /api/admin/archive/settings
- GET    /api/admin/archive/preview
- POST   /api/admin/archive/run
- GET    /api/admin/archive/jobs
- GET    /api/admin/archive/data
- POST   /api/admin/archive/restore
- GET    /api/admin/archive/persons-eligible
- POST   /api/admin/archive/persons
- POST   /api/admin/archive/clinicians
- GET    /api/admin/backups
- POST   /api/admin/backups
- GET    /api/admin/backups/:filename/download
- DELETE /api/admin/backups/:filename

## Frontend Pages & Key Forms/Buttons

| Page | Key Forms/Buttons/Functions |
|---|---|
| Login.jsx | Login form (username/password), Submit |
| Dashboard.jsx | Stats display, navigation buttons |
| NewTest.jsx | Create test form (person, type, date, BAC, drug results, lab fields), Submit, Cancel |
| TestDetail.jsx | Edit test form, Lab result entry, Attach files, Send email, Delete test |
| TestHistory.jsx | Filter/search, Export, View detail |
| Workers.jsx | Add/Edit/Delete worker, Import CSV, Export CSV, Merge workers |
| Employers.jsx | Add/Edit employer, Merge employers, Import/Export, Reclassify |
| Scheduling.jsx | Random selection form, Schedule list, DNA/complete actions |
| PendingResults.jsx | Enter lab result form, Submit |
| PendingTests.jsx | Pending test list, complete actions |
| NonNegative.jsx | Status update, Add note, Close record |
| Admin.jsx | Settings toggles, SMTP config, Email rules, Backup manager, Archive manager, Audit log viewer |
| TrainingTracker.jsx | Add/Edit training record, Attendees, Units CRUD |
| PatientTracker.jsx | Add/Edit patient event, Filter by type/date |
| PatientRecord.jsx | Patient event detail, Edit, Review appointments |
| ChecksTracker.jsx | Add/Edit compliance check, Add completion |
| Documents.jsx | Browse/filter documents, Open/Download |
| Reports.jsx | Date range picker, Employer filter, Export Excel/PDF |
| ReportsHub.jsx | Report category navigation |
| TestingManagement.jsx | Report builder, Custom query, Drilldown |
| Settings.jsx | User settings, Panel configuration |
| Donors.jsx | Donor/person list |
| ESOReport.jsx | ESO certificate report |
| Testers.jsx | Clinician CRUD |
