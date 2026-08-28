-- ============================================================
-- AOD Tracker — SQL Server / Azure SQL Schema
-- Compatible with: SQL Server 2019+, SQL Server Express 2019+, Azure SQL
--
-- Usage:
--   Run this script in SQL Server Management Studio (SSMS) or
--   Azure Data Studio against your target database BEFORE starting
--   the application for the first time with DB_TYPE=mssql.
--
--   sqlcmd -S localhost\SQLEXPRESS -d AODTracker -i schema-mssql.sql
-- ============================================================

-- Create database if it does not exist (run as sysadmin)
-- IF DB_ID('AODTracker') IS NULL
--   CREATE DATABASE AODTracker;
-- GO

-- ── Lookup / Reference Tables ────────────────────────────────────────────────

IF OBJECT_ID('Sex', 'U') IS NULL
CREATE TABLE Sex (
  SexID   INT IDENTITY(1,1) PRIMARY KEY,
  Name    NVARCHAR(20) NOT NULL UNIQUE
);
GO

IF OBJECT_ID('WorkerType', 'U') IS NULL
CREATE TABLE WorkerType (
  WorkerTypeID INT IDENTITY(1,1) PRIMARY KEY,
  Name         NVARCHAR(50) NOT NULL UNIQUE
);
GO

IF OBJECT_ID('Role', 'U') IS NULL
CREATE TABLE Role (
  RoleID INT IDENTITY(1,1) PRIMARY KEY,
  Name   NVARCHAR(50) NOT NULL UNIQUE
);
GO

IF OBJECT_ID('TestType', 'U') IS NULL
CREATE TABLE TestType (
  TestTypeID INT IDENTITY(1,1) PRIMARY KEY,
  Name       NVARCHAR(50) NOT NULL,
  Code       NVARCHAR(10) NULL
);
GO

IF OBJECT_ID('ResultClassification', 'U') IS NULL
CREATE TABLE ResultClassification (
  ClassificationID INT IDENTITY(1,1) PRIMARY KEY,
  Name             NVARCHAR(50) NOT NULL UNIQUE
);
GO

-- ── Core Entities ─────────────────────────────────────────────────────────────

IF OBJECT_ID('Employer', 'U') IS NULL
CREATE TABLE Employer (
  EmployerID   INT IDENTITY(1,1) PRIMARY KEY,
  CompanyName  NVARCHAR(150) NOT NULL,
  ABN          NVARCHAR(20)  NULL,
  Category     NVARCHAR(50)  NOT NULL DEFAULT 'Contractor',
  IsActive     BIT           NOT NULL DEFAULT 1,
  CreatedAt    DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('Person', 'U') IS NULL
CREATE TABLE Person (
  PersonID      INT IDENTITY(1,1) PRIMARY KEY,
  FullName      NVARCHAR(150) NOT NULL,
  BadgeNumber   NVARCHAR(50)  NULL,
  EmployerID    INT           NULL REFERENCES Employer(EmployerID),
  WorkerTypeID  INT           NULL REFERENCES WorkerType(WorkerTypeID),
  SexID         INT           NULL REFERENCES Sex(SexID),
  DOB           DATE          NULL,
  IsActive      BIT           NOT NULL DEFAULT 1,
  CreatedAt     DATETIME2     NOT NULL DEFAULT GETDATE(),
  UpdatedAt     DATETIME2     NULL
);
GO

IF OBJECT_ID('Clinician', 'U') IS NULL
CREATE TABLE Clinician (
  ClinicianID    INT IDENTITY(1,1) PRIMARY KEY,
  Name           NVARCHAR(150) NOT NULL,
  Qualifications NVARCHAR(200) NULL,
  IsActive       BIT           NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID([User], 'U') IS NULL
CREATE TABLE [User] (
  UserID       INT IDENTITY(1,1) PRIMARY KEY,
  Username     NVARCHAR(50)  NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  FullName     NVARCHAR(150) NULL,
  Email        NVARCHAR(200) NULL,
  RoleID       INT           NULL REFERENCES Role(RoleID),
  IsActive     BIT           NOT NULL DEFAULT 1,
  CreatedAt    DATETIME2     NOT NULL DEFAULT GETDATE(),
  LastLoginAt  DATETIME2     NULL
);
GO

-- ── AOD Testing ───────────────────────────────────────────────────────────────

IF OBJECT_ID('AODTest', 'U') IS NULL
CREATE TABLE AODTest (
  TestID                  INT IDENTITY(1,1) PRIMARY KEY,
  TestDate                DATE         NOT NULL,
  TestTime                NVARCHAR(10) NULL,
  PersonID                INT          NULL REFERENCES Person(PersonID),
  EmployerID              INT          NULL REFERENCES Employer(EmployerID),
  TestTypeID              INT          NULL REFERENCES TestType(TestTypeID),
  ClinicianID             INT          NULL REFERENCES Clinician(ClinicianID),
  OralResult              NVARCHAR(30) NULL,
  UrineResult             NVARCHAR(30) NULL,
  BACInitialValue         REAL         NULL,
  BACInitialTime          NVARCHAR(10) NULL,
  BACFinalValue           REAL         NULL,
  BACFinalTime            NVARCHAR(10) NULL,
  OralSubstances          NVARCHAR(500) NULL,
  UrineSubstances         NVARCHAR(500) NULL,
  OralControlLines        NVARCHAR(200) NULL,
  UrineControlLines       NVARCHAR(200) NULL,
  IsNonNegative           BIT          NOT NULL DEFAULT 0,
  RFT                     BIT          NOT NULL DEFAULT 0,
  ConfirmatoryResult      NVARCHAR(50) NULL,
  ConfirmatoryResultDate  DATE         NULL,
  DeclaredMedications     NVARCHAR(500) NULL,
  MedicationReviewStatus  NVARCHAR(50) NULL,
  MedicationReviewNotes   NVARCHAR(MAX) NULL,
  OverallAODResult        NVARCHAR(80) NULL,
  TestStatus              NVARCHAR(30) NOT NULL DEFAULT 'Closed',
  OverrideBACResult       NVARCHAR(30) NULL,
  OverrideBACReason       NVARCHAR(500) NULL,
  OverrideDrugResult      NVARCHAR(30) NULL,
  OverrideDrugReason      NVARCHAR(500) NULL,
  LabDrugDetails          NVARCHAR(500) NULL,
  Creatinine              NVARCHAR(50) NULL,
  LabComments             NVARCHAR(MAX) NULL,
  Notes                   NVARCHAR(MAX) NULL,
  CreatedBy               INT          NULL REFERENCES [User](UserID),
  CreatedAt               DATETIME2    NOT NULL DEFAULT GETDATE(),
  UpdatedAt               DATETIME2    NULL
);
GO

-- ── Patient Events ────────────────────────────────────────────────────────────

IF OBJECT_ID('PatientEvent', 'U') IS NULL
CREATE TABLE PatientEvent (
  EventID        INT IDENTITY(1,1) PRIMARY KEY,
  EventDate      DATE          NOT NULL,
  EventTime      NVARCHAR(10)  NULL,
  PersonID       INT           NULL REFERENCES Person(PersonID),
  PatientName    NVARCHAR(150) NULL,
  Workgroup      NVARCHAR(100) NULL,
  WrNwr          NVARCHAR(30)  NULL,
  BodyLocation   NVARCHAR(100) NULL,
  InjuryType     NVARCHAR(100) NULL,
  Classification NVARCHAR(80)  NULL,
  RtwPlan        NVARCHAR(100) NULL,
  DrConsult      BIT           NOT NULL DEFAULT 0,
  Referral       NVARCHAR(100) NULL,
  ClinicianID    INT           NULL REFERENCES Clinician(ClinicianID),
  Comment        NVARCHAR(MAX) NULL,
  CreatedBy      INT           NULL REFERENCES [User](UserID),
  CreatedAt      DATETIME2     NOT NULL DEFAULT GETDATE(),
  UpdatedAt      DATETIME2     NULL,
  UpdatedBy      INT           NULL REFERENCES [User](UserID)
);
GO

IF OBJECT_ID('ReferralOption', 'U') IS NULL
CREATE TABLE ReferralOption (
  OptionID  INT IDENTITY(1,1) PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL,
  SortOrder INT           NOT NULL DEFAULT 0,
  IsActive  BIT           NOT NULL DEFAULT 1,
  CONSTRAINT UQ_ReferralOption_Name UNIQUE (Name)
);
GO

-- Seed default referral options
IF NOT EXISTS (SELECT 1 FROM ReferralOption)
INSERT INTO ReferralOption (Name, SortOrder) VALUES
  ('Return to work', 1),
  ('Camp',           2),
  ('Physio',         3),
  ('Medmate',        4),
  ('GP',             5),
  ('Company Injury Management Team', 6),
  ('ED',             7);
GO

-- ── Training Tracker ─────────────────────────────────────────────────────────

IF OBJECT_ID('Trainer', 'U') IS NULL
CREATE TABLE Trainer (
  TrainerID      INT IDENTITY(1,1) PRIMARY KEY,
  Name           NVARCHAR(150) NOT NULL,
  Qualifications NVARCHAR(200) NULL,
  Email          NVARCHAR(200) NULL,
  Phone          NVARCHAR(30)  NULL,
  IsActive       BIT           NOT NULL DEFAULT 1,
  IsTrainer      BIT           NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('TrainingUnit', 'U') IS NULL
CREATE TABLE TrainingUnit (
  UnitID          INT IDENTITY(1,1) PRIMARY KEY,
  Code            NVARCHAR(30)  NOT NULL UNIQUE,
  Title           NVARCHAR(200) NOT NULL,
  Package         NVARCHAR(20)  NULL,
  ValidityMonths  INT           NOT NULL DEFAULT 24,
  IsActive        BIT           NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('CPDType', 'U') IS NULL
CREATE TABLE CPDType (
  CPDTypeID INT IDENTITY(1,1) PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL UNIQUE,
  IsActive  BIT           NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('TrainingRecord', 'U') IS NULL
CREATE TABLE TrainingRecord (
  RecordID        INT IDENTITY(1,1) PRIMARY KEY,
  Date            DATE          NOT NULL,
  TrainerID       INT           NULL REFERENCES Trainer(TrainerID),
  TrainingUnitID  INT           NULL REFERENCES TrainingUnit(UnitID),
  CPDTypeID       INT           NULL REFERENCES CPDType(CPDTypeID),
  Hours           REAL          NULL,
  ExpiryDate      DATE          NULL,
  Notes           NVARCHAR(MAX) NULL,
  CreatedAt       DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('TrainingAttendee', 'U') IS NULL
CREATE TABLE TrainingAttendee (
  AttendeeID  INT IDENTITY(1,1) PRIMARY KEY,
  TrainingID  INT NOT NULL REFERENCES TrainingRecord(RecordID) ON DELETE CASCADE,
  TrainerID   INT NOT NULL REFERENCES Trainer(TrainerID)
);
GO

-- ── Audit Log ────────────────────────────────────────────────────────────────

IF OBJECT_ID('AuditLog', 'U') IS NULL
CREATE TABLE AuditLog (
  LogID       INT IDENTITY(1,1) PRIMARY KEY,
  UserID      INT           NULL REFERENCES [User](UserID),
  Action      NVARCHAR(20)  NOT NULL,
  RecordType  NVARCHAR(50)  NOT NULL,
  RecordID    INT           NULL,
  Description NVARCHAR(MAX) NULL,
  CreatedAt   DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

-- ── Seed lookup data ──────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM Sex)
INSERT INTO Sex (Name) VALUES ('Male'), ('Female'), ('Non-binary'), ('Prefer not to say');
GO

IF NOT EXISTS (SELECT 1 FROM WorkerType)
INSERT INTO WorkerType (Name) VALUES ('Employee'), ('Contractor'), ('Visitor'), ('Other');
GO

IF NOT EXISTS (SELECT 1 FROM Role)
INSERT INTO Role (Name) VALUES ('Admin'), ('Clinician'), ('Viewer');
GO

PRINT 'AODTracker MSSQL schema applied successfully.';
GO
