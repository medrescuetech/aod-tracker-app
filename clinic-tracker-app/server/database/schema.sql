-- AOD Tracking System Database Schema
-- Based on requirements specification

-- ============================================
-- LOOKUP/ENUMERATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS Sex (
    SexID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO Sex (Name) VALUES ('Male'), ('Female'), ('Other');

CREATE TABLE IF NOT EXISTS WorkerType (
    WorkerTypeID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE,
    Description TEXT
);

INSERT OR IGNORE INTO WorkerType (Name, Description) VALUES 
    ('SCJV Staff', 'Direct employees of SCJV'),
    ('Contractor', 'External contractor personnel');

CREATE TABLE IF NOT EXISTS TestType (
    TestTypeID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE,
    Code TEXT NOT NULL UNIQUE,
    Description TEXT,
    IsActive INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO TestType (Name, Code, Description) VALUES 
    ('Pre-Employment/Return-to-Work', 'PRE', 'Testing before employment or returning to work'),
    ('Random', 'RND', 'Randomised selection testing'),
    ('For Cause', 'CAU', 'Reasonable suspicion testing'),
    ('Post Incident', 'INC', 'Testing following a workplace incident'),
    ('Port Authority', 'PA', 'Port authority mandated testing'),
    ('Blanket', 'BLK', 'Site-wide or department-wide testing'),
    ('Did Not Attend', 'DNA', 'Scheduled test where worker did not attend');

CREATE TABLE IF NOT EXISTS ResultClassification (
    ClassificationID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE,
    Code TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO ResultClassification (Name, Code) VALUES 
    ('Negative', 'NEG'),
    ('Non-Negative', 'NN'),
    ('Refused', 'REF'),
    ('Unable to Test', 'UTT'),
    ('Pending', 'PND'),
    ('Consistent Non-Negative', 'CNN'),
    ('Inconsistent Non-Negative', 'INN');

CREATE TABLE IF NOT EXISTS Role (
    RoleID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE,
    Description TEXT,
    Permissions TEXT -- JSON array of permission codes
);

INSERT OR IGNORE INTO Role (Name, Description, Permissions) VALUES 
    ('Administrator', 'Full system access', '["all"]'),
    ('Clinician', 'Enter and manage tests', '["tests.create","tests.read","tests.update","persons.read","reports.read"]'),
    ('Manager', 'View reports and manage non-negative cases', '["tests.read","reports.read","reports.export","nonneg.manage","pending.manage"]'),
    ('Data Analyst', 'Generate and export reports', '["tests.read","reports.read","reports.export","reports.create"]'),
    ('Viewer', 'Read-only access', '["tests.read","reports.read"]');

-- ============================================
-- CORE ENTITY TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS Employer (
    EmployerID INTEGER PRIMARY KEY AUTOINCREMENT,
    CompanyName TEXT NOT NULL,
    Category TEXT DEFAULT 'Contractor', -- 'SCJV' or 'Contractor'
    ContactName TEXT,
    ContactEmail TEXT,
    ContactPhone TEXT,
    Address TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Person (
    PersonID INTEGER PRIMARY KEY AUTOINCREMENT,
    FullName TEXT NOT NULL,
    DateOfBirth TEXT,
    SexID INTEGER REFERENCES Sex(SexID),
    EmployerID INTEGER REFERENCES Employer(EmployerID),
    WorkerTypeID INTEGER REFERENCES WorkerType(WorkerTypeID),
    BadgeNumber TEXT,
    EmployeeNumber TEXT,
    Department TEXT,
    Position TEXT,
    Email TEXT,
    Phone TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Clinician (
    ClinicianID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    EmployeeNumber TEXT,
    Credentials TEXT,
    Email TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS User (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    PasswordHash TEXT NOT NULL,
    FullName TEXT NOT NULL,
    Email TEXT,
    RoleID INTEGER REFERENCES Role(RoleID),
    ClinicianID INTEGER REFERENCES Clinician(ClinicianID), -- Link to clinician if applicable
    IsActive INTEGER DEFAULT 1,
    LastLogin TEXT,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AOD TEST TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS AODTest (
    TestID INTEGER PRIMARY KEY AUTOINCREMENT,
    TestNumber TEXT NOT NULL UNIQUE,
    TestDate TEXT NOT NULL,
    TestTime TEXT,
    PersonID INTEGER NOT NULL REFERENCES Person(PersonID),
    TestTypeID INTEGER NOT NULL REFERENCES TestType(TestTypeID),
    ClinicianID INTEGER REFERENCES Clinician(ClinicianID),
    
    -- Oral Fluid Test
    OralUndertaken INTEGER DEFAULT 0, -- 0=No, 1=Yes
    OralResult TEXT, -- Negative, Non-Negative, Refused, Unable to Test
    OralDeviceID TEXT,
    
    -- Breath Alcohol Test (Initial + Final after 20 min wait)
    BACUndertaken INTEGER DEFAULT 0,
    BACInitialValue REAL, -- Initial BAC reading
    BACInitialTime TEXT, -- Time of initial reading
    BACFinalValue REAL, -- Final BAC reading (after 20 min wait)
    BACFinalTime TEXT, -- Time of final reading
    BACResult TEXT, -- Negative (=0), Positive (>0)
    BACDeviceID TEXT,
    
    -- Urine Test
    UrineUndertaken INTEGER DEFAULT 0,
    UrineResult TEXT, -- Negative, Non-Negative, Refused, Unable to Test
    UrineSampleID TEXT,
    
    -- RFT (Referred for Further Testing) - triggered by Non-Negative screening
    RFT INTEGER DEFAULT 0, -- 0=No, 1=Yes - decision that further testing required
    
    -- Sample Sent to Lab - administrative confirmation sample dispatched
    SampleSentToLab INTEGER DEFAULT 0, -- 0=No, 1=Yes - confirms sample actually sent
    LabSentDate TEXT,
    LabReference TEXT,
    
    -- Confirmatory Result (Lab)
    ConfirmatoryResult TEXT, -- Negative, Substance Confirmed, Pending, Cancelled
    ConfirmatoryResultDate TEXT,
    DetectedSubstances TEXT, -- What substances were confirmed by lab
    
    -- Declared Medication Review - comparison against worker declaration
    DeclaredMedications TEXT, -- What worker declared
    MedicationReviewStatus TEXT, -- Consistent, Inconsistent, N/A, Pending Review
    MedicationReviewNotes TEXT,
    
    -- Manual Overrides (for procedural exceptions)
    OverrideBACResult TEXT,
    OverrideBACReason TEXT,
    OverrideDrugResult TEXT,
    OverrideDrugReason TEXT,
    
    -- Final Outcomes
    FinalBACOutcome TEXT, -- Negative (Final=0), Positive (Final>0)
    FinalDrugOutcome TEXT, -- Negative, Pending Confirmation, Confirmed Positive, Confirmed Negative
    
    -- Status tracking
    TestStatus TEXT DEFAULT 'Closed', -- Closed, Pending Lab, Action Required, Review Required
    IsPending INTEGER DEFAULT 0,
    IsNonNegative INTEGER DEFAULT 0,
    
    -- Metadata
    Notes TEXT,
    CreatedBy INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy INTEGER REFERENCES User(UserID)
);

CREATE INDEX IF NOT EXISTS idx_aodtest_date ON AODTest(TestDate);
CREATE INDEX IF NOT EXISTS idx_aodtest_person ON AODTest(PersonID);
CREATE INDEX IF NOT EXISTS idx_aodtest_type ON AODTest(TestTypeID);
CREATE INDEX IF NOT EXISTS idx_aodtest_pending ON AODTest(IsPending);
CREATE INDEX IF NOT EXISTS idx_aodtest_nonneg ON AODTest(IsNonNegative);

-- ============================================
-- NON-NEGATIVE AND PENDING TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS NonNegativeRecord (
    NNID INTEGER PRIMARY KEY AUTOINCREMENT,
    TestID INTEGER NOT NULL REFERENCES AODTest(TestID),
    DetectedSubstances TEXT,
    TypeOfTest TEXT, -- Oral, Urine, BAC
    FollowUpAction TEXT,
    Status TEXT DEFAULT 'Open', -- Open, In Review, Closed
    AssignedTo INTEGER REFERENCES User(UserID),
    ClosedDate TEXT,
    ClosedBy INTEGER REFERENCES User(UserID),
    ClosureReason TEXT,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS NonNegativeNote (
    NoteID INTEGER PRIMARY KEY AUTOINCREMENT,
    NNID INTEGER NOT NULL REFERENCES NonNegativeRecord(NNID),
    NoteText TEXT NOT NULL,
    CreatedBy INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS PendingResult (
    PendingID INTEGER PRIMARY KEY AUTOINCREMENT,
    TestID INTEGER NOT NULL REFERENCES AODTest(TestID),
    LabReference TEXT,
    LabExpectedDate TEXT,
    Status TEXT DEFAULT 'Awaiting', -- Awaiting, Received, Overdue
    Comments TEXT,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    ResolvedAt TEXT,
    ResolvedBy INTEGER REFERENCES User(UserID)
);

CREATE TABLE IF NOT EXISTS PositiveBACRecord (
    PosBACID INTEGER PRIMARY KEY AUTOINCREMENT,
    TestID INTEGER NOT NULL REFERENCES AODTest(TestID),
    MeasuredBAC REAL NOT NULL,
    FinalBACOutcome TEXT,
    FollowUpAction TEXT,
    Status TEXT DEFAULT 'Open',
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SCHEDULING AND ATTENDANCE
-- ============================================

CREATE TABLE IF NOT EXISTS ScheduledTest (
    ScheduleID INTEGER PRIMARY KEY AUTOINCREMENT,
    PersonID INTEGER NOT NULL REFERENCES Person(PersonID),
    ScheduledDate TEXT NOT NULL,
    ScheduledTime TEXT,
    TestTypeID INTEGER REFERENCES TestType(TestTypeID),
    Status TEXT DEFAULT 'Scheduled', -- Scheduled, Completed, DNA, Cancelled
    RandomSelectionBatchID TEXT, -- Links tests from same random selection
    AssignedClinicianID INTEGER REFERENCES Clinician(ClinicianID),
    Notes TEXT,
    CreatedBy INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AttendanceRecord (
    AttendanceID INTEGER PRIMARY KEY AUTOINCREMENT,
    PersonID INTEGER NOT NULL REFERENCES Person(PersonID),
    ScheduledDate TEXT NOT NULL,
    ScheduleID INTEGER REFERENCES ScheduledTest(ScheduleID),
    Reason TEXT,
    Status TEXT DEFAULT 'Did Not Attend', -- Did Not Attend, Refused, Rescheduled
    FollowUpRequired INTEGER DEFAULT 0,
    FollowUpNotes TEXT,
    CreatedBy INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- REPORTING AND CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS ReportParameter (
    ParameterID INTEGER PRIMARY KEY AUTOINCREMENT,
    ReportType TEXT NOT NULL, -- Weekly, Quarterly, Custom
    ParameterName TEXT NOT NULL,
    ParameterValue TEXT,
    UserID INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SystemConfig (
    ConfigID INTEGER PRIMARY KEY AUTOINCREMENT,
    ConfigKey TEXT NOT NULL UNIQUE,
    ConfigValue TEXT,
    Description TEXT,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO SystemConfig (ConfigKey, ConfigValue, Description) VALUES 
    ('BAC_POSITIVE_THRESHOLD', '0.05', 'BAC level at or above which result is positive'),
    ('BAC_NONNEG_THRESHOLD', '0.02', 'BAC level at or above which result requires review'),
    ('COMPANY_NAME', 'SCJV', 'Organisation name for reports'),
    ('LAB_NAME', 'Testing Laboratory', 'Default laboratory name');

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS AuditLog (
    LogID INTEGER PRIMARY KEY AUTOINCREMENT,
    Timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    UserID INTEGER REFERENCES User(UserID),
    Action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT, etc.
    RecordType TEXT, -- AODTest, Person, NonNegativeRecord, etc.
    RecordID INTEGER,
    Description TEXT,
    OldValues TEXT, -- JSON of previous values
    NewValues TEXT, -- JSON of new values
    IPAddress TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditlog_timestamp ON AuditLog(Timestamp);
CREATE INDEX IF NOT EXISTS idx_auditlog_user ON AuditLog(UserID);
CREATE INDEX IF NOT EXISTS idx_auditlog_record ON AuditLog(RecordType, RecordID);

-- ============================================
-- FILE ATTACHMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS Attachment (
    AttachmentID INTEGER PRIMARY KEY AUTOINCREMENT,
    RecordType TEXT NOT NULL, -- AODTest, NonNegativeRecord, etc.
    RecordID INTEGER NOT NULL,
    Category TEXT, -- 'Initial Test Record', 'Lab Results', 'Chain of Custody', 'Other'
    FileName TEXT NOT NULL,
    OriginalFileName TEXT, -- Original name as uploaded
    FilePath TEXT NOT NULL,
    FileSize INTEGER,
    MimeType TEXT,
    Description TEXT,
    UploadedBy INTEGER REFERENCES User(UserID),
    UploadedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachment_record ON Attachment(RecordType, RecordID);
CREATE INDEX IF NOT EXISTS idx_attachment_category ON Attachment(Category);

-- ============================================
-- PATIENT TRACKER / CLINICAL EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS PatientEvent (
    EventID INTEGER PRIMARY KEY AUTOINCREMENT,
    EventDate TEXT NOT NULL,
    EventTime TEXT,
    PersonID INTEGER NOT NULL REFERENCES Person(PersonID),
    EventType TEXT NOT NULL,
    Description TEXT,
    Treatment TEXT,
    Outcome TEXT,
    FollowUpRequired INTEGER DEFAULT 0,
    FollowUpDate TEXT,
    FollowUpCompleted INTEGER DEFAULT 0,
    ReferralMade INTEGER DEFAULT 0,
    ReferralTo TEXT,
    ClinicianID INTEGER REFERENCES Clinician(ClinicianID),
    Notes TEXT,
    CreatedBy INTEGER REFERENCES User(UserID),
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy INTEGER REFERENCES User(UserID),
    UpdatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_patientevent_date ON PatientEvent(EventDate);
CREATE INDEX IF NOT EXISTS idx_patientevent_person ON PatientEvent(PersonID);
CREATE INDEX IF NOT EXISTS idx_patientevent_type ON PatientEvent(EventType);

-- ============================================
-- RANDOM TEST SELECTION LISTS
-- ============================================

CREATE TABLE IF NOT EXISTS RandomTestList (
    ListID INTEGER PRIMARY KEY AUTOINCREMENT,
    ListDate TEXT NOT NULL, -- Date the list is for
    Shift TEXT NOT NULL, -- 'Dayshift', 'Nightshift'
    SourceFileName TEXT, -- Original PDF filename
    ImportedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    ImportedBy INTEGER REFERENCES User(UserID),
    Notes TEXT
);

CREATE TABLE IF NOT EXISTS RandomTestEntry (
    EntryID INTEGER PRIMARY KEY AUTOINCREMENT,
    ListID INTEGER REFERENCES RandomTestList(ListID),
    -- Person info (may or may not match existing Person record)
    EmployeeNumber TEXT,
    EmployeeName TEXT NOT NULL,
    Department TEXT,
    Position TEXT,
    -- Matching
    MatchedPersonID INTEGER REFERENCES Person(PersonID), -- If matched to existing person
    -- Status tracking
    Status TEXT DEFAULT 'Pending', -- 'Pending', 'Tested', 'Not Available', 'Deferred', 'Cancelled'
    TestID INTEGER REFERENCES AODTest(TestID), -- Link to completed test
    StatusNote TEXT,
    StatusUpdatedAt TEXT,
    StatusUpdatedBy INTEGER REFERENCES User(UserID),
    -- Manual entry flag
    ManualEntry INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_randomlist_date ON RandomTestList(ListDate);
CREATE INDEX IF NOT EXISTS idx_randomlist_shift ON RandomTestList(Shift);
CREATE INDEX IF NOT EXISTS idx_randomentry_list ON RandomTestEntry(ListID);
CREATE INDEX IF NOT EXISTS idx_randomentry_status ON RandomTestEntry(Status);

-- ============================================
-- SDS CHEMICAL REGISTER
-- ============================================

CREATE TABLE IF NOT EXISTS Chemical (
    ChemicalID INTEGER PRIMARY KEY AUTOINCREMENT,
    Code TEXT NOT NULL UNIQUE,           -- e.g., HC001
    ProductName TEXT NOT NULL,           -- Product Name
    Location TEXT,                       -- Storage Location
    Quantity INTEGER,                    -- Number of containers
    ContainerSize TEXT,                  -- e.g., "500 mL"
    TotalQuantity TEXT,                  -- e.g., "15 L"
    UnitSize TEXT,                       -- Unit of measure
    ContainerType TEXT,                  -- Bottle, Drum, etc.
    Manufacturer TEXT,                   -- Manufacturer/Supplier
    DGClass TEXT,                        -- Dangerous Goods Class
    UNNumber TEXT,                       -- UN Number
    GHSClassification TEXT,              -- GHS hazard class
    SignalWord TEXT,                     -- Danger/Warning
    StorageRequirements TEXT,            -- Storage conditions
    Status TEXT DEFAULT 'Active',        -- Active/Inactive/Discontinued
    Notes TEXT,                          -- Additional notes
    SDSFileName TEXT,                    -- PDF filename
    SDSPath TEXT,                        -- Path to SDS PDF
    SDSIssueDate TEXT,                   -- Date SDS issued
    SDSReviewDue TEXT,                   -- Next review date
    PhotoFileName TEXT,                  -- Photo filename
    PhotoPath TEXT,                      -- Path to photo
    ReviewDate TEXT,                     -- Last review date
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT,
    UpdatedBy INTEGER REFERENCES User(UserID)
);

CREATE INDEX IF NOT EXISTS idx_chemical_code ON Chemical(Code);
CREATE INDEX IF NOT EXISTS idx_chemical_location ON Chemical(Location);
CREATE INDEX IF NOT EXISTS idx_chemical_status ON Chemical(Status);
CREATE INDEX IF NOT EXISTS idx_chemical_dgclass ON Chemical(DGClass);
CREATE INDEX IF NOT EXISTS idx_chemical_reviewdue ON Chemical(SDSReviewDue);
