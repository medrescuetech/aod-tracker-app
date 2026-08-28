import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Loader2, MessageSquare, X, CheckCircle, Search,
  ChevronRight, FileText, Clock, FlaskConical, User, Building2,
  Calendar, Paperclip, RefreshCw, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { HelpIcon } from '../components/Tooltip';
import { HELP } from '../utils/helpText';
import { format, formatDistanceToNow } from 'date-fns';

// ─── helpers ────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  Open:       'bg-red-100 text-red-700 border-red-200',
  'In Review':'bg-amber-100 text-amber-700 border-amber-200',
  Closed:     'bg-green-100 text-green-700 border-green-200',
};
const fmtDate = (d) => { try { return d ? format(new Date(d), 'dd/MM/yyyy') : '—'; } catch { return d || '—'; } };
const fmtDateTime = (d) => { try { return d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '—'; } catch { return d || '—'; } };
const Field = ({ label, value, highlight }) => (
  <div>
    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
    <p className={`text-sm font-medium ${highlight ? 'text-red-600' : 'text-gray-800'}`}>{value || '—'}</p>
  </div>
);

// ─── Main page ───────────────────────────────────────────────────────────────
const NonNegative = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('Open');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNonNegativeRecords(filterStatus || undefined, search || undefined);
      setRecords(data);
    } catch (err) {
      console.error('Failed to load records:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const counts = records.reduce((a, r) => { a[r.Status] = (a[r.Status] || 0) + 1; return a; }, {});

  return (
    <div className="flex gap-4 h-full">
      {/* ── List panel ── */}
      <div className={`flex flex-col ${selectedId ? 'w-1/2' : 'w-full'} min-w-0`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">Non-Negative Cases <HelpIcon text={HELP.nav.nonNegative} /></h1>
            <p className="text-gray-500 text-sm">Manage and track non-negative drug & alcohol cases</p>
          </div>
          <button onClick={loadRecords} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-3">
          {[['Open','Open'], ['In Review','In Review'], ['Closed','Closed'], ['','All']].map(([v, l]) => (
            <button key={v} onClick={() => { setFilterStatus(v); setSelectedId(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l}{counts[v || null] !== undefined && v ? '' : ''}
              {v && counts[v] ? <span className="ml-1.5 bg-white/30 px-1 rounded text-xs">{counts[v]}</span> : null}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by name, test #, employer, substance..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Search</button>
          {search && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">Clear</button>}
        </form>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : records.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-16">
            <CheckCircle className="w-10 h-10 mb-2 text-green-300" />
            <p>No {filterStatus || ''} cases found</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {records.map(r => (
              <button key={r.NNID} onClick={() => setSelectedId(r.NNID === selectedId ? null : r.NNID)}
                className={`w-full text-left bg-white border rounded-xl p-3 hover:shadow-sm transition-all ${r.NNID === selectedId ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLE[r.Status] || 'bg-gray-100 text-gray-600'}`}>{r.Status}</span>
                      <span className="text-xs text-gray-400 font-mono">{r.TestNumber}</span>
                      {r.TestTypeCode && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{r.TestTypeCode}</span>}
                    </div>
                    <p className="font-medium text-gray-900 text-sm truncate">{r.PersonName}</p>
                    <p className="text-xs text-gray-500 truncate">{r.EmployerName}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.TypeOfTest && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{r.TypeOfTest}</span>}
                      {r.DetectedSubstances && <span className="text-xs bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[180px]">{r.DetectedSubstances}</span>}
                      {r.ConfirmatoryResult && <span className={`text-xs px-1.5 py-0.5 rounded ${r.ConfirmatoryResult === 'Substance Confirmed' ? 'bg-red-100 text-red-700' : r.ConfirmatoryResult === 'Negative' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.ConfirmatoryResult}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-400">{fmtDate(r.TestDate)}</p>
                    {r.Status !== 'Closed' && r.DaysOpen != null && (
                      <p className={`text-xs mt-0.5 font-medium ${r.DaysOpen > 14 ? 'text-red-500' : r.DaysOpen > 7 ? 'text-amber-500' : 'text-gray-400'}`}>
                        {r.DaysOpen}d open
                      </p>
                    )}
                    {r.Status === 'Closed' && r.DaysTakenToClose != null && (
                      <p className="text-xs mt-0.5 text-gray-400">closed in {r.DaysTakenToClose}d</p>
                    )}
                    <ChevronRight className={`w-4 h-4 mt-1 ml-auto text-gray-300 transition-transform ${r.NNID === selectedId ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selectedId && (
        <div className="w-1/2 min-w-0 border-l pl-4">
          <CaseDetail nnid={selectedId} onClose={() => setSelectedId(null)} onSaved={loadRecords} />
        </div>
      )}
    </div>
  );
};

// ─── Case detail panel ───────────────────────────────────────────────────────
const CaseDetail = ({ nnid, onClose, onSaved }) => {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNonNegativeRecord(nnid);
      setRecord(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [nnid]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  if (!record) return <div className="text-center py-16 text-gray-400">Failed to load case</div>;

  const tabs = [
    { id: 'overview', label: 'Overview',  icon: User },
    { id: 'lab',      label: 'Lab & Results', icon: FlaskConical },
    { id: 'docs',     label: 'Documents', icon: Paperclip },
    { id: 'timeline', label: 'Timeline',  icon: Clock },
    { id: 'manage',   label: 'Manage',    icon: AlertTriangle },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLE[record.Status] || 'bg-gray-100'}`}>{record.Status}</span>
            <button onClick={() => navigate(`/tests/${record.TestID}`)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {record.TestNumber} <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <p className="font-semibold text-gray-900 mt-1">{record.PersonName}</p>
          <p className="text-sm text-gray-500">{record.EmployerName}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-3 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview'  && <OverviewTab  record={record} />}
        {activeTab === 'lab'       && <LabTab        record={record} nnid={nnid} onSaved={() => { load(); onSaved(); }} />}
        {activeTab === 'docs'      && <DocsTab       record={record} />}
        {activeTab === 'timeline'  && <TimelineTab   nnid={nnid} />}
        {activeTab === 'manage'    && <ManageTab     record={record} nnid={nnid} onSaved={() => { load(); onSaved(); }} />}
      </div>
    </div>
  );
};

// ─── Overview tab ─────────────────────────────────────────────────────────────
const OverviewTab = ({ record }) => {
  const { hideBadgeNumber } = useApp();
  return (
  <div className="space-y-4">
    <Section title="Person" icon={User}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full Name" value={record.PersonName} />
        {!hideBadgeNumber && <Field label="Badge #" value={record.BadgeNumber} />}
        <Field label="Employer" value={record.EmployerName} />
        <Field label="Worker Type" value={record.WorkerTypeName} />
        <Field label="Date of Birth" value={fmtDate(record.DateOfBirth)} />
      </div>
    </Section>

    <Section title="Test Details" icon={Calendar}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Test Number" value={record.TestNumber} />
        <Field label="Test Type" value={record.TestTypeName} />
        <Field label="Date" value={fmtDate(record.TestDate)} />
        <Field label="Time" value={record.TestTime || '—'} />
        <Field label="Clinician" value={record.ClinicianName} />
      </div>
    </Section>

    <Section title="Screening Results" icon={AlertTriangle}>
      <div className="space-y-2">
        {record.OralUndertaken ? (
          <ResultRow label="Oral Fluid" result={record.OralResult} substances={record.OralSubstances} />
        ) : null}
        {record.UrineUndertaken ? (
          <ResultRow label="Urine" result={record.UrineResult} substances={record.UrineSubstances} />
        ) : null}
        {record.BACUndertaken ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-gray-50 rounded p-2">
              <span className="text-sm text-gray-600">BAC</span>
              <div className="text-right">
                <span className={`text-sm font-medium ${parseFloat(record.BACInitialValue) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Initial: {record.BACInitialValue ?? '—'}
                </span>
                {record.BACFinalValue != null && (
                  <span className={`ml-2 text-sm font-medium ${parseFloat(record.BACFinalValue) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Final: {record.BACFinalValue}
                  </span>
                )}
              </div>
            </div>
            {(parseFloat(record.BACInitialValue) > 0 || parseFloat(record.BACFinalValue) > 0) && (
              <div className="bg-red-50 border border-red-100 rounded p-2">
                <p className="text-xs text-red-600 font-medium">⚠️ Workplace Violation: Any BAC &gt; 0 is prohibited</p>
              </div>
            )}
          </div>
        ) : null}
        {record.DeclaredMedications && (
          <div className="bg-blue-50 border border-blue-100 rounded p-2">
            <p className="text-xs text-blue-600 font-medium mb-0.5">Declared Medications</p>
            <p className="text-sm text-blue-800">{record.DeclaredMedications}</p>
          </div>
        )}
      </div>
    </Section>

    {record.TestNotes && (
      <Section title="Test Notes" icon={FileText}>
        <p className="text-sm text-gray-700 whitespace-pre-line">{record.TestNotes}</p>
      </Section>
    )}
  </div>
  );
};

const ResultRow = ({ label, result, substances }) => (
  <div className="flex items-center justify-between bg-gray-50 rounded p-2">
    <span className="text-sm text-gray-600">{label}</span>
    <div className="text-right">
      <span className={`text-sm font-medium ${result === 'Non-Negative' ? 'text-red-600' : result === 'Negative' ? 'text-green-600' : 'text-amber-600'}`}>{result || '—'}</span>
      {substances && <p className="text-xs text-gray-400">{substances}</p>}
    </div>
  </div>
);

// ─── Drug panel shared constant ───────────────────────────────────────────────
const NN_DRUG_PANEL = [
  'Cannabis/THC',
  'Amphetamines (ATS)',
  'MDMA/Ecstasy',
  'Cocaine/Benzoylecgonine',
  'Opiates/Morphine',
  'Oxycodone',
  'Benzodiazepines',
  'Buprenorphine',
  'Methadone',
];
const initNNDrugDetails = (existing) => {
  const base = Object.fromEntries(NN_DRUG_PANEL.map(d => [d, { detected: false, level: '', comments: '' }]));
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      parsed.forEach(({ name, level, comments }) => {
        if (base[name]) base[name] = { detected: true, level: level || '', comments: comments || '' };
      });
    } catch (_) {}
  }
  return base;
};

// ─── Lab & Results tab ────────────────────────────────────────────────────────
const LabTab = ({ record, nnid, onSaved }) => {
  const [labRef, setLabRef] = useState(record.LabReference || '');
  const [confirmatoryResult, setConfirmatoryResult] = useState(record.ConfirmatoryResult || '');
  const [confirmatoryDate, setConfirmatoryDate] = useState(record.ConfirmatoryResultDate || '');
  const [drugDetails, setDrugDetails] = useState(() => initNNDrugDetails(record.LabDrugDetails));
  const [creatinine, setCreatinine] = useState(record.Creatinine || '');
  const [labComments, setLabComments] = useState(record.LabComments || '');
  const [medReview, setMedReview] = useState(record.MedicationReviewStatus || '');
  const [medNotes, setMedNotes] = useState(record.MedicationReviewNotes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isSubstanceConfirmed = confirmatoryResult === 'Substance Confirmed';
  const isUnableToTest = confirmatoryResult.startsWith('Lab Unable to Test');

  const updateDrug = (name, field, value) =>
    setDrugDetails(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  const detectedDrugs = Object.entries(drugDetails).filter(([, v]) => v.detected).map(([k]) => k);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateNonNegativeLabResult(nnid, {
        labReference: labRef,
        confirmatoryResult,
        confirmatoryResultDate: confirmatoryDate,
        detectedSubstances: detectedDrugs.join(', '),
        labDrugDetails: JSON.stringify(
          Object.entries(drugDetails)
            .filter(([, v]) => v.detected)
            .map(([name, v]) => ({ name, level: v.level, comments: v.comments }))
        ),
        creatinine,
        labComments,
        medicationReviewStatus: medReview,
        medicationReviewNotes: medNotes,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const finalDrug = record.FinalDrugOutcome;
  const finalBAC  = record.FinalBACOutcome;

  return (
    <div className="space-y-4">
      <Section title="Lab Submission" icon={FlaskConical}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Sample Sent to Lab" value={record.SampleSentToLab ? 'Yes' : 'No'} />
          <Field label="Lab Sent Date" value={fmtDate(record.LabSentDate)} />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lab Reference</label>
            <input value={labRef} onChange={e => setLabRef(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. LAB-2024-001" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Confirmatory Result</label>
              <select value={confirmatoryResult} onChange={e => setConfirmatoryResult(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Pending</option>
                <optgroup label="Standard Outcomes">
                  <option value="Negative">Negative</option>
                  <option value="Substance Confirmed">Substance Confirmed</option>
                  <option value="Inconclusive">Inconclusive</option>
                  <option value="Cancelled">Cancelled</option>
                </optgroup>
                <optgroup label="Unable to Test">
                  <option value="Lab Unable to Test - Sample Invalid">Lab unable to test — sample invalid</option>
                  <option value="Lab Unable to Test - Chain of Custody Issue">Lab unable to test — chain of custody issue</option>
                  <option value="Lab Unable to Test - Not Human Urine">Lab unable to test — not human urine</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Result Date</label>
              <input type="date" value={confirmatoryDate} onChange={e => setConfirmatoryDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {isUnableToTest && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
              This result will be marked as <strong>Review Required</strong>. A replacement sample or further action may be needed.
            </div>
          )}
        </div>
      </Section>

      {/* Drug Panel */}
      {isSubstanceConfirmed && (
        <Section title="Detected Substances" icon={FlaskConical}>
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
            <div className="grid grid-cols-12 gap-0 bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500">
              <div className="col-span-1"></div>
              <div className="col-span-4">Drug / Substance</div>
              <div className="col-span-3">Level (ng/mL)</div>
              <div className="col-span-4">Lab Comments</div>
            </div>
            {NN_DRUG_PANEL.map(drug => {
              const d = drugDetails[drug];
              return (
                <div key={drug} className={`grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center ${d.detected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <div className="col-span-1 flex justify-center">
                    <input type="checkbox" checked={d.detected}
                      onChange={e => updateDrug(drug, 'detected', e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-red-600" />
                  </div>
                  <div className={`col-span-4 text-xs font-medium ${d.detected ? 'text-red-700' : 'text-gray-600'}`}>{drug}</div>
                  <div className="col-span-3">
                    <input type="text" value={d.level} disabled={!d.detected}
                      onChange={e => updateDrug(drug, 'level', e.target.value)}
                      placeholder={d.detected ? 'e.g. 45' : '—'}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs disabled:bg-gray-50 disabled:text-gray-400" />
                  </div>
                  <div className="col-span-4">
                    <input type="text" value={d.comments} disabled={!d.detected}
                      onChange={e => updateDrug(drug, 'comments', e.target.value)}
                      placeholder={d.detected ? 'Notes...' : '—'}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs disabled:bg-gray-50 disabled:text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>
          {detectedDrugs.length > 0 && (
            <p className="text-xs text-red-600 font-medium">Detected: {detectedDrugs.join(', ')}</p>
          )}
        </Section>
      )}

      {/* Sample Validity + Lab Comments */}
      {(isSubstanceConfirmed || confirmatoryResult === 'Negative') && (
        <Section title="Sample Validity" icon={FlaskConical}>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Creatinine (mmol/L) <span className="text-gray-400">optional</span></label>
            <input type="text" value={creatinine} onChange={e => setCreatinine(e.target.value)}
              placeholder="e.g. 8.5"
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </Section>
      )}

      {confirmatoryResult && (
        <Section title="Lab Comments" icon={FileText}>
          <textarea value={labComments} onChange={e => setLabComments(e.target.value)} rows={2}
            placeholder="Overall comments from the laboratory report..."
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </Section>
      )}

      <Section title="Medication Review" icon={FileText}>
        <div className="space-y-3">
          {record.DeclaredMedications && (
            <div className="bg-blue-50 rounded p-2 mb-1">
              <p className="text-xs text-blue-500 font-medium">Donor declared</p>
              <p className="text-sm text-blue-800">{record.DeclaredMedications}</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Review Status</label>
            <select value={medReview} onChange={e => setMedReview(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Pending Review</option>
              <option value="Consistent">Consistent</option>
              <option value="Inconsistent">Inconsistent</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Review Notes</label>
            <textarea value={medNotes} onChange={e => setMedNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Clinical notes on medication review..." />
          </div>
        </div>
      </Section>

      <Section title="Final Outcomes" icon={CheckCircle}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Drug Outcome</p>
            <OutcomeBadge value={finalDrug} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">BAC Outcome</p>
            <OutcomeBadge value={finalBAC} />
          </div>
        </div>
      </Section>

      <button onClick={handleSave} disabled={saving}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`}>
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Lab Result'}
      </button>
    </div>
  );
};

const OutcomeBadge = ({ value }) => {
  if (!value) return <span className="text-sm text-gray-400">—</span>;
  const style = value.includes('Positive') || value.includes('Inconsistent') ? 'bg-red-100 text-red-700'
    : value === 'Negative' ? 'bg-green-100 text-green-700'
    : value.includes('Pending') || value.includes('Consistent') ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600';
  return <span className={`px-2 py-1 rounded text-xs font-medium ${style}`}>{value}</span>;
};

// ─── Documents tab ────────────────────────────────────────────────────────────
const DocsTab = ({ record }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTestAttachments(record.TestID)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setLoading(false));
  }, [record.TestID]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{attachments.length} document{attachments.length !== 1 ? 's' : ''} attached to this test</p>
        <button onClick={() => window.open(`/tests/${record.TestID}`, '_blank')}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Manage in Test Detail <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {attachments.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No documents attached</p>
          <p className="text-xs mt-1">Upload Chain of Custody or lab reports via the Test Detail page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map(a => (
            <div key={a.AttachmentID} className="flex items-center gap-3 bg-white border rounded-lg p-3">
              <FileText className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{a.OriginalName || a.FileName}</p>
                <p className="text-xs text-gray-400">{a.Category || 'Document'} · {fmtDate(a.UploadedAt)}</p>
                {a.Description && <p className="text-xs text-gray-500 truncate">{a.Description}</p>}
              </div>
              <a href={api.getAttachmentDownloadUrl(a.AttachmentID)} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:underline shrink-0">Download</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Timeline tab ─────────────────────────────────────────────────────────────
const TimelineTab = ({ nnid }) => {
  const [notes, setNotes] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, h] = await Promise.all([
        api.getNonNegativeNotes(nnid),
        api.getNonNegativeHistory(nnid),
      ]);
      setNotes(n);
      setHistory(h);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [nnid]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      await api.addNonNegativeNote(nnid, newNote);
      setNewNote('');
      load();
    } catch (err) {
      alert('Failed to add note: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  // Merge notes + history into single timeline sorted newest first
  const timeline = [
    ...notes.map(n => ({ type: 'note', ts: n.CreatedAt, author: n.CreatedByName, text: n.NoteText, id: 'n' + n.NoteID })),
    ...history.map(h => ({ type: 'audit', ts: h.CreatedAt, author: h.UserName, action: h.Action, text: h.Description, id: 'h' + h.AuditID })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return (
    <div className="space-y-3">
      {/* Add note */}
      <div className="flex gap-2">
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
          placeholder="Add a case note..."
          rows={2}
          className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }} />
        <button onClick={addNote} disabled={adding || !newNote.trim()}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm self-start disabled:opacity-40">
          {adding ? '...' : 'Add'}
        </button>
      </div>
      <p className="text-xs text-gray-400">Ctrl+Enter to submit</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : timeline.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No activity recorded yet</div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-3 pl-8">
            {timeline.map(item => (
              <div key={item.id} className="relative">
                <div className={`absolute -left-5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${item.type === 'note' ? 'bg-blue-400' : 'bg-gray-300'}`}>
                  {item.type === 'note' ? <MessageSquare className="w-2 h-2 text-white" /> : <Clock className="w-2 h-2 text-gray-600" />}
                </div>
                <div className={`rounded-lg p-2.5 ${item.type === 'note' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs font-medium ${item.type === 'note' ? 'text-blue-700' : 'text-gray-500'}`}>
                      {item.type === 'note' ? 'Note' : item.action}
                      {item.author ? ` · ${item.author}` : ''}
                    </span>
                    <span className="text-xs text-gray-400" title={fmtDateTime(item.ts)}>
                      {item.ts ? formatDistanceToNow(new Date(item.ts), { addSuffix: true }) : '—'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Manage tab ───────────────────────────────────────────────────────────────
const ManageTab = ({ record, nnid, onSaved }) => {
  const [status, setStatus] = useState(record.Status);
  const [followUp, setFollowUp] = useState(record.FollowUpAction || '');
  const [closureReason, setClosureReason] = useState(record.ClosureReason || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateNonNegativeRecord(nnid, { status, followUpAction: followUp, closureReason });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Case Status" icon={AlertTriangle}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <div className="flex gap-2">
              {['Open', 'In Review', 'Closed'].map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${status === s ? (STATUS_STYLE[s] || 'bg-gray-800 text-white border-gray-800') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">Follow-up Action <HelpIcon text={HELP.nonNeg.followUp} size={11} /></label>
            <select value={followUp} onChange={e => setFollowUp(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">None / Select...</option>
              <option value="Sent to Lab">Sent to Lab</option>
              <option value="Stand Down">Stand Down</option>
              <option value="Disciplinary Meeting">Disciplinary Meeting</option>
              <option value="EAP Referral">EAP Referral</option>
              <option value="Show Cause Notice">Show Cause Notice</option>
              <option value="No Further Action">No Further Action</option>
            </select>
          </div>
          {status === 'Closed' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Closure Reason</label>
              <textarea value={closureReason} onChange={e => setClosureReason(e.target.value)} rows={3}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Reason for closing this case..." />
            </div>
          )}
        </div>
      </Section>

      {record.Status === 'Closed' && record.ClosedDate && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-green-800">Case closed on {fmtDate(record.ClosedDate)}</p>
          {record.ClosureReason && <p className="text-green-700 mt-1">{record.ClosureReason}</p>}
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`}>
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  );
};

// ─── Shared components ────────────────────────────────────────────────────────
const Section = ({ title, icon: Icon, children }) => (
  <div className="bg-white border rounded-xl overflow-hidden">
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b">
      {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

export default NonNegative;
