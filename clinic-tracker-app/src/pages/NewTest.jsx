import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FlaskConical, Loader2, AlertTriangle, User, ArrowLeft, X, GitMerge } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { format } from 'date-fns';
import { HelpIcon } from '../components/Tooltip';
import { HELP } from '../utils/helpText';

// Helper: Check if a name matches search term in either "First Last" or "Last, First" format
function nameMatchesSearch(fullName, searchTerm) {
  if (!fullName || !searchTerm) return false;
  const name = fullName.toLowerCase().trim();
  const search = searchTerm.toLowerCase().trim();

  // Direct match
  if (name.includes(search)) return true;

  // Try format conversions
  if (search.includes(',')) {
    // Search is "Surname, Firstname" - try "Firstname Surname"
    const parts = search.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [surname, firstname] = parts;
      const reversed = `${firstname} ${surname}`;
      if (name.includes(reversed)) return true;
    }
  } else if (search.includes(' ')) {
    // Search is "Firstname Surname" - try "Surname, Firstname"
    const parts = search.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstname = parts[0];
      const surname = parts.slice(1).join(' ');
      const withComma = `${surname}, ${firstname}`;
      if (name.includes(withComma)) return true;
      // Also try reversed without comma
      const reversed = `${surname} ${firstname}`;
      if (name.includes(reversed)) return true;
    }
  }

  return false;
}

// Status box component to show current test status
const TestStatusBox = ({ form, isNonNegative, isBACPositive }) => {
  // Determine status based on form state
  const getStatus = () => {
    if (!form.testTypeId) {
      return { label: 'New Test', status: 'pending', color: 'gray', description: 'Enter test information to begin' };
    }
    
    const hasAlcoholTest = form.bacUndertaken;
    const hasDrugTest = form.oralUndertaken || form.urineUndertaken;
    
    if (!hasAlcoholTest && !hasDrugTest) {
      return { label: 'New Test', status: 'pending', color: 'gray', description: 'Select at least one test type (BAC, Oral, or Urine)' };
    }
    
    // If we have test results entered
    if (hasAlcoholTest || hasDrugTest) {
      // Check for non-negative conditions
      if (isNonNegative || isBACPositive) {
        if (form.urineResult === 'Non-Negative' || form.oralResult === 'Non-Negative') {
          return { label: 'Pending Lab', status: 'pending-lab', color: 'amber', description: 'Non-negative result requires lab confirmation' };
        }
        if (isBACPositive) {
          return { label: 'Action Required', status: 'action', color: 'red', description: 'Positive BAC result - follow up required' };
        }
      }
      
      // All tests entered and negative
      const bacComplete = !hasAlcoholTest || (form.bacInitialValue && (!parseFloat(form.bacInitialValue) > 0 || form.bacFinalValue));
      const drugComplete = !hasDrugTest || form.oralResult || form.urineResult;
      
      if (bacComplete && drugComplete) {
        return { label: 'Ready to Save', status: 'ready', color: 'green', description: 'All required fields completed - test can be saved' };
      }
    }
    
    return { label: 'In Progress', status: 'in-progress', color: 'blue', description: 'Continue entering test details' };
  };
  
  const status = getStatus();
  
  const colors = {
    gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-200 text-gray-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-200 text-blue-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-200 text-red-800' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-200 text-green-800' }
  };
  
  const c = colors[status.color];
  
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            status.status === 'pending' ? 'bg-gray-400' :
            status.status === 'in-progress' ? 'bg-blue-500' :
            status.status === 'pending-lab' ? 'bg-amber-500 animate-pulse' :
            status.status === 'action' ? 'bg-red-500' :
            'bg-green-500'
          }`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">Test Status:</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${c.badge}`}>
                {status.label}
              </span>
            </div>
            <p className={`text-xs ${c.text} mt-0.5`}>{status.description}</p>
          </div>
        </div>
        
        {/* Quick indicators */}
        <div className="flex gap-2 text-xs">
          {form.bacUndertaken && (
            <span className={`px-2 py-1 rounded ${
              isBACPositive ? 'bg-red-100 text-red-700' : form.bacInitialValue ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              BAC {isBACPositive ? '⚠ +' : form.bacInitialValue ? '✓' : '…'}
            </span>
          )}
          {(form.oralUndertaken || form.urineUndertaken) && (
            <span className={`px-2 py-1 rounded ${
              (form.oralResult === 'Non-Negative' || form.urineResult === 'Non-Negative') ? 'bg-amber-100 text-amber-700' :
              (form.oralResult || form.urineResult) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              Drug {(form.oralResult === 'Non-Negative' || form.urineResult === 'Non-Negative') ? '⚠ Pending' : (form.oralResult || form.urineResult) ? '✓' : '…'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const NewTest = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lookups, hideBadgeNumber, oralPanel, urinePanel } = useApp();
  const [existingPersons, setExistingPersons] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [clinicians, setClinicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // { existingTest, pendingSubmit }
  const [scheduleMatch, setScheduleMatch] = useState(null); // { match, pendingSubmit }
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef(null);

  // Pre-populate from imported entry or manual scheduled test
  const fromEntry = location.state?.fromEntry || null;
  const fromSchedule = location.state?.fromSchedule || null;
  const returnDate = location.state?.returnDate || null;

  const [form, setForm] = useState({
    testDate: format(new Date(), 'yyyy-MM-dd'),
    testTime: format(new Date(), 'HH:mm'),
    personId: fromSchedule?.PersonID || fromEntry?.MatchedPersonID || null,
    donorName: fromSchedule?.PersonName || fromEntry?.MatchedPersonName || fromEntry?.DisplayName || fromEntry?.EmployeeName || '',
    donorDOB: '',
    donorEmployer: (fromSchedule?.EmployerID || fromEntry?.ResolvedEmployerID || fromEntry?.MatchedEmployerID || '').toString().replace(/^0$/, ''),
    donorBadge: fromSchedule?.BadgeNumber || fromEntry?.MatchedBadge || '',
    declaredMedications: '',
    idSighted: false,
    idType: '',
    idNumber: '',
    testTypeId: fromSchedule?.TestTypeID?.toString() || fromEntry?.ListTestTypeID?.toString() || '',
    clinicianId: '',
    bacUndertaken: false,
    bacInitialValue: '',
    bacInitialTime: format(new Date(), 'HH:mm'),
    bacFinalValue: '',
    bacFinalTime: '',
    oralUndertaken: false,
    oralResult: '',
    oralSubstances: [],
    oralControlLines: '',
    urineUndertaken: false,
    urineResult: '',
    urineSubstances: [],
    urineControlLines: '',
    sampleSentToLab: false,
    labRequestType: 'specific',
    labRequestNotes: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      const [personsData, employersData, cliniciansData] = await Promise.all([
        api.getPersons(),
        api.getEmployers(),
        api.getClinicians()
      ]);
      setExistingPersons(personsData);
      setEmployers(employersData);
      setClinicians(cliniciansData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fill suggestions as user types name
  const handleNameChange = (value) => {
    setForm({ ...form, donorName: value, personId: null });

    if (value.length >= 2) {
      const matches = existingPersons.filter(p =>
        nameMatchesSearch(p.FullName, value)
      ).slice(0, 5);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Select existing person from suggestions
  const selectPerson = (person) => {
    setForm({
      ...form,
      personId: person.PersonID,
      donorName: person.FullName,
      donorDOB: person.DateOfBirth || '',
      donorEmployer: person.EmployerID?.toString() || '',
      donorBadge: person.BadgeNumber || ''
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.donorName.trim()) {
      alert('Please enter donor name');
      return;
    }
    if (!form.testTypeId) {
      alert('Please select a test type');
      return;
    }
    if (!form.bacUndertaken && !form.oralUndertaken && !form.urineUndertaken) {
      alert('Please select at least one test (BAC, Oral, or Urine)');
      return;
    }

    // Build testData first so we can reuse it after duplicate confirmation
    const testData = {
        testDate: form.testDate,
        testTime: form.testTime,
        personId: form.personId ? parseInt(form.personId) : null,
        donorName: form.donorName.trim(),
        donorDOB: form.donorDOB || null,
        donorEmployer: form.donorEmployer || null,
        donorBadge: form.donorBadge || null,
        testTypeId: parseInt(form.testTypeId),
        clinicianId: form.clinicianId ? parseInt(form.clinicianId) : null,
        // Carry pre-assigned TestNumber from scheduling so the same ID is used
        testNumber: fromSchedule?.TestNumber || undefined,
        bacUndertaken: form.bacUndertaken,
        bacInitialValue: form.bacUndertaken ? parseFloat(form.bacInitialValue) || 0 : null,
        bacInitialTime: form.bacUndertaken ? form.bacInitialTime : null,
        bacFinalValue: form.bacUndertaken && form.bacFinalValue ? parseFloat(form.bacFinalValue) : null,
        bacFinalTime: form.bacUndertaken ? form.bacFinalTime : null,
        oralUndertaken: form.oralUndertaken,
        oralResult: form.oralUndertaken ? form.oralResult : null,
        oralSubstances: form.oralUndertaken ? form.oralSubstances : [],
        oralControlLines: form.oralUndertaken ? form.oralControlLines : null,
        urineUndertaken: form.urineUndertaken,
        urineResult: form.urineUndertaken ? form.urineResult : null,
        urineSubstances: form.urineUndertaken ? form.urineSubstances : [],
        urineControlLines: form.urineUndertaken ? form.urineControlLines : null,
        declaredMedications: form.declaredMedications || null,
        idSighted: form.idSighted,
        idType: form.idSighted ? form.idType || null : null,
        idNumber: form.idSighted ? form.idNumber || null : null,
        sampleSentToLab: form.sampleSentToLab,
        labRequestType: form.sampleSentToLab ? form.labRequestType : null,
        labRequestNotes: form.sampleSentToLab ? form.labRequestNotes : null,
        notes: form.notes
      };

    // Check for duplicate before submitting
    try {
      const params = new URLSearchParams({
        testDate: form.testDate,
        ...(form.personId && { personId: form.personId }),
        ...(form.donorName && { donorName: form.donorName.trim() }),
        ...(form.donorEmployer && { employerId: form.donorEmployer }),
      });
      const dupCheck = await fetch(`/api/tests/check-duplicate?${params}`).then(r => r.json());
      if (dupCheck.hasDuplicate) {
        setDuplicate({ existingTest: dupCheck.existingTest, pendingSubmit: testData });
        return;
      }
    } catch { /* non-blocking */ }

    // Check for matching scheduled test (including when coming from imported entries)
    try {
      const matchParams = { testDate: form.testDate };
      if (form.personId) matchParams.personId = form.personId;
      else if (form.donorName) matchParams.donorName = form.donorName.trim();
      if (form.testTypeId) matchParams.testTypeId = form.testTypeId;
      if (form.donorEmployer) matchParams.employerId = form.donorEmployer;
      const schedResult = await api.getScheduleMatch(matchParams);
      // Handle both scheduled tests and imported entries
      if (schedResult?.hasMatch) {
        // If coming from an imported entry and we found a matching scheduled test, prefer the scheduled test
        if (fromEntry && schedResult.scheduledMatch) {
          setScheduleMatch({ match: schedResult.scheduledMatch, pendingSubmit: testData, matchType: 'scheduled' });
          return;
        }
        if (schedResult.scheduledMatch) {
          setScheduleMatch({ match: schedResult.scheduledMatch, pendingSubmit: testData, matchType: 'scheduled' });
          return;
        }
        if (schedResult.importedMatch && !fromEntry) {
          setScheduleMatch({ match: schedResult.importedMatch, pendingSubmit: testData, matchType: 'imported' });
          return;
        }
      }
    } catch { /* non-blocking */ }

    await doSaveTest(testData);
  };

  const doSaveTest = async (testData, scheduleInfo = null, skipAutoMerge = false) => {
    setSaving(true);
    try {
      const result = await api.createTest({ ...testData, skipAutoMerge: skipAutoMerge || undefined });

      // Server auto-resolves matching scheduled/imported entries.
      // Only fall back to explicit frontend calls if the server didn't already handle them.
      const serverMergedScheduled = result.autoMerged?.scheduledTests ?? [];
      const serverMergedImported  = result.autoMerged?.importedEntries ?? [];

      // If we came from an imported entry and server didn't catch it, mark it manually
      if (fromEntry?.EntryID && !serverMergedImported.includes(fromEntry.EntryID)) {
        try {
          await api.updateRandomListEntry(fromEntry.EntryID, { status: 'Tested', testId: result.id });
        } catch (e) {
          console.warn('Could not mark entry as Tested:', e);
        }
      }
      // If linked via the schedule-match modal and server didn't already handle it, mark manually
      if (scheduleInfo) {
        try {
          if (scheduleInfo.type === 'scheduled' && scheduleInfo.id && !serverMergedScheduled.includes(scheduleInfo.id)) {
            await api.updateScheduledTest(scheduleInfo.id, { status: 'Completed', notes: `Linked to test ${result.testNumber}` });
          } else if (scheduleInfo.type === 'imported' && scheduleInfo.entryId && !serverMergedImported.includes(scheduleInfo.entryId)) {
            await api.updateRandomListEntry(scheduleInfo.entryId, { status: 'Tested', testId: result.id });
          }
        } catch (e) {
          console.warn('Could not mark schedule entry as Completed:', e);
        }
      }

      const mergeCount = (result.autoMerged?.count ?? 0);
      const mergeNote = mergeCount > 0
        ? `\n✓ ${mergeCount} pending schedule entr${mergeCount === 1 ? 'y' : 'ies'} automatically marked as completed.`
        : '';
      alert(`Test ${result.testNumber} created successfully!${mergeNote}`);
      if (returnDate) {
        navigate('/scheduling');
      } else {
        navigate('/tests');
      }
    } catch (err) {
      alert('Failed to create test: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const doCreateAnyway = async () => {
    const testData = duplicate.pendingSubmit;
    setDuplicate(null);
    await doSaveTest(testData);
  };

  const doMerge = async () => {
    const { existingTest, pendingSubmit } = duplicate;
    setDuplicate(null);
    setSaving(true);
    try {
      await api.updateTest(existingTest.TestID, pendingSubmit);
      alert(`Merged into existing test ${existingTest.TestNumber}`);
      navigate(`/tests/${existingTest.TestID}`);
    } catch (err) {
      alert('Merge failed: ' + err.message);
    } finally { setSaving(false); }
  };

  const formatBAC = (field, value) => {
    const num = parseFloat(value);
    if (!isNaN(num)) setForm(f => ({ ...f, [field]: num.toFixed(3) }));
  };

  // BAC > 0 is Positive, Drug detected = Non-Negative (until lab confirmed)
  const bacFinal = form.bacFinalValue ? parseFloat(form.bacFinalValue) : parseFloat(form.bacInitialValue) || 0;
  const isBACPositive = form.bacUndertaken && bacFinal > 0;
  const isDrugNonNegative = form.oralResult === 'Non-Negative' || form.urineResult === 'Non-Negative';
  const isNonNegative = isDrugNonNegative || isBACPositive;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div>
      {/* Duplicate Warning Modal */}
      {duplicate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className={`flex items-center gap-3 p-5 border-b rounded-t-xl ${
              duplicate.isActive ? 'bg-amber-50' : 'bg-green-50'
            }`}>
              <div className={`p-2 rounded-full ${
                duplicate.isActive ? 'bg-amber-100' : 'bg-green-100'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  duplicate.isActive ? 'text-amber-600' : 'text-green-600'
                }`} />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">
                  {duplicate.isActive ? 'Active Test Found' : 'Previous Test Found'}
                </h2>
                <p className={`text-sm ${
                  duplicate.isActive ? 'text-amber-700' : 'text-green-700'
                }`}>
                  {duplicate.isActive ? 'A test is already in progress for this person on this date' : 'A completed test exists for this person on this date'}
                </p>
              </div>
              <button onClick={() => setDuplicate(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {duplicate.warningMessage && (
                <div className={`rounded-lg p-3 text-sm ${
                  duplicate.isActive ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-green-50 text-green-800 border border-green-200'
                }`}>
                  {duplicate.warningMessage}
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                <p><span className="text-gray-500">Test #:</span> <span className="font-semibold">{duplicate.existingTest.TestNumber}</span></p>
                <p><span className="text-gray-500">Person:</span> <span className="font-semibold">{duplicate.existingTest.FullName}</span></p>
                {duplicate.existingTest.EmployerName && (
                  <p><span className="text-gray-500">Employer:</span> <span className="font-semibold">{duplicate.existingTest.EmployerName}</span></p>
                )}
                <p><span className="text-gray-500">Type:</span> <span className="font-semibold">{duplicate.existingTest.TestTypeName || '—'}</span></p>
                <p>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span className={`font-semibold ${
                    duplicate.existingTest.TestStatus === 'Closed' ? 'text-green-600' :
                    duplicate.existingTest.TestStatus === 'Pending Lab' ? 'text-amber-600' :
                    duplicate.existingTest.TestStatus === 'Action Required' ? 'text-red-600' :
                    duplicate.existingTest.TestStatus === 'Review Required' ? 'text-purple-600' :
                    'text-blue-600'
                  }`}>{duplicate.existingTest.TestStatus}</span>
                </p>
              </div>

              <p className="text-sm text-gray-600">How would you like to proceed?</p>

              <div className="space-y-2">
                <button onClick={doMerge} disabled={saving}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm text-left">
                  <GitMerge className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Merge into existing test</p>
                    <p className="text-blue-200 text-xs">Update the existing record with this new data</p>
                  </div>
                </button>
                
                {/* Always show "Create anyway" with styling based on status */}
                <button onClick={doCreateAnyway} disabled={saving}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-2 rounded-lg disabled:opacity-50 text-sm text-left ${
                    duplicate.isActive
                      ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' 
                      : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                  }`}>
                  <FlaskConical className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Create separate test anyway</p>
                    <p className={`text-xs ${duplicate.isActive ? 'text-red-600' : 'text-green-600'}`}>
                      {duplicate.isActive ? 'Warning: Active test exists on this date' : 'Previous test is complete - new test allowed'}
                    </p>
                  </div>
                </button>
                
                <button onClick={() => setDuplicate(null)}
                  className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">
                  Cancel — go back to form
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Schedule Match Modal — handles both ScheduledTest and RandomTestEntry */}
      {scheduleMatch && (() => {
        const m = scheduleMatch.match;
        const isImported = scheduleMatch.matchType === 'imported';
        const typeLabel = m.TestTypeName || m.TestType || (isImported ? 'Imported' : 'Scheduled');
        const personName = m.PersonName || m.MatchedPersonName || m.DisplayName || m.EmployeeName;
        const dateLabel  = m.ScheduledDate || m.ListDate;
        const employer   = m.EmployerName || m.MatchedEmployerName || m.Department;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

              {/* Header */}
              <div className="flex items-start gap-3 p-5 border-b rounded-t-xl bg-amber-50">
                <div className="p-2 rounded-full bg-amber-100 mt-0.5">
                  <FlaskConical className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-gray-900">Pending {typeLabel} test found</h2>
                  <p className="text-sm text-amber-700 mt-0.5">
                    A pending <span className="font-semibold">{typeLabel}</span> test for{' '}
                    <span className="font-semibold">{personName}</span> already exists for today.
                  </p>
                </div>
                <button onClick={() => setScheduleMatch(null)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pending entry detail */}
              <div className="px-5 pt-4 pb-2">
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border border-gray-200">
                  <div className="flex gap-2"><span className="text-gray-500 w-20 shrink-0">Person:</span><span className="font-semibold">{personName}</span></div>
                  <div className="flex gap-2"><span className="text-gray-500 w-20 shrink-0">Date:</span><span className="font-semibold">{dateLabel}</span></div>
                  <div className="flex gap-2"><span className="text-gray-500 w-20 shrink-0">Test type:</span><span className="font-semibold">{typeLabel}</span></div>
                  {employer && <div className="flex gap-2"><span className="text-gray-500 w-20 shrink-0">Employer:</span><span className="font-semibold">{employer}</span></div>}
                  {m.Shift   && <div className="flex gap-2"><span className="text-gray-500 w-20 shrink-0">Shift:</span><span className="font-semibold">{m.Shift}</span></div>}
                </div>
              </div>

              {/* The question */}
              <div className="px-5 pb-1">
                <p className="text-sm font-semibold text-gray-800">Is this the same test, or a separate test?</p>
              </div>

              {/* Choices */}
              <div className="p-5 pt-2 space-y-2">
                {/* Same test → merge & close */}
                <button
                  onClick={async () => {
                    const td = scheduleMatch.pendingSubmit;
                    const scheduleInfo = isImported
                      ? { type: 'imported',   entryId: m.EntryID }
                      : { type: 'scheduled',  id: m.ScheduleID  };
                    setScheduleMatch(null);
                    await doSaveTest(td, scheduleInfo);
                  }}
                  disabled={saving}
                  className="w-full flex items-start gap-3 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm text-left"
                >
                  <span className="text-lg leading-none mt-0.5">✓</span>
                  <div>
                    <p className="font-semibold">Yes — same test</p>
                    <p className="text-green-200 text-xs">Record results and mark the pending entry as completed</p>
                  </div>
                </button>

                {/* Different test → create new, leave pending entry open */}
                <button
                  onClick={async () => {
                    const td = scheduleMatch.pendingSubmit;
                    setScheduleMatch(null);
                    await doSaveTest(td, null, true);
                  }}
                  disabled={saving}
                  className="w-full flex items-start gap-3 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm text-left"
                >
                  <span className="text-lg leading-none mt-0.5">+</span>
                  <div>
                    <p className="font-semibold">No — separate test</p>
                    <p className="text-gray-400 text-xs">Create a new test record; the pending entry stays open</p>
                  </div>
                </button>

                <button onClick={() => setScheduleMatch(null)}
                  className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">
                  Cancel — go back to form
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="mb-6">
        {(fromEntry || fromSchedule) && (
          <button onClick={() => navigate('/scheduling')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ArrowLeft className="w-4 h-4" /> Back to Schedule
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">Record Test</h1>
        <p className="text-gray-500">Record a drug and/or alcohol test</p>
      </div>

      {fromSchedule && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <FlaskConical className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Scheduled test — {fromSchedule.PersonName}</p>
            <p className="text-sm text-blue-700">
              {fromSchedule.EmployerName && `${fromSchedule.EmployerName} • `}
              {fromSchedule.TestNumber && <span className="font-mono font-semibold">{fromSchedule.TestNumber}</span>}
            </p>
          </div>
        </div>
      )}

      {fromEntry && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <FlaskConical className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Pre-filled from imported list</p>
            <p className="text-sm text-blue-700">
              {fromEntry.DisplayName || fromEntry.EmployeeName}
              {fromEntry.Department && ` — ${fromEntry.Department}`}
              {fromEntry.MatchedPersonID ? ' (matched to system record)' : ' (no system match — name pre-filled only)'}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Test Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">Date * <HelpIcon text={HELP.test.testDate} /></label>
              <input type="date" value={form.testDate} onChange={(e) => setForm({...form, testDate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">Time <HelpIcon text={HELP.test.testTime} /></label>
              <input type="time" value={form.testTime} onChange={(e) => setForm({...form, testTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">Test Type * <HelpIcon text={HELP.test.testType} position="right" /></label>
              <select value={form.testTypeId} onChange={(e) => setForm({...form, testTypeId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required>
                <option value="">Select type...</option>
                {lookups.testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">Clinician <HelpIcon text={HELP.test.clinician} /></label>
              <select value={form.clinicianId} onChange={(e) => setForm({...form, clinicianId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select clinician...</option>
                {clinicians.map(c => <option key={c.ClinicianID} value={c.ClinicianID}>{c.Name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Test Status Box */}
        <TestStatusBox form={form} isNonNegative={isNonNegative} isBACPositive={isBACPositive} />

        {/* Donor Information - Free Entry with Auto-fill */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Donor Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name with auto-complete */}
            <div className="relative" ref={suggestionsRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  value={form.donorName} 
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => form.donorName.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Enter donor name..." 
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg" 
                  required 
                />
              </div>
              
              {/* Auto-fill suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-500 font-medium">Previous donors - click to auto-fill</div>
                  {suggestions.map(person => (
                    <button
                      key={person.PersonID}
                      type="button"
                      onClick={() => selectPerson(person)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-gray-900">{person.FullName}</p>
                      <p className="text-xs text-gray-500">
                        {person.EmployerName || 'No employer'} {!hideBadgeNumber && person.BadgeNumber && `• Badge: ${person.BadgeNumber}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              
              {form.personId && (
                <p className="text-xs text-green-600 mt-1">✓ Returning donor - details auto-filled</p>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input 
                type="date" 
                value={form.donorDOB} 
                onChange={(e) => setForm({...form, donorDOB: e.target.value})} 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" 
              />
            </div>

            {/* Employer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employer / Company</label>
              <select 
                value={form.donorEmployer} 
                onChange={(e) => setForm({...form, donorEmployer: e.target.value})} 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="">Select or leave blank...</option>
                {employers.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
              </select>
            </div>

            {/* Badge Number */}
            {!hideBadgeNumber && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Badge / Employee #</label>
              <input 
                type="text" 
                value={form.donorBadge} 
                onChange={(e) => setForm({...form, donorBadge: e.target.value})} 
                placeholder="Optional" 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" 
              />
            </div>
            )}
          </div>

          {/* ID Verification */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.idSighted}
                onChange={(e) => setForm({ ...form, idSighted: e.target.checked, idType: '', idNumber: '' })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">ID Sighted and Verified</span>
            </label>
            {form.idSighted && (
              <div className="mt-3 grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ID Type <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.idType}
                    onChange={(e) => setForm({ ...form, idType: e.target.value })}
                    placeholder="e.g. Driver's Licence, Passport"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ID Number <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.idNumber}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                    placeholder="e.g. 1234567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Declared Medications */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Declared Medications <span className="text-gray-400 font-normal">(medications taken in last 14 days — optional)</span>
            </label>
            <textarea
              value={form.declaredMedications}
              onChange={(e) => setForm({...form, declaredMedications: e.target.value})}
              rows={2}
              placeholder="e.g. Panadol, Ibuprofen, Codeine..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Test Results */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Test Results</h2>
          
          {/* BAC - Initial and Final (20 min observation) */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
              <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={form.bacUndertaken} onChange={(e) => setForm({...form, bacUndertaken: e.target.checked})} className="w-4 h-4 rounded" />
              <span className="font-medium">Breath Alcohol Test (BAC)</span>
              <HelpIcon text={HELP.test.bacUndertaken} position="right" />
            </label>
            {form.bacUndertaken && (
              <div className="ml-6 space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800 space-y-1">
                  <p><strong>BAC Testing Protocol:</strong></p>
                  <p>1. Record <strong>Initial BAC</strong> reading</p>
                  <p>2. If Initial &gt; 0.000%, observe <strong>20-minute wait period</strong></p>
                  <p>3. During observation: <em>No food, drink, smoking, or vaping</em></p>
                  <p>4. Record <strong>Final BAC</strong> - this is the legally recognised result</p>
                  <p className="pt-1 border-t border-blue-200 mt-2"><strong>Result:</strong> BAC = 0.000% → Negative | BAC &gt; 0.000% → Positive</p>
                </div>
                
                {/* Initial BAC */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">Initial BAC Reading * <HelpIcon text={HELP.test.bacValue} /></label>
                    <input type="text" inputMode="decimal" value={form.bacInitialValue} onChange={(e) => setForm({...form, bacInitialValue: e.target.value})} onBlur={(e) => formatBAC('bacInitialValue', e.target.value)} placeholder="0.000" className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Time</label>
                    <input type="time" value={form.bacInitialTime} onChange={(e) => setForm({...form, bacInitialTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                  </div>
                </div>

                {/* Show workplace warning if Initial > 0 */}
                {parseFloat(form.bacInitialValue) > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                    <p className="text-sm text-red-800 font-medium">⚠️ WORKPLACE VIOLATION: Any BAC &gt; 0 is Prohibited</p>
                    <p className="text-xs text-red-700 mt-1">Initial reading shows alcohol present. This constitutes a workplace safety violation. 20-minute observation and Final BAC required to confirm.</p>
                  </div>
                )}

                {/* Show Final BAC section if Initial > 0 */}
                {parseFloat(form.bacInitialValue) > 0 && (
                  <div className="border-t pt-4">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                      <p className="text-sm text-amber-800 font-medium">⏱️ 20-Minute Observation Period Required</p>
                      <p className="text-xs text-amber-700 mt-1">Donor must NOT consume food, drink, smoke, vape, or place anything in mouth during this period. This eliminates residual mouth alcohol that may falsely elevate readings.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Final BAC Reading *</label>
                        <input type="text" inputMode="decimal" value={form.bacFinalValue} onChange={(e) => setForm({...form, bacFinalValue: e.target.value})} onBlur={(e) => formatBAC('bacFinalValue', e.target.value)} placeholder="0.000" className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Final Time</label>
                        <input type="time" value={form.bacFinalTime} onChange={(e) => setForm({...form, bacFinalTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Result indicator - Final BAC is the determining result */}
                {form.bacUndertaken && (parseFloat(form.bacInitialValue) >= 0 || parseFloat(form.bacFinalValue) >= 0) && (
                  <div className={`p-3 rounded-lg text-sm ${isBACPositive ? 'bg-red-100 border border-red-200' : 'bg-green-100 border border-green-200'}`}>
                    <p className={`font-medium ${isBACPositive ? 'text-red-800' : 'text-green-800'}`}>
                      Result: {isBACPositive ? 'POSITIVE' : 'NEGATIVE'}
                    </p>
                    <p className={`text-xs mt-1 ${isBACPositive ? 'text-red-700' : 'text-green-700'}`}>
                      {form.bacFinalValue ? 
                        `Final BAC: ${parseFloat(form.bacFinalValue).toFixed(3)}% (determines result)` : 
                        `Initial BAC: ${parseFloat(form.bacInitialValue || 0).toFixed(3)}%`}
                      {parseFloat(form.bacInitialValue) > 0 && parseFloat(form.bacFinalValue) === 0 && 
                        ' — Initial positive cleared by negative final (likely mouth alcohol)'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Oral Fluid */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
              <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={form.oralUndertaken} onChange={(e) => setForm({...form, oralUndertaken: e.target.checked, oralResult: '', oralSubstances: [], oralControlLines: ''})} className="w-4 h-4 rounded" />
              <span className="font-medium">Oral Fluid Drug Screening</span>
              <HelpIcon text={HELP.test.oralUndertaken} position="right" />
            </label>
            {form.oralUndertaken && (
              <div className="ml-6 space-y-3">
                <p className="text-xs text-gray-500">Screening result only. "Non-Negative" indicates possible presence — lab confirmation required before classifying as "Positive".</p>
                <div className="grid grid-cols-4 gap-2">
                  {['Negative', 'Non-Negative', 'Refused', 'Unable to Test'].map(r => (
                    <button key={r} type="button"
                      onClick={() => setForm({...form, oralResult: r, oralSubstances: [], oralControlLines: ''})}
                      className={`p-2 rounded-lg border text-sm ${form.oralResult === r ? (r === 'Negative' ? 'border-green-500 bg-green-50 text-green-700' : r === 'Non-Negative' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-blue-500 bg-blue-50 text-blue-700') : 'border-gray-200 hover:border-gray-300'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                {/* Control lines */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">Control lines present?</span>
                  {['Y', 'N'].map(v => (
                    <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="oralControlLines" value={v} checked={form.oralControlLines === v} onChange={() => setForm({...form, oralControlLines: v})} className="w-4 h-4" />
                      <span>{v === 'Y' ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
                {/* Substance picker — only when Non-Negative */}
                {form.oralResult === 'Non-Negative' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-medium text-amber-800 mb-2">Select non-negative panel(s):</p>
                    <div className="flex flex-wrap gap-2">
                      {oralPanel.map(s => {
                        const checked = form.oralSubstances.includes(s);
                        return (
                          <button key={s} type="button"
                            onClick={() => setForm({...form, oralSubstances: checked ? form.oralSubstances.filter(x => x !== s) : [...form.oralSubstances, s]})}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${checked ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'}`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Urine */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={form.urineUndertaken} onChange={(e) => setForm({...form, urineUndertaken: e.target.checked, urineResult: '', urineSubstances: [], urineControlLines: ''})} className="w-4 h-4 rounded" />
              <span className="font-medium">Urine Drug Screening</span>
              <HelpIcon text={HELP.test.urineUndertaken} position="right" />
            </label>
            {form.urineUndertaken && (
              <div className="ml-6 space-y-3">
                <p className="text-xs text-gray-500">Screening result only. "Non-Negative" indicates possible presence — lab confirmation required before classifying as "Positive".</p>
                <div className="grid grid-cols-4 gap-2">
                  {['Negative', 'Non-Negative', 'Refused', 'Unable to Test'].map(r => (
                    <button key={r} type="button"
                      onClick={() => setForm({...form, urineResult: r, urineSubstances: [], urineControlLines: ''})}
                      className={`p-2 rounded-lg border text-sm ${form.urineResult === r ? (r === 'Negative' ? 'border-green-500 bg-green-50 text-green-700' : r === 'Non-Negative' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-blue-500 bg-blue-50 text-blue-700') : 'border-gray-200 hover:border-gray-300'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                {/* Control lines */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">Control lines present?</span>
                  {['Y', 'N'].map(v => (
                    <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="urineControlLines" value={v} checked={form.urineControlLines === v} onChange={() => setForm({...form, urineControlLines: v})} className="w-4 h-4" />
                      <span>{v === 'Y' ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
                {/* Substance picker — only when Non-Negative */}
                {form.urineResult === 'Non-Negative' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-medium text-amber-800 mb-2">Select non-negative panel(s):</p>
                    <div className="flex flex-wrap gap-2">
                      {urinePanel.map(s => {
                        const checked = form.urineSubstances.includes(s);
                        return (
                          <button key={s} type="button"
                            onClick={() => setForm({...form, urineSubstances: checked ? form.urineSubstances.filter(x => x !== s) : [...form.urineSubstances, s]})}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${checked ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'}`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Non-Negative Drug Result - Lab Confirmation Required */}
        {isDrugNonNegative && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800">Non-Negative Drug Screening Result</p>
                <p className="text-sm text-amber-700 mt-1 mb-3">
                  This is an <strong>indicative screening result only</strong>. A non-negative result indicates possible presence of a drug or metabolite but does not confirm use or impairment. 
                  Sample must be sent to an accredited laboratory for confirmatory testing (GC-MS/LC-MS) before classification as "Positive".
                </p>
                <label className="flex items-center gap-2 mb-3">
                  <input type="checkbox" checked={form.sampleSentToLab} onChange={(e) => setForm({...form, sampleSentToLab: e.target.checked})} className="w-4 h-4 rounded border-amber-400" />
                  <span className="text-sm text-amber-800 font-medium">Sample sent to laboratory for confirmation</span>
                  <HelpIcon text={HELP.test.sampleSentToLab} position="right" />
                </label>
                {form.sampleSentToLab && (
                  <div className="mt-2 space-y-3 pl-6 border-l-2 border-amber-300">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                        <input type="radio" name="labRequestType" value="specific"
                          checked={form.labRequestType === 'specific'}
                          onChange={() => setForm({...form, labRequestType: 'specific'})}
                          className="accent-amber-600" />
                        Specific Test Requested
                      </label>
                      <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                        <input type="radio" name="labRequestType" value="gcms"
                          checked={form.labRequestType === 'gcms'}
                          onChange={() => setForm({...form, labRequestType: 'gcms'})}
                          className="accent-amber-600" />
                        GC-MS Requested
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-amber-800 mb-1">
                        {form.labRequestType === 'gcms' ? 'GC-MS Instructions / Notes' : 'Test Requested / Notes'}
                      </label>
                      <textarea
                        value={form.labRequestNotes}
                        onChange={(e) => setForm({...form, labRequestNotes: e.target.value})}
                        rows={2}
                        placeholder={form.labRequestType === 'gcms' ? 'e.g. Full GC-MS confirmation for all drug classes' : 'e.g. Confirm THC and amphetamines only'}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Positive BAC Result Warning */}
        {isBACPositive && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Positive Alcohol Result (BAC &gt; 0.000%)</p>
                <p className="text-sm text-red-700 mt-1">
                  Final BAC of {bacFinal.toFixed(3)}% is non-compliant with zero-tolerance workplace policy. 
                  Manage in accordance with company procedure.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-1.5">Notes <HelpIcon text={HELP.test.notes} /></h2>
          <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Any additional notes..." />
        </div>

        {/* Submit */}
        <button type="submit" disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-400 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Creating Test...' : 'Create Test'}
        </button>
      </form>
    </div>
  );
};

export default NewTest;
