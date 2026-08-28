# Clinic Tracker System - Design Document

**Version:** 1.0  
**Date:** April 2026  
**Purpose:** Comprehensive system design for workplace health, compliance, and capability tracking

---

## 1. System Overview

### 1.1 Purpose
A unified web application for managing three core operational domains at industrial/mining sites:

| Module | Domain | Purpose |
|--------|--------|---------|
| **AOD Tracker** | Compliance/Testing | Drug & alcohol testing workflow, lab results, reporting |
| **Patient Tracker** | Health/Injury Activity | Clinical presentations, injuries, referrals, dispositions |
| **Training Tracker** | Capability/Readiness | Staff training, contractor inductions, competency tracking |

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  Dashboard │ AOD Module │ Patient Module │ Training Module   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                      │
│           Business Logic │ Derived Fields │ Validation       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (SQLite)                         │
│     Raw Data Storage │ Audit Logs │ File Attachments         │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Key Design Principles

1. **Single Source of Truth** - All business logic computed in backend, not scattered across reports
2. **Derived Fields** - Raw data stored as entered; derived fields calculated on-demand
3. **Employer Classification** - Automatic SCJV Staff/Contractor classification using regex patterns
4. **Audit Trail** - All changes logged with timestamps
5. **Document Management** - PDF attachments linked to records

---

## 2. Module 1: AOD Tracker

### 2.1 Purpose
Track workplace drug and alcohol testing from initial screening through lab confirmation to final outcomes.

### 2.2 Data Model

#### 2.2.1 Core Tables

**AODTest** - Primary test record
```
TestID              INTEGER PRIMARY KEY
TestNumber          TEXT UNIQUE (e.g., "AOD-2026-0001")
TestDate            TEXT
TestTime            TEXT
PersonID            INTEGER FK → Person
ClinicianID         INTEGER FK → Clinician
TestTypeID          INTEGER FK → TestType
TestReasonID        INTEGER FK → TestReason

-- Drug Screening
OralResult          TEXT (Negative, Non-Negative, Refused, Invalid, N/A)
UrineUndertaken     INTEGER (0/1)
SampleSentToLab     INTEGER (0/1)
LabSentDate         TEXT
LabReference        TEXT

-- Confirmatory Results
ConfirmatoryResult      TEXT (Negative, Substance Confirmed, Pending, Cancelled)
ConfirmatoryResultDate  TEXT
DetectedSubstances      TEXT

-- Medication Review
DeclaredMedications     TEXT
MedicationReviewStatus  TEXT (Consistent, Inconsistent, Pending Review, N/A)
MedicationReviewNotes   TEXT

-- Alcohol Testing
BACInitialValue     REAL
BACInitialTime      TEXT
BACFinalValue       REAL
BACFinalTime        TEXT

-- Derived/Computed Fields (stored for performance)
RFT                 INTEGER (0=No, 1=Yes)
FinalDrugOutcome    TEXT
FinalBACOutcome     TEXT
OverallAODResult    TEXT
TestStatus          TEXT (Closed, Pending Lab, Action Required, Review Required)
IsPending           INTEGER
IsNonNegative       INTEGER

-- Override Fields (manual exceptions)
OverrideBACResult   TEXT
OverrideBACReason   TEXT
OverrideDrugResult  TEXT
OverrideDrugReason  TEXT

Notes               TEXT
CreatedAt           TEXT
UpdatedAt           TEXT
```

**RandomTestList** - Daily random selection lists
```
ListID              INTEGER PRIMARY KEY
ListDate            TEXT
Shift               TEXT (Dayshift, Nightshift)
SourceFileName      TEXT
ImportedAt          TEXT
Notes               TEXT
```

**RandomTestEntry** - Individual entries from random lists
```
EntryID             INTEGER PRIMARY KEY
ListID              INTEGER FK → RandomTestList
EmployeeNumber      TEXT
EmployeeName        TEXT
Department          TEXT (Employer name from PDF)
Position            TEXT
EmployerID          INTEGER FK → Employer
EmployerCategory    TEXT (SCJV Staff, Contractor)
MatchedPersonID     INTEGER FK → Person
Status              TEXT (Pending, Tested, Not Available, Deferred, Cancelled)
TestID              INTEGER FK → AODTest
StatusNote          TEXT
ManualEntry         INTEGER (0/1)
```

### 2.3 Business Logic

#### 2.3.1 RFT (Referred for Further Testing)
```
IF OralResult = "Non-Negative" THEN RFT = "Yes"
ELSE RFT = "No"
```

#### 2.3.2 Drug Final Result (Priority Order)
```
1. IF OralResult = "Refused"                                          → "Refused"
2. IF OralResult = "Invalid"                                          → "Invalid"
3. IF OralResult = "Negative"                                         → "Negative"
4. IF OralResult = "Non-Negative" AND ConfirmatoryResult IN (NULL, "", "Pending", "N/A")
                                                                      → "Non-Negative - Pending Lab"
5. IF OralResult = "Non-Negative" AND ConfirmatoryResult = "Negative" → "Negative"
6. IF OralResult = "Non-Negative" AND ConfirmatoryResult = "Substance Confirmed" 
   AND MedicationReviewStatus = "Consistent"                          → "Confirmed - Consistent"
7. IF OralResult = "Non-Negative" AND ConfirmatoryResult = "Substance Confirmed"
   AND MedicationReviewStatus = "Inconsistent"                        → "Confirmed - Inconsistent"
8. IF OralResult = "Non-Negative" AND ConfirmatoryResult = "Substance Confirmed"
   AND MedicationReviewStatus IN (NULL, "", "Pending Review")         → "Review Required"
9. IF OralResult IN (NULL, "", "N/A")                                 → "N/A"
10. OTHERWISE                                                          → "Review Required"
```

#### 2.3.3 Alcohol Final Result (Priority Order)
```
1. IF BACInitialValue IS NULL AND BACFinalValue IS NULL → "N/A"
2. IF BACInitialValue = 0 AND BACFinalValue IS NULL     → "Negative"
3. IF BACInitialValue > 0 AND BACFinalValue IS NULL     → "Pending Final BAC"
4. IF BACFinalValue = 0                                 → "Negative"
5. IF BACFinalValue > 0                                 → "Positive"
6. OTHERWISE                                            → "Review Required"
```

#### 2.3.4 Overall AOD Result (Priority Order)
```
1. IF DrugFinalResult = "Refused"                       → "Refused"
2. IF DrugFinalResult = "Invalid"                       → "Invalid"
3. IF AlcoholFinalResult = "Positive"                   → "Alcohol Positive"
4. IF DrugFinalResult = "Non-Negative - Pending Lab"    → "Drug Non-Negative Pending"
5. IF DrugFinalResult = "Confirmed - Inconsistent"      → "Drug Confirmed - Inconsistent"
6. IF DrugFinalResult = "Confirmed - Consistent"        → "Drug Confirmed - Consistent"
7. IF DrugFinalResult = "Negative" AND AlcoholFinalResult IN ("Negative", "N/A")
                                                        → "Negative"
8. OTHERWISE                                            → "Review Required"
```

#### 2.3.5 Test Status
```
IF OverallAODResult IN ("Negative", "Refused", "Invalid") → "Closed"
IF DrugFinalResult = "Non-Negative - Pending Lab"         → "Pending Lab"
IF OverallAODResult CONTAINS "Confirmed"                  → "Action Required"
OTHERWISE                                                 → "Review Required"
```

### 2.4 Employer Classification

#### 2.4.1 SCJV Staff Pattern (Regex)
```javascript
const SCJV_PATTERNS = [/saipem/i, /clough/i, /scjv/i];

function classifyEmployer(companyName) {
  for (const pattern of SCJV_PATTERNS) {
    if (pattern.test(companyName)) return 'SCJV Staff';
  }
  return 'Contractor';
}
```

### 2.5 Validation Rules

| Rule | Condition | Action |
|------|-----------|--------|
| V1 | OralResult = "Negative" | ConfirmatoryResult should be "N/A" |
| V2 | OralResult = "Non-Negative" | SampleSentToLab should become "Yes" |
| V3 | ConfirmatoryResult = "Substance Confirmed" | MedicationReviewStatus must be completed |
| V4 | BACInitialValue > 0 | BACFinalValue should be entered before closure |

### 2.6 Test Types
- Random
- Pre-Employment / RTW
- Post Incident
- Cause (Reasonable Suspicion)
- Blanket
- Did Not Attend (DNA)

### 2.7 Applicable Standards
- AS/NZS 4760 (Oral Fluid)
- AS/NZS 4308 (Urine)

---

## 3. Module 2: Patient Tracker

### 3.1 Purpose
Track clinical presentations, injuries, and health events at the site clinic.

### 3.2 Data Model

**PatientEvent** - Clinical presentation record
```
EventID             INTEGER PRIMARY KEY
EventDate           TEXT
EventTime           TEXT
PersonID            INTEGER FK → Person
WR_NWR              TEXT (WR, WR Review, NWR, NWR Review, Camp, Camp Review)
BodyLocation        TEXT
InjuryType          TEXT
Classification      TEXT (First Aid, Assessment Only, WR Review, NWR Review)
RTWPlan             TEXT
DrConsult           INTEGER (0/1)
Referral            TEXT
ClinicianID         INTEGER FK → Clinician
Comment             TEXT
EndOfWeekTracker    INTEGER (0/1)

-- Derived Fields (computed)
WRNWR_Normalised    TEXT
Base_WRI_NWRI       TEXT
Report_NWR_Class    TEXT
Relatedness_Group   TEXT
Review_Flag         TEXT
Hospital_Flag       TEXT
Clinical_Disposition TEXT

CreatedAt           TEXT
UpdatedAt           TEXT
```

### 3.3 Business Logic

#### 3.3.1 WR/NWR Normalization
```
"WR"          → "WR"
"WR Review"   → "WR Review"
"WR-Review"   → "WR Review"
"NWR"         → "NWR"
"NWR Review"  → "NWR Review"
"Camp"        → "NWR"
"Camp Review" → "NWR Review"
```

#### 3.3.2 Base WRI/NWRI
```
IF WRNWR_Normalised IN ("WR", "WR Review")   → "WR"
IF WRNWR_Normalised IN ("NWR", "NWR Review") → "NWR"
```

#### 3.3.3 Report NWR Class
```
IF WRNWR_Normalised IN ("NWR", "NWR Review") AND Referral CONTAINS "ED"
                                              → "NWR Hospital"
ELSE IF WRNWR_Normalised = "NWR Review"       → "NWR Review"
ELSE IF WRNWR_Normalised = "NWR"              → "NWR"
ELSE                                          → NULL
```

#### 3.3.4 Relatedness Group
```
IF WRNWR_Normalised IN ("WR", "WR Review")   → "Work Related"
IF WRNWR_Normalised IN ("NWR", "NWR Review") → "NWRI"
```

#### 3.3.5 Review Flag
```
IF WRNWR_Normalised CONTAINS "Review" → "Review"
ELSE                                  → "Initial"
```

#### 3.3.6 Hospital Flag
```
IF Referral CONTAINS "ED" (case-insensitive) → "Yes"
ELSE                                         → "No"
```

#### 3.3.7 Clinical Disposition
```
IF Referral = ""                        → "Unspecified"
IF Referral CONTAINS "ED"               → "ED"
IF Referral CONTAINS "Return to work"   → "Return to work"
IF Referral CONTAINS "Self care"        → "Self care"
IF Referral CONTAINS "GP"               → "GP"
IF Referral CONTAINS "Review"           → "Review"
ELSE                                    → "Other"
```

### 3.4 Valid Values

**WR/NWR Options:**
- WR
- WR Review
- NWR
- NWR Review
- Camp
- Camp Review

**Classification Options:**
- First Aid
- Assessment Only
- WR Review
- NWR Review

---

## 4. Module 3: Training Tracker

### 4.1 Purpose
Track staff training delivery, contractor inductions, and competency development.

### 4.2 Data Model

**TrainingSession** - Training delivery record
```
SessionID           INTEGER PRIMARY KEY
SessionDate         TEXT
SessionTime         TEXT
SessionType         TEXT (Staff, Prestart)
Discipline          TEXT
TrainerID           INTEGER FK → Clinician/Trainer
Duration            TEXT (e.g., "0.5hr", "1hr")
Duration_Hours      REAL (computed)
CompetencyUnit      TEXT
SecondaryUnit       TEXT
TrainingPackage     TEXT
Category            TEXT
CPDType             TEXT
LearningOutcome     TEXT
Interactive         INTEGER (0/1)
ClinicalType        TEXT (Clinical, Non-Clinical)
EvidenceLink        TEXT
TrainerVerification TEXT

-- For Prestart sessions
ContractorCompany   TEXT
EmployerID          INTEGER FK → Employer

CreatedAt           TEXT
UpdatedAt           TEXT
```

**TrainingAttendee** - Flattened attendance record (one row per attendee)
```
AttendeeID          INTEGER PRIMARY KEY
SessionID           INTEGER FK → TrainingSession
PersonID            INTEGER FK → Person (if matched)
AttendeeName        TEXT
AttendeePosition    INTEGER (1-5, original column position)
```

### 4.3 Business Logic

#### 4.3.1 Duration Hours
```
Parse duration string:
- Remove "hr" suffix
- Convert to decimal
- "0.5hr" → 0.5
- "1hr" → 1.0
- "" → NULL
```

#### 4.3.2 Attendance Count
```
Count non-blank values in Attended1 through Attended5
```

#### 4.3.3 Verified Flag
```
IF TrainerVerification IS NOT NULL AND TrainerVerification != "" → "Yes"
ELSE → "No"
```

#### 4.3.4 Evidence Flag
```
IF EvidenceLink IS NOT NULL AND EvidenceLink != "" → "Yes"
ELSE → "No"
```

#### 4.3.5 Clinical Group
```
IF ClinicalType = "Clinical"     → "Clinical"
IF ClinicalType = "Non-Clinical" → "Non-Clinical"
ELSE                             → "Unspecified"
```

### 4.4 Attendance Flattening

Original structure (wide):
```
SessionID | Attended1 | Attended2 | Attended3 | Attended4 | Attended5
```

Flattened structure (long):
```
SessionID | AttendeeName | AttendeePosition
```

This enables accurate reporting on:
- Total staff trained
- Repeat attendance
- Hours per person
- Hours per discipline

---

## 5. Shared Components

### 5.1 Person Table
```
PersonID            INTEGER PRIMARY KEY
FullName            TEXT
DateOfBirth         TEXT
SexID               INTEGER FK
EmployerID          INTEGER FK → Employer
WorkerTypeID        INTEGER FK → WorkerType
BadgeNumber         TEXT
EmployeeNumber      TEXT
Department          TEXT
Position            TEXT
Email               TEXT
Phone               TEXT
IsActive            INTEGER
```

### 5.2 Employer Table
```
EmployerID          INTEGER PRIMARY KEY
CompanyName         TEXT
Category            TEXT (SCJV Staff, Contractor)
ContactName         TEXT
ContactEmail        TEXT
ContactPhone        TEXT
IsActive            INTEGER
```

### 5.3 Clinician Table
```
ClinicianID         INTEGER PRIMARY KEY
Name                TEXT
Initials            TEXT
Qualifications      TEXT
IsActive            INTEGER
```

### 5.4 Attachment Table
```
AttachmentID        INTEGER PRIMARY KEY
RecordType          TEXT (AODTest, PatientEvent, TrainingSession)
RecordID            INTEGER
Category            TEXT (Initial Test Record, Lab Results, Chain of Custody, Other)
FileName            TEXT
OriginalFileName    TEXT
FilePath            TEXT
FileSize            INTEGER
MimeType            TEXT
UploadedAt          TEXT
```

---

## 6. Reporting Requirements

### 6.1 Weekly Site Report

**Section 1: Clinical Activity (Patient Tracker)**
- Total presentations
- WR count
- NWR count
- NWR Hospital count
- ED referrals
- Body location breakdown
- Injury type breakdown

**Section 2: AOD Compliance (AOD Tracker)**
- Total tests
- Tests by type (Random, Pre-Employment, etc.)
- Non-negative count
- Positive BAC count
- RFT count
- Pending lab results

**Section 3: Training & Capability (Training Tracker)**
- Staff training sessions conducted
- Prestart sessions conducted
- Total attendees
- Total training hours
- Clinical vs non-clinical sessions
- Top disciplines trained

### 6.2 Monthly Summary Report

**Patient Tracker Metrics:**
- Monthly presentation trends
- WR vs NWR trends
- Top injury types
- Referral patterns

**AOD Tracker Metrics:**
- Monthly test volumes
- Non-negative rate
- Confirmation outcomes
- Employer breakdown

**Training Tracker Metrics:**
- Sessions by month
- Hours delivered
- Hours per staff member
- Hours per discipline
- Trainer activity

### 6.3 Quarterly Reports

**AOD Quarterly (by Employer Category)**
- SCJV Staff vs Contractor breakdown
- Tests by month
- Non-negative referrals
- Confirmed results
- Alcohol positives

**Training Quarterly**
- Total sessions trend
- Total hours trend
- Top competency units
- Verification completion rate
- Evidence completion rate

### 6.4 Report Filtering

All reports support filtering by:
- Date range
- Employer (multi-select checkboxes)
- Employer category (SCJV Staff / Contractor)
- Test type (AOD)
- WR/NWR classification (Patient)
- Session type (Training)

---

## 7. API Endpoints

### 7.1 AOD Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tests` | List tests with filters |
| POST | `/api/tests` | Create new test |
| PUT | `/api/tests/:id` | Update test |
| GET | `/api/tests/:id` | Get test details |
| POST | `/api/tests/:id/attachments` | Upload documents |
| GET | `/api/tests/:id/attachments` | List attachments |
| POST | `/api/random-lists/import` | Import PDF random list |
| GET | `/api/random-lists` | List random test lists |
| GET | `/api/random-lists/:id/entries` | Get list entries |
| PUT | `/api/random-entries/:id/status` | Update entry status |
| POST | `/api/pending/:id/lab-result` | Record lab result |

### 7.2 Patient Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patient-events` | List events with filters |
| POST | `/api/patient-events` | Create new event |
| PUT | `/api/patient-events/:id` | Update event |
| GET | `/api/patient-events/:id` | Get event details |

### 7.3 Training Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/training-sessions` | List sessions |
| POST | `/api/training-sessions` | Create session |
| PUT | `/api/training-sessions/:id` | Update session |
| GET | `/api/training-sessions/:id/attendees` | Get attendees |
| POST | `/api/training-sessions/:id/attendees` | Add attendee |
| POST | `/api/training/import` | Import from Excel |

### 7.4 Shared Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employers` | List employers |
| POST | `/api/employers/bulk-import` | Import employers |
| PUT | `/api/employers/:id/category` | Update category |
| GET | `/api/persons` | List persons |
| POST | `/api/persons` | Create person |
| GET | `/api/reports/weekly` | Weekly report |
| GET | `/api/reports/quarterly` | Quarterly report |
| GET | `/api/reports/dashboard` | Dashboard stats |
| GET | `/api/attachments/:id/download` | Download file |

---

## 8. User Interface

### 8.1 Navigation Structure

```
Dashboard
├── Today's Summary
├── Quick Actions
└── Alerts/Notifications

AOD Testing
├── New Test
├── Random Lists (Import PDF)
├── Pending Results
├── Non-Negative Tracker
└── Test History

Patient Tracker
├── New Presentation
├── Today's Presentations
├── Review Cases
└── History

Training
├── New Session
├── Staff Training
├── Prestart/Inductions
├── Attendance Records
└── Hours Analysis

Reports
├── Weekly Report
├── Monthly Summary
├── Quarterly Reports
└── Custom Report Builder

Settings
├── Employers
├── Clinicians
├── Lookup Tables
└── System Config
```

### 8.2 Key Screens

**Dashboard**
- Today's test count
- Pending results alert
- Non-negative cases requiring action
- Training sessions this week
- Recent presentations

**AOD New Test**
- Donor selection (free-text with auto-suggest)
- Test type selection
- Drug screening section (Oral result)
- BAC section (Initial → 20-min wait → Final)
- Auto-derived status display
- Document upload

**Random List Import**
- PDF upload
- Date/shift selection
- Preview parsed entries
- Employer auto-classification display
- Bulk import confirmation

**Reports**
- Date range picker
- Employer filter (checkboxes grouped by category)
- Generate button
- Export to CSV
- Print-friendly view

---

## 9. Implementation Status

### 9.1 Completed

- [x] Database schema design
- [x] AOD test CRUD operations
- [x] AOD business logic (RFT, Final Results, Status)
- [x] Employer classification (SCJV/Contractor regex)
- [x] Random list PDF import
- [x] Document attachment upload/download
- [x] Report employer filtering (checkboxes)
- [x] Patient event basic CRUD
- [x] Backend server setup

### 9.2 In Progress

- [ ] Training module schema
- [ ] Training session CRUD
- [ ] Attendance flattening
- [ ] Frontend polish

### 9.3 Planned

- [ ] Training import from Excel
- [ ] Comprehensive dashboard
- [ ] Report export improvements
- [ ] Audit log viewer
- [ ] Data validation UI warnings
- [ ] Bulk operations

---

## 10. File Storage

### 10.1 Directory Structure

```
server/
├── uploads/
│   ├── test-documents/     # AOD test attachments
│   ├── training-evidence/  # Training evidence files
│   └── temp/               # Temporary upload processing
├── database/
│   └── aod_tracker.db      # SQLite database
```

### 10.2 Supported File Types

- PDF (primary)
- Images (JPEG, PNG, GIF, TIFF)
- Word documents (DOC, DOCX)
- Max size: 20MB per file

---

## 11. Security Considerations

### 11.1 Current State
- No authentication (to be added)
- Local file storage
- Single-user mode

### 11.2 Future Requirements
- User authentication
- Role-based access control
- Audit logging for all changes
- Secure file storage
- Data encryption at rest

---

## Appendix A: Lookup Values

### Test Types
| Code | Name |
|------|------|
| RND | Random |
| PRE | Pre-Employment / RTW |
| POST | Post Incident |
| CAUSE | Cause (Reasonable Suspicion) |
| BLK | Blanket |
| DNA | Did Not Attend |

### Oral Results
- Negative
- Non-Negative
- Refused
- Invalid
- N/A

### Confirmatory Results
- Negative
- Substance Confirmed
- Pending
- Cancelled

### Medication Review Status
- Consistent
- Inconsistent
- Pending Review
- N/A

### WR/NWR Values
- WR
- WR Review
- NWR
- NWR Review
- Camp
- Camp Review

### Clinical Dispositions
- ED
- Return to work
- Self care
- GP
- Review
- Unspecified
- Other

---

*Document generated for Clinic Tracker System v1.0*
