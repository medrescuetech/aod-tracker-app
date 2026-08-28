import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Download, Loader2, FileText, Calendar, Building2, ChevronDown, ChevronUp, AlertTriangle, FlaskConical, SlidersHorizontal, Search, Filter, X } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { HelpIcon } from '../components/Tooltip';
import { HELP } from '../utils/helpText';

// ── helpers ────────────────────────────────────────────────────────────────────

function quarterBounds(year, q) {
  const starts = ['01-01','04-01','07-01','10-01'];
  const ends   = ['03-31','06-30','09-30','12-31'];
  return { start: `${year}-${starts[q-1]}`, end: `${year}-${ends[q-1]}` };
}

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d + 'T00:00:00'), 'dd/MM/yyyy'); } catch { return d; }
}

const OUTCOME_COLORS = {
  'Negative':              'bg-green-100 text-green-700',
  'Positive':              'bg-red-100 text-red-700',
  'Non-Negative':          'bg-orange-100 text-orange-700',
  'Pending Confirmation':  'bg-amber-100 text-amber-700',
  'Confirmed Positive':    'bg-red-200 text-red-800',
  'Refused':               'bg-purple-100 text-purple-700',
  'Not Tested':            'bg-gray-100 text-gray-500',
};
function outcomeChip(val) {
  const cls = OUTCOME_COLORS[val] || 'bg-gray-100 text-gray-600';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{val || '—'}</span>;
}

const StatBox = ({ label, value, sub, color = 'blue' }) => {
  const colors = {
    blue:   'bg-blue-50   text-blue-700   border-blue-200',
    green:  'bg-green-50  text-green-700  border-green-200',
    amber:  'bg-amber-50  text-amber-700  border-amber-200',
    red:    'bg-red-50    text-red-700    border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray:   'bg-gray-50   text-gray-700   border-gray-200',
  };
  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <p className="text-2xl font-bold">{value ?? 0}</p>
      <p className="text-sm font-medium opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const Reports = () => {
  const { getEmployeeLabel, getContractorLabel } = useApp();
  const employeeLabel  = getEmployeeLabel();
  const contractorLabel = getContractorLabel();

  // Period mode: 'quarter' | 'custom'
  const [periodMode, setPeriodMode] = useState('quarter');
  const [quarterYear, setQuarterYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter]         = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-01'));
  const [customEnd,   setCustomEnd]   = useState(format(new Date(), 'yyyy-MM-dd'));

  // Employer filter
  const [employers, setEmployers]             = useState([]);
  const [selectedEmployers, setSelectedEmployers] = useState([]);
  const [employerOpen, setEmployerOpen]       = useState(false);
  const [catExpanded, setCatExpanded]         = useState({});

  // Report state
  const [loading, setLoading]     = useState(false);
  const [reportData, setReportData] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Active section tabs in output
  const [activeSection, setActiveSection] = useState('summary');

  // Pending report state
  const [pendingData, setPendingData]     = useState(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingTab, setPendingTab]       = useState('pendingLab');

  // DNA report state
  const [dnaData, setDnaData]         = useState(null);
  const [dnaLoading, setDnaLoading]   = useState(false);
  const [dnaSubTab, setDnaSubTab]     = useState('overview');

  // Variation report state
  const [varData, setVarData]         = useState(null);
  const [varLoading, setVarLoading]   = useState(false);
  const [varReason, setVarReason]     = useState('all');

  // Custom query state
  const CQ_DEFAULTS = {
    startDate: format(new Date(), 'yyyy-MM-01'),
    endDate:   format(new Date(), 'yyyy-MM-dd'),
    testTypes: [],
    drugOutcome: '', bacOutcome: '', testStatus: '',
    confirmatoryResult: '', overallResult: '',
    clinicianId: '', workerType: '',
    oralUndertaken: false, bacUndertaken: false, urineUndertaken: false,
    nonNegOnly: false, sampleSentOnly: false, rftOnly: false,
    bacMin: '', bacMax: '',
    search: '',
  };
  const [cqFilters, setCqFilters] = useState(CQ_DEFAULTS);
  const [cqData, setCqData]           = useState(null);
  const [cqLoading, setCqLoading]     = useState(false);
  const [cqExporting, setCqExporting] = useState(false);
  const [testTypes, setTestTypes]     = useState([]);
  const [clinicians, setClinicians]   = useState([]);
  const [cqSort, setCqSort]           = useState({ col: 'TestDate', dir: 'desc' });
  const [cqEmployers, setCqEmployers] = useState([]);  // separate employer filter for CQ

  const ALL_DRUG_OUTCOMES = ['Negative','Non-Negative','Pending Confirmation','Confirmed Positive','Confirmed Negative','Confirmed - Pending Review','Confirmed - Inconsistent'];
  const ALL_BAC_OUTCOMES  = ['Negative','Positive'];
  const ALL_STATUSES      = ['Completed','Pending Lab','DNA','Closed','Action Required','Review Required'];
  const ALL_WORKER_TYPES  = ['SCJV Staff','Contractor'];

  useEffect(() => {
    api.getEmployers().then(data => {
      setEmployers(data);
      setSelectedEmployers(data.map(e => e.EmployerID));
      setCqEmployers(data.map(e => e.EmployerID));
      api.getPendingReport(data.map(e => e.EmployerID)).then(setPendingData).catch(() => {});
    }).catch(() => {});
    fetch('/api/test-types').then(r => r.json()).then(setTestTypes).catch(() => {});
    fetch('/api/clinicians').then(r => r.json()).then(setClinicians).catch(() => {});
  }, []);

  // Grouped employers by Category
  const grouped = useMemo(() => {
    const g = {};
    for (const e of employers) {
      const cat = e.Category || 'Other';
      if (!g[cat]) g[cat] = [];
      g[cat].push(e);
    }
    return g;
  }, [employers]);

  const toggleEmployer = (id) =>
    setSelectedEmployers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleCategory = (cat) => {
    const ids = grouped[cat].map(e => e.EmployerID);
    const allOn = ids.every(id => selectedEmployers.includes(id));
    setSelectedEmployers(prev => allOn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  const resolvedDates = useMemo(() => {
    if (periodMode === 'quarter') return quarterBounds(quarterYear, quarter);
    return { start: customStart, end: customEnd };
  }, [periodMode, quarterYear, quarter, customStart, customEnd]);

  const generate = async () => {
    if (selectedEmployers.length === 0) { alert('Select at least one company.'); return; }
    setLoading(true);
    setReportData(null);
    setActiveSection('summary');
    try {
      const data = await api.getAnalyticsReport(resolvedDates.start, resolvedDates.end, selectedEmployers);
      setReportData(data);
    } catch (err) {
      alert('Failed to generate report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await api.downloadAnalyticsExcel(resolvedDates.start, resolvedDates.end, selectedEmployers);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const periodLabel = periodMode === 'quarter'
    ? `Q${quarter} ${quarterYear} (${resolvedDates.start} → ${resolvedDates.end})`
    : `${resolvedDates.start} → ${resolvedDates.end}`;

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const pendingTotal = pendingData
    ? pendingData.summary.pendingLab + pendingData.summary.actionRequired +
      pendingData.summary.reviewRequired + pendingData.summary.openNonNeg +
      pendingData.summary.overdueScheduled + pendingData.summary.medicationReview
    : null;

  const SECTIONS = [
    { id: 'pending',   label: pendingTotal !== null ? `⚠ Pending (${pendingTotal})` : '⚠ Pending' },
    { id: 'summary',   label: 'Summary'         },
    { id: 'byType',    label: 'By Test Type'     },
    { id: 'outcomes',  label: 'Outcomes'         },
    { id: 'employers', label: 'By Company'       },
    { id: 'nonneg',    label: `Non-Negatives${reportData?.nonNegatives?.length ? ` (${reportData.nonNegatives.length})` : ''}` },
    { id: 'dna',       label: `Did Not Attend${reportData?.dnaCount ? ` (${reportData.dnaCount})` : ''}` },
    { id: 'dna-report', label: 'Non-Attendance' },
    { id: 'variation', label: 'Variation Report' },
    { id: 'custom',    label: 'Custom Query'     },
  ];

  const loadDNA = async () => {
    setDnaLoading(true);
    try { setDnaData(await api.getDNAReport(resolvedDates.start, resolvedDates.end, selectedEmployers)); }
    catch (err) { alert('DNA report failed: ' + err.message); }
    finally { setDnaLoading(false); }
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try { setPendingData(await api.getPendingReport(selectedEmployers)); }
    catch (err) { alert('Pending report failed: ' + err.message); }
    finally { setPendingLoading(false); }
  };

  const runVariation = async () => {
    setVarLoading(true); setVarData(null);
    try {
      const data = await api.getVariationReport(resolvedDates.start, resolvedDates.end, selectedEmployers);
      setVarData(data);
    } catch (err) { alert('Variation report failed: ' + err.message); }
    finally { setVarLoading(false); }
  };

  const buildCqParams = (f = cqFilters) => ({
    startDate: f.startDate, endDate: f.endDate,
    ...(cqEmployers.length < employers.length && { employers: cqEmployers.join(',') }),
    ...(f.testTypes.length       && { testTypes: f.testTypes.join(',') }),
    ...(f.drugOutcome            && { drugOutcome: f.drugOutcome }),
    ...(f.bacOutcome             && { bacOutcome: f.bacOutcome }),
    ...(f.testStatus             && { testStatus: f.testStatus }),
    ...(f.confirmatoryResult     && { confirmatoryResult: f.confirmatoryResult }),
    ...(f.overallResult          && { overallResult: f.overallResult }),
    ...(f.clinicianId            && { clinicianId: f.clinicianId }),
    ...(f.workerType             && { workerType: f.workerType }),
    ...(f.bacMin                 && { bacMin: f.bacMin }),
    ...(f.bacMax                 && { bacMax: f.bacMax }),
    ...(f.oralUndertaken         && { oralUndertaken: '1' }),
    ...(f.bacUndertaken          && { bacUndertaken: '1' }),
    ...(f.urineUndertaken        && { urineUndertaken: '1' }),
    ...(f.nonNegOnly             && { nonNegOnly: '1' }),
    ...(f.sampleSentOnly         && { sampleSentOnly: '1' }),
    ...(f.rftOnly                && { rftOnly: '1' }),
    ...(f.search                 && { search: f.search }),
  });

  const runCustomQuery = async () => {
    setCqLoading(true); setCqData(null);
    try { setCqData(await api.getCustomQuery(buildCqParams())); }
    catch (err) { alert('Custom query failed: ' + err.message); }
    finally { setCqLoading(false); }
  };

  const exportCQ = async () => {
    setCqExporting(true);
    try { await api.downloadCustomQueryExcel(buildCqParams()); }
    catch (err) { alert('Export failed: ' + err.message); }
    finally { setCqExporting(false); }
  };

  const toggleCqType = (code) =>
    setCqFilters(f => ({
      ...f,
      testTypes: f.testTypes.includes(code) ? f.testTypes.filter(c => c !== code) : [...f.testTypes, code]
    }));

  const toggleCqEmployer = (id) =>
    setCqEmployers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const sortedCqRows = useMemo(() => {
    if (!cqData?.rows) return [];
    const { col, dir } = cqSort;
    return [...cqData.rows].sort((a, b) => {
      const av = a[col] ?? '';
      const bv = b[col] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [cqData, cqSort]);

  const handleCqSort = (col) =>
    setCqSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

  // Active filter tags for display
  const activeCqTags = useMemo(() => {
    const f = cqFilters;
    const tags = [];
    if (f.drugOutcome)        tags.push({ label: `Drug: ${f.drugOutcome}`,       key: 'drugOutcome' });
    if (f.bacOutcome)         tags.push({ label: `BAC: ${f.bacOutcome}`,          key: 'bacOutcome' });
    if (f.testStatus)         tags.push({ label: `Status: ${f.testStatus}`,       key: 'testStatus' });
    if (f.confirmatoryResult) tags.push({ label: `Conf: ${f.confirmatoryResult}`, key: 'confirmatoryResult' });
    if (f.overallResult)      tags.push({ label: `Overall: ${f.overallResult}`,   key: 'overallResult' });
    if (f.workerType)         tags.push({ label: `Worker: ${f.workerType}`,       key: 'workerType' });
    if (f.clinicianId) {
      const cl = clinicians.find(c => String(c.ClinicianID) === String(f.clinicianId));
      tags.push({ label: `Clinician: ${cl?.Name ?? f.clinicianId}`, key: 'clinicianId' });
    }
    if (f.bacMin || f.bacMax) tags.push({ label: `BAC ${f.bacMin||'0'}–${f.bacMax||'∞'}`, key: 'bacRange', clear: () => setCqFilters(p => ({...p, bacMin:'', bacMax:''})) });
    if (f.oralUndertaken)   tags.push({ label: 'Oral undertaken',    key: 'oralUndertaken' });
    if (f.bacUndertaken)    tags.push({ label: 'BAC undertaken',     key: 'bacUndertaken' });
    if (f.urineUndertaken)  tags.push({ label: 'Urine undertaken',   key: 'urineUndertaken' });
    if (f.nonNegOnly)       tags.push({ label: 'Non-Neg only',       key: 'nonNegOnly' });
    if (f.sampleSentOnly)   tags.push({ label: 'Lab sent',           key: 'sampleSentOnly' });
    if (f.rftOnly)          tags.push({ label: 'RFT only',           key: 'rftOnly' });
    if (f.testTypes.length) tags.push({ label: `Types: ${f.testTypes.join(', ')}`, key: 'testTypes', clear: () => setCqFilters(p => ({...p, testTypes:[]})) });
    return tags;
  }, [cqFilters, clinicians]);
  
  return (
    <div className="space-y-5">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">AOD Analytics Report</h1>
        <p className="text-gray-500 text-sm">Select a period and companies, then generate your report.</p>
        <p className="text-xs text-gray-400 mt-1">Hover over <span className="inline-flex items-center gap-0.5 text-blue-500">ⓘ</span> icons throughout the app for contextual help.</p>
      </div>

      {/* ── Period selector ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Calendar className="w-4 h-4" /> Report Period <HelpIcon text={HELP.reports.period} /></h2>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {['quarter','custom'].map(m => (
            <button key={m} onClick={() => setPeriodMode(m)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                periodMode === m
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {m === 'quarter' ? 'Preset Quarter' : 'Custom Range'}
            </button>
          ))}
        </div>

        {periodMode === 'quarter' ? (
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
              <select value={quarterYear} onChange={e => setQuarterYear(+e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quarter</label>
              <select value={quarter} onChange={e => setQuarter(+e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value={1}>Q1 — Jan to Mar</option>
                <option value={2}>Q2 — Apr to Jun</option>
                <option value={3}>Q3 — Jul to Sep</option>
                <option value={4}>Q4 — Oct to Dec</option>
              </select>
            </div>
            <p className="text-sm text-gray-500 self-end pb-2">
              {resolvedDates.start} → {resolvedDates.end}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* ── Company filter ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button onClick={() => setEmployerOpen(o => !o)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl">
          <span className="font-semibold text-gray-800 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Companies
            <span className="text-sm font-normal text-gray-500">
              ({selectedEmployers.length} of {employers.length} selected)
            </span>
            <HelpIcon text={HELP.reports.companies} />
          </span>
          {employerOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {employerOpen && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Global select/deselect */}
            <div className="flex gap-2">
              <button onClick={() => setSelectedEmployers(employers.map(e => e.EmployerID))}
                className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">All</button>
              <button onClick={() => setSelectedEmployers([])}
                className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">None</button>
            </div>

            {/* Per-category groups */}
            <div className="grid md:grid-cols-2 gap-3">
              {Object.keys(grouped).sort().map(cat => {
                const catEmps = grouped[cat];
                const allOn = catEmps.every(e => selectedEmployers.includes(e.EmployerID));
                const someOn = catEmps.some(e => selectedEmployers.includes(e.EmployerID));
                return (
                  <div key={cat} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => setCatExpanded(p => ({ ...p, [cat]: !p[cat] }))}
                        className="flex items-center gap-1.5 font-medium text-gray-700 text-sm">
                        {catExpanded[cat] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {cat} <span className="text-gray-400 font-normal">({catEmps.length})</span>
                      </button>
                      <div className="flex gap-1">
                        <button onClick={() => toggleCategory(cat)}
                          className={`px-2 py-0.5 text-xs rounded ${allOn ? 'bg-blue-100 text-blue-700' : someOn ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                          {allOn ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                    </div>
                    {catExpanded[cat] && (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {catEmps.map(emp => (
                          <label key={emp.EmployerID}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                            <input type="checkbox"
                              checked={selectedEmployers.includes(emp.EmployerID)}
                              onChange={() => toggleEmployer(emp.EmployerID)}
                              className="accent-blue-600" />
                            {emp.CompanyName}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Generate button ──────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button onClick={generate} disabled={loading || selectedEmployers.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          Generate Report
        </button>
        <HelpIcon text={HELP.reports.generateReport} position="right" />
        {reportData && (
          <button onClick={exportExcel} disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export to Excel
          </button>
        )}
      </div>

      {/* ── Report output ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
          <p className="text-gray-500">Generating report…</p>
        </div>
      )}

      {reportData && !loading && (() => {
        const d = reportData;
        const t = d.totals || {};
        return (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {periodMode === 'quarter' ? `Q${quarter} ${quarterYear}` : 'Custom Period'}
                </p>
                <p className="text-xs text-gray-400">{periodLabel}</p>
              </div>
              {/* Section tabs */}
              <div className="flex gap-1 flex-wrap justify-end">
                {SECTIONS.map(s => (
                  <button key={s.id} onClick={() => setActiveSection(s.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                      activeSection === s.id
                        ? s.id === 'pending' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                        : s.id === 'pending' && pendingTotal
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5">

              {/* ── Pending Reports ── */}
              {activeSection === 'pending' && (() => {
                const s = pendingData?.summary;

                const PTABS = [
                  { key: 'pendingLab',       label: 'Pending Lab',         count: s?.pendingLab,       color: 'amber',  tip: HELP.reports.pendingLab       },
                  { key: 'actionRequired',   label: 'Action Required',     count: s?.actionRequired,   color: 'red',    tip: HELP.reports.actionRequired   },
                  { key: 'reviewRequired',   label: 'Review Required',     count: s?.reviewRequired,   color: 'orange', tip: HELP.reports.reviewRequired   },
                  { key: 'openNonNeg',       label: 'Open Non-Negatives',  count: s?.openNonNeg,       color: 'rose',   tip: HELP.reports.openNonNeg       },
                  { key: 'overdueScheduled', label: 'Overdue Scheduled',   count: s?.overdueScheduled, color: 'purple', tip: HELP.reports.overdueScheduled },
                  { key: 'medicationReview', label: 'Medication Review',   count: s?.medicationReview, color: 'blue',   tip: HELP.reports.medicationReview },
                ];

                const tabColor = {
                  amber:  { active: 'bg-amber-500 text-white border-amber-500',  badge: 'bg-amber-100 text-amber-700' },
                  red:    { active: 'bg-red-600 text-white border-red-600',       badge: 'bg-red-100 text-red-700' },
                  orange: { active: 'bg-orange-500 text-white border-orange-500', badge: 'bg-orange-100 text-orange-700' },
                  rose:   { active: 'bg-rose-600 text-white border-rose-600',     badge: 'bg-rose-100 text-rose-700' },
                  purple: { active: 'bg-purple-600 text-white border-purple-600', badge: 'bg-purple-100 text-purple-700' },
                  blue:   { active: 'bg-blue-600 text-white border-blue-600',     badge: 'bg-blue-100 text-blue-700' },
                };

                const TestRow = ({ row, extra }) => (
                  <tr className={`hover:bg-gray-50 ${row.IsNonNegative ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{fmtDate(row.TestDate)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.TestNumber}</td>
                    <td className="px-3 py-2 text-sm font-medium">{row.FullName}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{row.CompanyName}</td>
                    <td className="px-3 py-2 text-xs">{row.TestTypeName}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{row.ClinicianName || '—'}</td>
                    <td className="px-3 py-2">{outcomeChip(row.FinalDrugOutcome)}</td>
                    <td className="px-3 py-2">{outcomeChip(row.FinalBACOutcome)}</td>
                    {extra}
                  </tr>
                );

                const rows = pendingData?.[pendingTab] ?? [];

                return (
                  <div className="space-y-4">
                    {/* Header + refresh */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">Pending Items — All Companies <HelpIcon text={HELP.reports.pending} /></h3>
                        <p className="text-xs text-gray-400 mt-0.5">Tests and cases that require follow-up action</p>
                      </div>
                      <button onClick={loadPending} disabled={pendingLoading}
                        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        {pendingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↻'} Refresh
                      </button>
                    </div>

                    {pendingLoading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" /></div>}

                    {pendingData && !pendingLoading && (
                      <>
                        {/* Summary tiles */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                          {PTABS.map(pt => (
                            <button key={pt.key} onClick={() => setPendingTab(pt.key)}
                              className={`rounded-xl border p-3 text-left transition-all ${
                                pendingTab === pt.key
                                  ? tabColor[pt.color].active
                                  : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}>
                              <div className={`text-2xl font-bold ${pendingTab === pt.key ? '' : 'text-gray-800'}`}>
                                {pt.count ?? 0}
                              </div>
                              <div className={`text-xs mt-0.5 flex items-center gap-1 ${pendingTab === pt.key ? 'opacity-80' : 'text-gray-500'}`}>
                                {pt.label}
                                <span onClick={e => e.stopPropagation()}><HelpIcon text={pt.tip} position="bottom" size={11} /></span>
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Table */}
                        {rows.length === 0
                          ? <div className="py-6 text-center text-sm text-green-600">✓ Nothing pending in this category.</div>
                          : (
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-left border-b border-gray-200">
                                  {pendingTab === 'overdueScheduled' ? (
                                    <>
                                      <th className="px-3 py-2 font-medium text-gray-600">Scheduled Date</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Person</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Company</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Test Type</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Clinician</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Days Overdue</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Status</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="px-3 py-2 font-medium text-gray-600">Date</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Test #</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Person</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Company</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Type</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Clinician</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">Drug</th>
                                      <th className="px-3 py-2 font-medium text-gray-600">BAC</th>
                                      {pendingTab === 'pendingLab'     && <th className="px-3 py-2 font-medium text-gray-600">Lab Ref</th>}
                                      {pendingTab === 'pendingLab'     && <th className="px-3 py-2 font-medium text-gray-600">Sent Date</th>}
                                      {pendingTab === 'openNonNeg'     && <th className="px-3 py-2 font-medium text-gray-600">Case Status</th>}
                                      {pendingTab === 'openNonNeg'     && <th className="px-3 py-2 font-medium text-gray-600">Follow-Up</th>}
                                      {pendingTab === 'medicationReview' && <th className="px-3 py-2 font-medium text-gray-600">Medications</th>}
                                      {pendingTab === 'medicationReview' && <th className="px-3 py-2 font-medium text-gray-600">Review Status</th>}
                                      <th className="px-3 py-2 font-medium text-gray-600">Test Status</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {pendingTab === 'overdueScheduled'
                                  ? rows.map(row => (
                                    <tr key={row.ScheduleID} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 whitespace-nowrap text-sm">{fmtDate(row.ScheduledDate)}</td>
                                      <td className="px-3 py-2 text-sm font-medium">{row.FullName}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{row.CompanyName}</td>
                                      <td className="px-3 py-2 text-xs">{row.TestTypeName}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{row.ClinicianName || '—'}</td>
                                      <td className="px-3 py-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                          row.DaysOverdue > 14 ? 'bg-red-100 text-red-700' :
                                          row.DaysOverdue > 7  ? 'bg-orange-100 text-orange-700' :
                                          'bg-amber-100 text-amber-700'
                                        }`}>{row.DaysOverdue}d</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{row.ScheduleStatus}</td>
                                    </tr>
                                  ))
                                  : rows.map(row => (
                                    <TestRow key={row.TestID} row={row} extra={<>
                                      {pendingTab === 'pendingLab' && <>
                                        <td className="px-3 py-2 text-xs font-mono text-gray-500">{row.LabReference || '—'}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(row.LabSentDate)}</td>
                                      </>}
                                      {pendingTab === 'openNonNeg' && <>
                                        <td className="px-3 py-2">
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                            row.CaseStatus === 'Open' ? 'bg-amber-100 text-amber-700' :
                                            row.CaseStatus === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-600'
                                          }`}>{row.CaseStatus || 'No Record'}</span>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">{row.FollowUpAction || '—'}</td>
                                      </>}
                                      {pendingTab === 'medicationReview' && <>
                                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">{row.DeclaredMedications || '—'}</td>
                                        <td className="px-3 py-2">
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{row.MedicationReviewStatus}</span>
                                        </td>
                                      </>}
                                      <td className="px-3 py-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                          row.TestStatus === 'Action Required' ? 'bg-red-100 text-red-700' :
                                          row.TestStatus === 'Review Required' ? 'bg-orange-100 text-orange-700' :
                                          row.TestStatus === 'Pending Lab'     ? 'bg-amber-100 text-amber-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>{row.TestStatus}</span>
                                      </td>
                                    </>} />
                                  ))
                                }
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ── DNA / Non-Attendance Report ── */}
              {activeSection === 'dna-report' && (() => {
                const DNA_SUBTABS = [
                  { key: 'overview',  label: 'Overview'         },
                  { key: 'trend',     label: 'Monthly Trend'    },
                  { key: 'companies', label: 'By Company'       },
                  { key: 'repeat',    label: `Repeat (${dnaData?.repeatOffenders?.length ?? 0})` },
                  { key: 'detail',    label: 'Full Detail'      },
                ];
                const maxBar = dnaData?.byMonth?.length
                  ? Math.max(...dnaData.byMonth.map(m => m.Total), 1)
                  : 1;
                const maxCo  = dnaData?.byCompany?.length
                  ? Math.max(...dnaData.byCompany.map(c => c.Count), 1)
                  : 1;

                return (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">Non-Attendance (DNA) Report — {periodLabel} <HelpIcon text={HELP.reports.dnaReport} /></h3>
                        <p className="text-xs text-gray-400 mt-0.5">Workers selected for testing who did not attend</p>
                      </div>
                      <button onClick={loadDNA} disabled={dnaLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">
                        {dnaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        Run DNA Report
                      </button>
                    </div>

                    {!dnaData && !dnaLoading && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                        <p className="text-purple-700 text-sm">Click "Run DNA Report" to analyse non-attendance for the selected period and companies.</p>
                      </div>
                    )}

                    {dnaLoading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-500" /></div>}

                    {dnaData && !dnaLoading && (
                      <div className="space-y-4">
                        {/* Sub-tabs */}
                        <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-2">
                          {DNA_SUBTABS.map(st => (
                            <button key={st.key} onClick={() => setDnaSubTab(st.key)}
                              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                                dnaSubTab === st.key
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}>{st.label}</button>
                          ))}
                        </div>

                        {/* ── Overview ── */}
                        {dnaSubTab === 'overview' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <StatBox label="Total DNA"         value={dnaData.totals?.Total ?? 0}          color="purple" />
                              <StatBox label="Unique People"     value={dnaData.totals?.UniquePersons ?? 0}  color="gray"   />
                              <StatBox label="SCJV Staff"        value={dnaData.totals?.SCJVCount ?? 0}      color="blue"   />
                              <StatBox label="Contractors"       value={dnaData.totals?.ContractorCount ?? 0} color="amber" />
                            </div>

                            {/* Top offending companies */}
                            {dnaData.byCompany?.length > 0 && (
                              <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Top Companies by DNA Count</h4>
                                <div className="space-y-2">
                                  {dnaData.byCompany.slice(0, 8).map(co => (
                                    <div key={co.CompanyName} className="flex items-center gap-2">
                                      <div className="w-36 text-xs text-gray-600 truncate shrink-0">{co.CompanyName || 'Unknown'}</div>
                                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                                        <div className="h-4 rounded-full bg-purple-400 transition-all"
                                          style={{ width: `${(co.Count / maxCo) * 100}%` }} />
                                      </div>
                                      <div className="w-8 text-xs font-semibold text-right text-gray-700">{co.Count}</div>
                                      <div className="w-16 text-xs text-gray-400 text-right">{co.Category}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Repeat offenders summary */}
                            {dnaData.repeatOffenders?.length > 0 && (
                              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <h4 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">
                                  ⚠ Repeat Non-Attendees ({dnaData.repeatOffenders.length} persons with 2+ DNAs)
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {dnaData.repeatOffenders.slice(0, 10).map(r => (
                                    <span key={r.FullName}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-red-200 rounded-full text-xs text-red-700">
                                      <span className="font-bold">{r.DNACount}×</span> {r.FullName}
                                      <span className="text-red-400">({r.CompanyName})</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Monthly Trend ── */}
                        {dnaSubTab === 'trend' && (
                          <div className="space-y-3">
                            {dnaData.byMonth?.length === 0
                              ? <p className="text-gray-400 text-sm">No monthly data available for this period.</p>
                              : (
                              <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <h4 className="text-xs font-semibold text-gray-600 mb-4 uppercase tracking-wide">DNA by Month</h4>
                                <div className="space-y-3">
                                  {dnaData.byMonth.map(m => (
                                    <div key={m.Month} className="space-y-1">
                                      <div className="flex justify-between text-xs text-gray-500">
                                        <span className="font-medium text-gray-700">{m.Month}</span>
                                        <span>{m.Total} total · {m.SCJV ?? 0} SCJV · {m.Contractor ?? 0} Contractor</span>
                                      </div>
                                      <div className="flex gap-0.5 h-5">
                                        {/* SCJV bar */}
                                        <div className="bg-blue-400 rounded-l h-full transition-all"
                                          style={{ width: `${((m.SCJV ?? 0) / maxBar) * 100}%`, minWidth: (m.SCJV ?? 0) > 0 ? '4px' : '0' }}
                                          title={`SCJV: ${m.SCJV ?? 0}`} />
                                        {/* Contractor bar */}
                                        <div className="bg-purple-400 rounded-r h-full transition-all"
                                          style={{ width: `${((m.Contractor ?? 0) / maxBar) * 100}%`, minWidth: (m.Contractor ?? 0) > 0 ? '4px' : '0' }}
                                          title={`Contractor: ${m.Contractor ?? 0}`} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-4 mt-4 text-xs text-gray-500">
                                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> SCJV Staff</span>
                                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-400 inline-block" /> Contractor</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── By Company ── */}
                        {dnaSubTab === 'companies' && (
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-purple-50 text-left">
                                  <th className="px-3 py-2 font-medium text-purple-800">Company</th>
                                  <th className="px-3 py-2 font-medium text-purple-800">Category</th>
                                  <th className="px-3 py-2 font-medium text-purple-800">DNA Count</th>
                                  <th className="px-3 py-2 font-medium text-purple-800">Unique People</th>
                                  <th className="px-3 py-2 font-medium text-purple-800">Avg per Person</th>
                                  <th className="px-3 py-2 font-medium text-purple-800 w-40">Bar</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {dnaData.byCompany.map(co => (
                                  <tr key={co.CompanyName} className="hover:bg-purple-50/30">
                                    <td className="px-3 py-2 font-medium">{co.CompanyName || 'Unknown'}</td>
                                    <td className="px-3 py-2 text-xs text-gray-500">{co.Category}</td>
                                    <td className="px-3 py-2 font-semibold text-purple-700">{co.Count}</td>
                                    <td className="px-3 py-2 text-gray-600">{co.UniquePersons}</td>
                                    <td className="px-3 py-2 text-gray-500">{(co.Count / co.UniquePersons).toFixed(1)}</td>
                                    <td className="px-3 py-2">
                                      <div className="bg-gray-100 rounded-full h-3 w-full">
                                        <div className="bg-purple-400 h-3 rounded-full"
                                          style={{ width: `${(co.Count / maxCo) * 100}%` }} />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* ── Repeat Offenders ── */}
                        {dnaSubTab === 'repeat' && (
                          <div className="space-y-3">
                            {dnaData.repeatOffenders?.length === 0
                              ? <p className="text-green-600 text-sm py-4">✓ No repeat non-attendees in this period.</p>
                              : (
                              <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-red-50 text-left">
                                      <th className="px-3 py-2 font-medium text-red-800">Person</th>
                                      <th className="px-3 py-2 font-medium text-red-800">Company</th>
                                      <th className="px-3 py-2 font-medium text-red-800">Category</th>
                                      <th className="px-3 py-2 font-medium text-red-800">DNA Count</th>
                                      <th className="px-3 py-2 font-medium text-red-800">First DNA</th>
                                      <th className="px-3 py-2 font-medium text-red-800">Last DNA</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {dnaData.repeatOffenders.map((r, i) => (
                                      <tr key={i} className="hover:bg-red-50/30">
                                        <td className="px-3 py-2 font-medium">{r.FullName}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{r.CompanyName}</td>
                                        <td className="px-3 py-2 text-xs text-gray-400">{r.Category}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                            r.DNACount >= 4 ? 'bg-red-100 text-red-700' :
                                            r.DNACount >= 3 ? 'bg-orange-100 text-orange-700' :
                                            'bg-amber-100 text-amber-700'
                                          }`}>{r.DNACount}×</span>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.FirstDNA)}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.LastDNA)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Full Detail ── */}
                        {dnaSubTab === 'detail' && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500">{dnaData.detail?.length ?? 0} records</p>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-purple-50 text-left">
                                    <th className="px-3 py-2 font-medium text-purple-800">Date</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Test #</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Person</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Company</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Category</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Clinician</th>
                                    <th className="px-3 py-2 font-medium text-purple-800">Notes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {dnaData.detail?.map(row => (
                                    <tr key={row.TestID} className="hover:bg-purple-50/20">
                                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.TestDate)}</td>
                                      <td className="px-3 py-2 font-mono text-xs">{row.TestNumber}</td>
                                      <td className="px-3 py-2 font-medium">{row.FullName}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{row.CompanyName}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{row.WorkerType}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{row.ClinicianName || '—'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400 max-w-[200px] truncate" title={row.Notes}>{row.Notes || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Variation Report ── */}
              {activeSection === 'variation' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">Variation Report — {periodLabel}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Tests that don't fit standard categories due to unusual combinations or data inconsistencies</p>
                    </div>
                    <button onClick={runVariation} disabled={varLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm">
                      {varLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                      Run Variation Check
                    </button>
                  </div>

                  {!varData && !varLoading && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                      <p className="text-orange-700 text-sm">Click "Run Variation Check" to find tests with unusual or inconsistent data for the selected period and companies.</p>
                    </div>
                  )}

                  {varLoading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>}

                  {varData && (
                    <div className="space-y-4">
                      {/* Breakdown chips */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'all',              label: `All (${varData.total})` },
                          { key: 'dnaWithResults',   label: `DNA + results (${varData.breakdown.dnaWithResults})` },
                          { key: 'noUndertakings',   label: `No undertakings (${varData.breakdown.noUndertakings})` },
                          { key: 'missingNonNegFlag',label: `Missing flag (${varData.breakdown.missingNonNegFlag})` },
                          { key: 'bacMismatch',      label: `BAC mismatch (${varData.breakdown.bacMismatch})` },
                          { key: 'labNoResult',      label: `Lab no result (${varData.breakdown.labNoResult})` },
                          { key: 'oralMismatch',     label: `Oral mismatch (${varData.breakdown.oralMismatch})` },
                        ].map(({ key, label }) => (
                          <button key={key} onClick={() => setVarReason(key)}
                            className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${
                              varReason === key
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}>{label}</button>
                        ))}
                      </div>

                      {varData.total === 0
                        ? <p className="text-green-600 text-sm py-4">✓ No variation tests found for this period.</p>
                        : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-orange-50 text-left">
                                <th className="px-3 py-2 font-medium text-orange-800">Date</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Test #</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Person</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Company</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Type</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Drug Outcome</th>
                                <th className="px-3 py-2 font-medium text-orange-800">BAC Outcome</th>
                                <th className="px-3 py-2 font-medium text-orange-800">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {varData.tests
                                .filter(r => varReason === 'all' || r.VariationReason?.toLowerCase().includes(
                                  varReason === 'dnaWithResults'    ? 'dna' :
                                  varReason === 'noUndertakings'    ? 'undertaking' :
                                  varReason === 'missingNonNegFlag' ? 'flag' :
                                  varReason === 'bacMismatch'       ? 'bac mismatch' :
                                  varReason === 'labNoResult'       ? 'lab' :
                                  varReason === 'oralMismatch'      ? 'oral' : ''
                                ))
                                .map(row => (
                                <tr key={row.TestID} className="hover:bg-orange-50/30">
                                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.TestDate)}</td>
                                  <td className="px-3 py-2 font-mono text-xs">{row.TestNumber}</td>
                                  <td className="px-3 py-2 font-medium">{row.FullName}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{row.CompanyName}</td>
                                  <td className="px-3 py-2 text-xs">{row.TestTypeName}</td>
                                  <td className="px-3 py-2">{outcomeChip(row.FinalDrugOutcome)}</td>
                                  <td className="px-3 py-2">{outcomeChip(row.FinalBACOutcome)}</td>
                                  <td className="px-3 py-2">
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{row.VariationReason}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Custom Query ── */}
              {activeSection === 'custom' && (() => {
                const SortTh = ({ col, label }) => (
                  <th onClick={() => handleCqSort(col)}
                    className="px-3 py-2 font-medium text-blue-800 cursor-pointer select-none whitespace-nowrap hover:bg-blue-100">
                    {label}{cqSort.col === col ? (cqSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                );
                return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">Custom Query <HelpIcon text={HELP.reports.customQuery} /></h3>
                      <p className="text-xs text-gray-400 mt-0.5">Filter by any combination of criteria — like Excel column filters</p>
                    </div>
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {[
                        { label: 'Non-Negatives', set: { nonNegOnly: true } },
                        { label: 'Positive BAC',  set: { bacOutcome: 'Positive' } },
                        { label: 'Pending Lab',   set: { testStatus: 'Pending Lab' } },
                        { label: 'RFT',           set: { rftOnly: true } },
                        { label: 'For Cause',     set: { testTypes: ['CAU'] } },
                        { label: 'Action Req.',   set: { testStatus: 'Action Required' } },
                      ].map(p => (
                        <button key={p.label}
                          onClick={() => setCqFilters(f => ({ ...CQ_DEFAULTS, startDate: f.startDate, endDate: f.endDate, ...p.set }))}
                          className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 font-medium">
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Filter panel ── */}
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">

                    {/* Row 1: Date + Search */}
                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <input type="date" value={cqFilters.startDate}
                          onChange={e => setCqFilters(f => ({ ...f, startDate: e.target.value }))}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                        <input type="date" value={cqFilters.endDate}
                          onChange={e => setCqFilters(f => ({ ...f, endDate: e.target.value }))}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Search (name / test # / company / clinician)</label>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                          <input type="text" value={cqFilters.search} placeholder="Search…"
                            onChange={e => setCqFilters(f => ({ ...f, search: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && runCustomQuery()}
                            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-full" />
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Test types */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Test Type <span className="text-gray-400 font-normal">(blank = all)</span>
                        {cqFilters.testTypes.length > 0 && (
                          <button onClick={() => setCqFilters(f => ({...f, testTypes:[]}))}
                            className="ml-2 text-red-400 hover:text-red-600">✕ clear</button>
                        )}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {(testTypes.length ? testTypes : [
                          {Code:'PRE',Name:'Pre-Employment'},{Code:'RND',Name:'Random'},
                          {Code:'CAU',Name:'For Cause'},{Code:'INC',Name:'Post Incident'},
                          {Code:'PA',Name:'Port Authority'},{Code:'BLK',Name:'Blanket'},{Code:'DNA',Name:'Did Not Attend'}
                        ]).map(tt => (
                          <label key={tt.Code} className={`flex items-center gap-1.5 text-sm cursor-pointer px-2.5 py-1 rounded-lg border transition-colors ${
                            cqFilters.testTypes.includes(tt.Code)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}>
                            <input type="checkbox" className="hidden"
                              checked={cqFilters.testTypes.includes(tt.Code)}
                              onChange={() => toggleCqType(tt.Code)} />
                            {tt.Name}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Row 3: Outcome + Status dropdowns */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Drug/Oral Outcome</label>
                        <select value={cqFilters.drugOutcome}
                          onChange={e => setCqFilters(f => ({ ...f, drugOutcome: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          {ALL_DRUG_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">BAC Outcome</label>
                        <select value={cqFilters.bacOutcome}
                          onChange={e => setCqFilters(f => ({ ...f, bacOutcome: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          {ALL_BAC_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Test Status</label>
                        <select value={cqFilters.testStatus}
                          onChange={e => setCqFilters(f => ({ ...f, testStatus: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Confirmatory Result</label>
                        <select value={cqFilters.confirmatoryResult}
                          onChange={e => setCqFilters(f => ({ ...f, confirmatoryResult: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          <option>Confirmed Positive</option>
                          <option>Confirmed Negative</option>
                          <option>Pending</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Worker Type</label>
                        <select value={cqFilters.workerType}
                          onChange={e => setCqFilters(f => ({ ...f, workerType: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          {ALL_WORKER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Row 4: Clinician + BAC range */}
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="min-w-[180px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Clinician</label>
                        <select value={cqFilters.clinicianId}
                          onChange={e => setCqFilters(f => ({ ...f, clinicianId: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">— Any —</option>
                          {clinicians.map(c => <option key={c.ClinicianID} value={c.ClinicianID}>{c.Name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">BAC ≥</label>
                        <input type="number" step="0.001" min="0" max="1" value={cqFilters.bacMin}
                          onChange={e => setCqFilters(f => ({ ...f, bacMin: e.target.value }))}
                          placeholder="0.000"
                          className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">BAC ≤</label>
                        <input type="number" step="0.001" min="0" max="1" value={cqFilters.bacMax}
                          onChange={e => setCqFilters(f => ({ ...f, bacMax: e.target.value }))}
                          placeholder="1.000"
                          className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                      </div>
                    </div>

                    {/* Row 5: Company selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-gray-500">
                          Companies <span className="text-gray-400 font-normal">({cqEmployers.length} of {employers.length} selected)</span>
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => setCqEmployers(employers.map(e => e.EmployerID))}
                            className="text-xs text-blue-600 hover:underline">All</button>
                          <button onClick={() => setCqEmployers([])}
                            className="text-xs text-gray-400 hover:underline">None</button>
                        </div>
                      </div>
                      <div className="max-h-32 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-1 border border-gray-200 rounded-lg p-2 bg-white">
                        {employers.map(emp => (
                          <label key={emp.EmployerID} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                            <input type="checkbox"
                              checked={cqEmployers.includes(emp.EmployerID)}
                              onChange={() => toggleCqEmployer(emp.EmployerID)}
                              className="accent-blue-600" />
                            <span className="truncate">{emp.CompanyName}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Row 6: Boolean toggles */}
                    <div className="flex flex-wrap gap-3">
                      {[
                        { key: 'oralUndertaken',  label: 'Oral' },
                        { key: 'bacUndertaken',   label: 'BAC' },
                        { key: 'urineUndertaken', label: 'Urine' },
                        { key: 'nonNegOnly',      label: 'Non-Neg only' },
                        { key: 'sampleSentOnly',  label: 'Sent to lab' },
                        { key: 'rftOnly',         label: 'RFT only' },
                      ].map(({ key, label }) => (
                        <label key={key} className={`flex items-center gap-1.5 text-sm cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${
                          cqFilters[key]
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}>
                          <input type="checkbox" className="hidden"
                            checked={cqFilters[key]}
                            onChange={e => setCqFilters(f => ({ ...f, [key]: e.target.checked }))} />
                          {label}
                        </label>
                      ))}
                    </div>

                    {/* Run / Clear */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                      <div className="flex gap-2">
                        <button onClick={runCustomQuery} disabled={cqLoading}
                          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                          {cqLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                          Run Query
                        </button>
                        {cqData && (
                          <button onClick={exportCQ} disabled={cqExporting}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm">
                            {cqExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Export Excel
                          </button>
                        )}
                      </div>
                      <button onClick={() => { setCqFilters(CQ_DEFAULTS); setCqData(null); }}
                        className="text-xs text-gray-400 hover:text-gray-600">Reset all filters</button>
                    </div>
                  </div>

                  {/* Active filter tags */}
                  {activeCqTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeCqTags.map(tag => (
                        <span key={tag.key}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          {tag.label}
                          <button onClick={() => tag.clear
                            ? tag.clear()
                            : setCqFilters(f => ({ ...f, [tag.key]: Array.isArray(f[tag.key]) ? [] : typeof f[tag.key] === 'boolean' ? false : '' }))}
                            className="hover:text-blue-900">✕</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {cqLoading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>}

                  {cqData && !cqLoading && (
                    <div className="space-y-3">
                      {/* Summary stats bar */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <StatBox label="Results" value={cqData.total + (cqData.total === 2000 ? '+' : '')} color="blue" />
                        <StatBox label="Non-Negatives" value={cqData.summary?.nonNeg ?? 0} color="amber" />
                        <StatBox label="Positive BAC"  value={cqData.summary?.posBAC ?? 0} color="red" />
                        <StatBox label="Pending Lab"   value={cqData.summary?.pendingLab ?? 0} color="purple" />
                      </div>

                      {cqData.total === 0
                        ? <p className="text-gray-400 text-sm py-4">No tests match the selected filters.</p>
                        : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-blue-50 text-left">
                                <SortTh col="TestDate"        label="Date" />
                                <SortTh col="TestNumber"      label="Test #" />
                                <SortTh col="FullName"        label="Person" />
                                <SortTh col="CompanyName"     label="Company" />
                                <SortTh col="WorkerTypeName"  label="W. Type" />
                                <SortTh col="TestTypeName"    label="Type" />
                                <SortTh col="ClinicianName"   label="Clinician" />
                                <th className="px-3 py-2 font-medium text-blue-800">Oral</th>
                                <SortTh col="BACFinalValue"   label="BAC" />
                                <th className="px-3 py-2 font-medium text-blue-800">Urine</th>
                                <SortTh col="FinalDrugOutcome" label="Drug" />
                                <SortTh col="FinalBACOutcome"  label="BAC Out" />
                                <SortTh col="TestStatus"       label="Status" />
                                <th className="px-3 py-2 font-medium text-blue-800">RFT</th>
                                <th className="px-3 py-2 font-medium text-blue-800">Confirmatory</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {sortedCqRows.map(row => (
                                <tr key={row.TestID} className={`hover:bg-blue-50/30 ${row.IsNonNegative ? 'bg-amber-50/40' : ''}`}>
                                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.TestDate)}</td>
                                  <td className="px-3 py-2 font-mono text-xs">{row.TestNumber}</td>
                                  <td className="px-3 py-2 font-medium whitespace-nowrap">{row.FullName}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.CompanyName}</td>
                                  <td className="px-3 py-2 text-xs text-gray-400">{row.WorkerTypeName}</td>
                                  <td className="px-3 py-2 text-xs">{row.TestTypeName}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{row.ClinicianName || '—'}</td>
                                  <td className="px-3 py-2 text-xs">
                                    {row.OralUndertaken
                                      ? <span className={row.OralResult === 'Non-Negative' ? 'text-orange-600 font-semibold' : 'text-gray-600'}>{row.OralResult || '—'}</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {row.BACUndertaken
                                      ? <span className={row.FinalBACOutcome === 'Positive' ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                                          {row.BACFinalValue ?? row.BACInitialValue ?? 0}
                                        </span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {row.UrineUndertaken
                                      ? <span className={row.UrineResult === 'Non-Negative' ? 'text-orange-600 font-semibold' : 'text-gray-600'}>{row.UrineResult || '—'}</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2">{outcomeChip(row.FinalDrugOutcome)}</td>
                                  <td className="px-3 py-2">{outcomeChip(row.FinalBACOutcome)}</td>
                                  <td className="px-3 py-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      row.TestStatus === 'Completed'       ? 'bg-green-100 text-green-700' :
                                      row.TestStatus === 'Pending Lab'     ? 'bg-amber-100 text-amber-700' :
                                      row.TestStatus === 'Action Required' ? 'bg-red-100 text-red-700' :
                                      row.TestStatus === 'Review Required' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{row.TestStatus}</span>
                                  </td>
                                  <td className="px-3 py-2 text-center">{row.RFT ? <span className="text-green-600 font-bold text-xs">✓</span> : ''}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{row.ConfirmatoryResult || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ── Summary ── */}
              {activeSection === 'summary' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <StatBox label="Total Tests"    value={t.TotalTests}      color="blue"   />
                    <StatBox label="Unique People"  value={t.UniquePersons}   color="gray"   />
                    <StatBox label="Non-Negatives"  value={t.NonNegativeCount} color="amber"  />
                    <StatBox label="Positive BAC"   value={t.PositiveBACCount} color="red"    />
                    <StatBox label="Did Not Attend" value={d.dnaCount}         color="purple" />
                  </div>

                  {d.byCategory?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Tests by worker category</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {d.byCategory.map(c => (
                          <div key={c.Category} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <p className="text-xs text-gray-500">{c.Category}</p>
                            <p className="text-xl font-bold text-gray-800">{c.Count}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── By Test Type ── */}
              {activeSection === 'byType' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Tests by type — {periodLabel}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-2 font-medium text-gray-600">Test Type</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">Count</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">Non-Neg</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">% of Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.byType?.map(row => (
                          <tr key={row.Code} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{row.Name}</td>
                            <td className="px-4 py-2 text-right font-bold">{row.Count}</td>
                            <td className="px-4 py-2 text-right">
                              {row.NonNegCount > 0
                                ? <span className="text-amber-600 font-medium">{row.NonNegCount}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">
                              {t.TotalTests ? Math.round(row.Count / t.TotalTests * 100) + '%' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Outcomes ── */}
              {activeSection === 'outcomes' && (
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Drug / Oral Outcomes</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Outcome</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Count</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.drugOutcomes?.map(r => (
                          <tr key={r.Outcome} className="hover:bg-gray-50">
                            <td className="px-3 py-2">{outcomeChip(r.Outcome)}</td>
                            <td className="px-3 py-2 text-right font-bold">{r.Count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Alcohol (BAC) Outcomes</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Outcome</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Count</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.bacOutcomes?.map(r => (
                          <tr key={r.Outcome} className="hover:bg-gray-50">
                            <td className="px-3 py-2">{outcomeChip(r.Outcome)}</td>
                            <td className="px-3 py-2 text-right font-bold">{r.Count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── By Company ── */}
              {activeSection === 'employers' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">By company — {periodLabel}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-2 font-medium text-gray-600">Company</th>
                          <th className="px-4 py-2 font-medium text-gray-600">Category</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">Total</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">Non-Neg</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">+BAC</th>
                          <th className="px-4 py-2 font-medium text-gray-600 text-right">Unique People</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.byEmployer?.map(row => (
                          <tr key={row.CompanyName} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{row.CompanyName || '—'}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{row.Category || '—'}</td>
                            <td className="px-4 py-2 text-right font-bold">{row.TotalTests}</td>
                            <td className="px-4 py-2 text-right">
                              {row.NonNegCount > 0
                                ? <span className="text-amber-600 font-medium">{row.NonNegCount}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {row.PosBACCount > 0
                                ? <span className="text-red-600 font-medium">{row.PosBACCount}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{row.UniquePersons}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Non-Negatives ── */}
              {activeSection === 'nonneg' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Non-Negative detail</h3>
                  {d.nonNegatives?.length === 0
                    ? <p className="text-gray-400 text-sm py-4">No non-negatives in this period.</p>
                    : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-amber-50 text-left">
                            <th className="px-3 py-2 font-medium text-amber-800">Date</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Person</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Company</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Type</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Drug Outcome</th>
                            <th className="px-3 py-2 font-medium text-amber-800">BAC Outcome</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Confirmatory</th>
                            <th className="px-3 py-2 font-medium text-amber-800">Case Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {d.nonNegatives.map(row => (
                            <tr key={row.TestID} className="hover:bg-amber-50/40">
                              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.TestDate)}</td>
                              <td className="px-3 py-2 font-medium">{row.FullName}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{row.CompanyName}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{row.TestTypeName}</td>
                              <td className="px-3 py-2">{outcomeChip(row.FinalDrugOutcome)}</td>
                              <td className="px-3 py-2">{outcomeChip(row.FinalBACOutcome)}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{row.ConfirmatoryResult || '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  row.CaseStatus === 'Closed' ? 'bg-green-100 text-green-700' :
                                  row.CaseStatus === 'In Review' ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'}`}>
                                  {row.CaseStatus || 'Open'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── DNA ── */}
              {activeSection === 'dna' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Did Not Attend</h3>
                  {d.dnaTests?.length === 0
                    ? <p className="text-gray-400 text-sm py-4">No DNA records in this period.</p>
                    : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-purple-50 text-left">
                            <th className="px-3 py-2 font-medium text-purple-800">Date</th>
                            <th className="px-3 py-2 font-medium text-purple-800">Person</th>
                            <th className="px-3 py-2 font-medium text-purple-800">Company</th>
                            <th className="px-3 py-2 font-medium text-purple-800">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {d.dnaTests.map((row, i) => (
                            <tr key={i} className="hover:bg-purple-50/30">
                              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.TestDate)}</td>
                              <td className="px-3 py-2 font-medium">{row.FullName}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{row.CompanyName}</td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{row.Notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {!reportData && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500 text-sm">Select a period and companies, then click Generate Report.</p>
        </div>
      )}
    </div>
  );
};

export default Reports;