/**
 * Centralised help / tooltip text for the application.
 * Import { HELP } from '../utils/helpText' and pass HELP.someKey to HelpIcon.
 */

export const HELP = {

  // ── Navigation ───────────────────────────────────────────────────────────────
  nav: {
    dashboard:    'Overview of today\'s activity: recent tests, pending items, and quick-access stats.',
    patients:     'Search and view individual worker records including their full AOD test history.',
    newTest:      'Record a new AOD test result for a worker. Covers oral fluid, BAC, and urine.',
    tests:        'Full historical list of all AOD tests across all workers and companies.',
    nonNegative:  'Manage open non-negative cases. Tracks follow-up actions through to resolution.',
    scheduling:   'View the daily test schedule, import random selection lists, and manage pending tests.',
    workers:      'Manage the worker/patient database — add, edit, import, or merge records.',
    employers:    'Manage company records, categories (SCJV Staff / Contractor), and aliases.',
    training:     'Log and track CPD/training activities for clinic staff.',
    checks:       'Scheduled quality and compliance checks — track due dates and completion history.',
    testing:      'Manage testing administration: devices, supplies, and audit trails.',
    reports:      'Generate analytics reports, custom queries, DNA analysis, and pending item summaries.',
    settings:     'Configure clinicians, test types, device records, and system preferences.',
    admin:        'System administration: database backup, import tools, and advanced settings.',
  },

  // ── Record Test (NewTest) ─────────────────────────────────────────────────────
  test: {
    testType:         'The reason this test was conducted.\n\n• PRE – Pre-employment/Return-to-work\n• RND – Random selection\n• CAU – For Cause (reasonable suspicion)\n• INC – Post Incident\n• PA – Port Authority mandated\n• BLK – Blanket (site-wide)\n• DNA – Did Not Attend',
    testDate:         'Date the test was physically performed. Defaults to today.',
    testTime:         'Time the test was performed. Used for BAC follow-up timing calculations.',
    clinician:        'The staff member who conducted this test. Required for audit trail.',
    oralUndertaken:   'Whether an oral fluid (saliva) drug screen was collected.',
    oralResult:       'The preliminary oral fluid screening result.\n\nNegative = no drugs detected above cutoff.\nNon-Negative = drugs detected; confirmatory test recommended.',
    oralDevice:       'Oral fluid testing device used (e.g. DrugWipe, SalivaScreen). Recorded for audit.',
    oralSubstances:   'Drug classes detected on the oral fluid device (e.g. Cannabis, Amphetamines).',
    bacUndertaken:    'Whether a breath alcohol concentration (BAC) test was performed.',
    bacValue:         'Breath alcohol reading in g/100mL. Site limit is typically 0.000 or 0.020.\n\nA positive result requires a second test after 15–20 minutes.',
    bacDevice:        'Breathalyser device used. Recorded for calibration audit purposes.',
    urineUndertaken:  'Whether a urine drug screen was collected.',
    urineResult:      'The preliminary urine screening result.',
    sampleSentToLab:  'Tick if the sample has been sent to an external laboratory for confirmatory analysis (GC-MS or LC-MS/MS).',
    labReference:     'Laboratory job/reference number. Used to match results when they return.',
    confirmatoryResult: 'Final laboratory result once confirmatory testing is complete. Overrides the screening result for official purposes.',
    rft:              'Return to Full Time Duties. Tick once the worker has been cleared to return after a positive/non-negative result.',
    isNonNegative:    'Marks this test as a non-negative result, triggering a case in the Non-Negative management queue.',
    overallResult:    'The overall AOD outcome for this test (Negative / Positive). Automatically calculated but can be overridden.',
    declaredMedications: 'Medications declared by the worker before testing. Relevant for interpreting oral fluid or urine results.',
    medicationReviewStatus: 'Status of the medical review for declared medications.\n\n• Pending – review not yet done\n• Inconsistent – declared medications do not explain the result\n• Cleared – medications accepted as explanation',
    notes:            'Any additional context, observations, or instructions for this test record.',
    finalDrugOutcome: 'The final determination for the drug screen component.\n\nNegative = cleared.\nNon-Negative / Confirmed Positive = further action required.',
    finalBACOutcome:  'The final determination for the BAC component.\n\nNegative = cleared (0.000 g/100mL or below site limit).\nPositive = above site limit.',
  },

  // ── Reports ───────────────────────────────────────────────────────────────────
  reports: {
    period:           'The date range to include in the report. Use the quarter shortcut buttons or set a custom range.',
    companies:        'Filter results to specific companies. By default all companies are included.',
    generateReport:   'Fetches and calculates all analytics for the selected period and companies. May take a moment for large date ranges.',
    exportExcel:      'Downloads an Excel (.xlsx) file with the full test list and autofilter applied.',

    pending:          'Live view of all open items requiring action — not filtered by date period.',
    pendingLab:       'Tests where the sample has been sent to an external lab but no confirmatory result has been received yet.',
    actionRequired:   'Tests where the status has been set to "Action Required" — typically a positive result needing management follow-up.',
    reviewRequired:   'Tests flagged for clinical or management review before a final outcome can be confirmed.',
    openNonNeg:       'Non-negative tests that have not yet been formally closed. Each should have a case note and resolution.',
    overdueScheduled: 'Workers whose scheduled test date has passed but who have not yet been tested or marked as DNA.',
    medicationReview:  'Tests where declared medications need to be reviewed against the result — either pending or found inconsistent.',

    customQuery:      'Build a highly specific search across all tests using any combination of filters. Similar to Excel column filtering.',
    cqPresets:        'Quick one-click filters to jump straight to the most common queries without building them manually.',
    cqActiveTags:     'Each pill shows an active filter. Click ✕ on any tag to remove just that one filter without clearing everything else.',
    cqTestTypes:      'Click one or more test type badges to restrict results to only those test types. Leave all un-selected to include all types.',
    cqBACRange:       'Filter by the BAC reading value (g/100mL). For example, set ≥ 0.050 to see all tests above the site limit.',
    cqClinician:      'Restrict results to tests conducted by a specific clinician.',
    cqWorkerType:     'Filter to only SCJV direct staff or only Contractor personnel.',
    cqToggles:        'Boolean filters — only tests where that specific test type was undertaken, or only tests matching the flag.',
    cqSort:           'Click any column header to sort ascending (▲) or descending (▼) by that column.',
    cqExport:         'Exports the full filtered results (up to 5,000 rows) to Excel with autofilter and row highlighting.',

    dnaReport:        'Non-Attendance analysis — workers who were selected for testing but did not present.',
    dnaRepeat:        'Workers with 2 or more DNA records within the selected period. Repeat non-attendance may warrant escalation.',
    dnaTrend:         'Monthly DNA count split by SCJV Staff (blue) and Contractor (purple). Useful for identifying seasonal patterns.',

    variation:        'Tests with unusual or inconsistent data combinations — e.g. a positive BAC but "Negative" final outcome, or a non-negative flag without a non-negative result.',
  },

  // ── Workers / Patients ────────────────────────────────────────────────────────
  workers: {
    badgeNumber:  'Site access badge number. Used to match workers from random selection lists.',
    employeeNum:  'Payroll or HR employee number. Optional but useful for matching imports.',
    workerType:   'SCJV Staff = direct employees of the SCJV joint venture.\nContractor = external company personnel.',
    mergeWorker:  'Combine two duplicate worker records into one, preserving all test history. Cannot be undone without admin access.',
  },

  // ── Non-Negative ─────────────────────────────────────────────────────────────
  nonNeg: {
    caseStatus:   'Open = no action taken yet. In Progress = follow-up underway. Closed = resolved.',
    followUp:     'Describe the action taken or planned — e.g. "Referred to MRO", "Stood down pending confirmation".',
    rft:          'Mark the worker as Return to Full Duties once medically cleared and management has approved re-entry.',
  },

  // ── Scheduling ────────────────────────────────────────────────────────────────
  scheduling: {
    randomSelection: 'Randomly selects a percentage of workers from each company/category for testing. Selection is based on the active worker pool.',
    importPDF:       'Parses a PDF random selection list exported from the HR/ERP system. Matches names to existing worker records automatically.',
    overdueWarning:  'Workers whose scheduled date has passed without a recorded test or DNA outcome.',
  },

};
