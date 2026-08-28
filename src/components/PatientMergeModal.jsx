import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, GitMerge, CheckCircle, Loader2, ArrowRight, AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';

/**
 * Shared patient merge modal.
 * Props:
 *   targetPatient – the patient the merge was initiated from (Person object)
 *   onClose       – called to dismiss
 *   onMerged      – called after successful merge
 */
const PatientMergeModal = ({ targetPatient, onClose, onMerged }) => {
  const { hideBadgeNumber } = useApp();
  const [step, setStep]         = useState('search'); // search | preview | confirm | done
  const [search, setSearch]     = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview]   = useState(null);   // { a, b, recommendation }
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [swapped, setSwapped]   = useState(false);  // user overrode the recommendation
  const [merging, setMerging]   = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const searchTimer             = useRef(null);

  const doSearch = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const all = await api.getPersons({ search: term });
      setResults(all.filter(p => p.PersonID !== targetPatient.PersonID));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [targetPatient.PersonID]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search, doSearch]);

  const selectCandidate = async (p) => {
    setLoadingPreview(true);
    setStep('preview');
    try {
      const data = await api.getMergePreview(targetPatient.PersonID, p.PersonID);
      setPreview(data);
      setSwapped(false);
    } catch (err) {
      alert('Could not load preview: ' + err.message);
      setStep('search');
    } finally { setLoadingPreview(false); }
  };

  // Derived: who is keep/drop based on recommendation + any user swap
  const keepId = preview
    ? (swapped
        ? (preview.recommendation.keepId === preview.a.PersonID ? preview.b.PersonID : preview.a.PersonID)
        : preview.recommendation.keepId)
    : null;
  const dropId = preview
    ? (keepId === preview.a.PersonID ? preview.b.PersonID : preview.a.PersonID)
    : null;
  const keepPerson = preview ? (keepId === preview.a.PersonID ? preview.a : preview.b) : null;
  const dropPerson = preview ? (dropId === preview.a.PersonID ? preview.a : preview.b) : null;

  // Fields that will be filled from drop → keep (keep is missing them, drop has them)
  const filledFields = keepPerson && dropPerson
    ? ['DateOfBirth','EmployerID','SexID','WorkerTypeID','BadgeNumber','EmployeeNumber','Department','Position','Email','Phone']
        .filter(f => !keepPerson[f] && dropPerson[f])
    : [];

  const fieldLabel = { DateOfBirth:'DOB', EmployerID:'Employer', SexID:'Sex', WorkerTypeID:'Patient Type',
    BadgeNumber:'Badge #', EmployeeNumber:'Employee #', Department:'Department', Position:'Position',
    Email:'Email', Phone:'Phone' };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const res = await api.mergePersons(keepId, dropId);
      setMergeResult(res);
      setStep('done');
      onMerged();
    } catch (err) {
      alert('Merge failed: ' + err.message);
    } finally { setMerging(false); }
  };

  const userOverrodeRecommendation = preview && swapped;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-600" /> Merge Patients
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* ── STEP: search ── */}
          {step === 'search' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
                Searching for a duplicate to merge with <strong>{targetPatient.FullName}</strong>.
                The system will recommend which record to keep based on data completeness.
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, badge, or employer..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              {searching && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Searching...</p>}
              {results.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y max-h-56 overflow-y-auto">
                  {results.map(p => (
                    <button key={p.PersonID} onClick={() => selectCandidate(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                      <p className="font-medium text-gray-800">{p.FullName}</p>
                      <p className="text-xs text-gray-500">
                        {p.EmployerName || 'No employer'} · DOB: {p.DateOfBirth || 'none'} · Tests: {p.TestCount || 0}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {search && !searching && results.length === 0 && (
                <p className="text-xs text-gray-400">No patients found</p>
              )}
            </>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && (
            <>
              {loadingPreview ? (
                <div className="text-center py-10 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading comparison…
                </div>
              ) : preview && (
                <>
                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-2 gap-3">
                    {[preview.a, preview.b].map((p, i) => {
                      const isKeep = p.PersonID === keepId;
                      const isDrop = p.PersonID === dropId;
                      const recKeep = p.PersonID === preview.recommendation.keepId;
                      return (
                        <div key={p.PersonID}
                          className={`rounded-xl border-2 p-3 ${isKeep ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isKeep ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
                              {isKeep ? '✓ KEEP' : '✗ REMOVE'}
                            </span>
                            {recKeep && (
                              <span className="text-xs text-green-700 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />Recommended
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{p.FullName}</p>
                          <div className="mt-2 space-y-1 text-xs">
                            <FieldRow label="DOB" val={p.DateOfBirth} other={i === 0 ? preview.b.DateOfBirth : preview.a.DateOfBirth} />
                            <FieldRow label="Employer" val={p.EmployerName} other={i === 0 ? preview.b.EmployerName : preview.a.EmployerName} />
                            {!hideBadgeNumber && <FieldRow label="Badge #" val={p.BadgeNumber} other={i === 0 ? preview.b.BadgeNumber : preview.a.BadgeNumber} />}
                            {!hideBadgeNumber && <FieldRow label="Emp #" val={p.EmployeeNumber} other={i === 0 ? preview.b.EmployeeNumber : preview.a.EmployeeNumber} />}
                            <FieldRow label="AOD Tests" val={i === 0 ? preview.recommendation.aTests : preview.recommendation.bTests} />
                            <FieldRow label="Events" val={i === 0 ? preview.recommendation.aEvents : preview.recommendation.bEvents} />
                            <FieldRow label="Active" val={p.IsActive ? 'Yes' : 'No'} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Recommendation reasoning */}
                  <div className={`rounded-lg p-3 text-sm border ${userOverrodeRecommendation ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                    {userOverrodeRecommendation ? (
                      <p className="text-amber-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span><strong>You have overridden the recommendation.</strong> Double-check the selected keep record has the best data.</span>
                      </p>
                    ) : (
                      <p className="text-blue-800 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
                        <span><strong>Recommended:</strong> {preview.recommendation.reasons[0]}</span>
                      </p>
                    )}
                  </div>

                  {/* Fields that will be auto-filled */}
                  {filledFields.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                      <p className="font-semibold mb-1">Fields that will be copied from the removed record to fill gaps:</p>
                      <p>{filledFields.map(f => fieldLabel[f] || f).join(' · ')}</p>
                    </div>
                  )}

                  {/* Swap button */}
                  <button onClick={() => setSwapped(s => !s)}
                    className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 underline">
                    <RotateCcw className="w-4 h-4" />
                    {swapped ? 'Use recommended order instead' : 'Override — swap which record is kept'}
                  </button>

                  {/* Final warning */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                    <strong>⚠ Warning — this cannot be undone.</strong>
                    <p className="mt-1">
                      <strong>{dropPerson?.FullName}</strong> will be <strong>deactivated</strong> and all their
                      AOD tests, patient events, training and scheduled tests moved to <strong>{keepPerson?.FullName}</strong>.
                      {filledFields.length > 0 && ` Missing fields on ${keepPerson?.FullName} will be filled from the removed record.`}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => { setStep('search'); setPreview(null); }}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                      ← Back
                    </button>
                    <button onClick={handleMerge} disabled={merging}
                      className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm disabled:bg-gray-300 flex items-center justify-center gap-2">
                      {merging
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Merging…</>
                        : <><GitMerge className="w-4 h-4" />Confirm Merge</>}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-2">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold text-gray-800 text-lg">Merge complete</p>
              <p className="text-sm text-gray-500">
                <strong>{dropPerson?.FullName}</strong> has been merged into <strong>{keepPerson?.FullName}</strong>.
              </p>
              {mergeResult?.fieldsFilled?.length > 0 && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5 inline-block">
                  Fields filled from removed record: {mergeResult.fieldsFilled.map(f => fieldLabel[f] || f).join(', ')}
                </p>
              )}
              <p className="text-xs text-gray-400">
                {mergeResult?.totalTests} total AOD tests now on the kept record.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t shrink-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper: show a field value, highlight if the other patient has a value and this one is missing
const FieldRow = ({ label, val, other }) => {
  const missing = !val && other;
  const hasVal  = !!val;
  return (
    <div className={`flex justify-between ${missing ? 'text-red-500' : hasVal ? 'text-gray-700' : 'text-gray-400'}`}>
      <span className="font-medium">{label}</span>
      <span>{val != null && val !== '' ? String(val) : <span className="italic">—</span>}</span>
    </div>
  );
};

export default PatientMergeModal;
