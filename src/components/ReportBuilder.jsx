import React, { useState } from 'react';
import { Play, Loader2, Info } from 'lucide-react';

// ─── Dataset config ───────────────────────────────────────────────────────────

const DATASETS = [
  { id: 'aod',      label: 'AOD (Drug & Alcohol)',     color: 'blue' },
  { id: 'patient',  label: 'Patient / Clinical',        color: 'red' },
  { id: 'training', label: 'Training & Compliance',     color: 'green' },
];

const GROUPBY_OPTIONS = {
  aod: [
    { id: 'month',    label: 'Month' },
    { id: 'week',     label: 'Week' },
    { id: 'testType', label: 'Test Type (Random / Pre-Emp…)' },
    { id: 'employer', label: 'Company / Employer' },
    { id: 'result',   label: 'Overall AOD Result' },
    { id: 'category', label: 'Workforce Category (Employee / Contractor)' },
  ],
  patient: [
    { id: 'month',          label: 'Month' },
    { id: 'week',           label: 'Week' },
    { id: 'wrNwr',          label: 'WR / NWR' },
    { id: 'classification', label: 'Classification (FAC / MTC…)' },
    { id: 'referral',       label: 'Referral Type' },
    { id: 'bodyLocation',   label: 'Body Location' },
    { id: 'injuryType',     label: 'Injury / Illness Type' },
  ],
  training: [
    { id: 'month',        label: 'Month' },
    { id: 'trainingType', label: 'Training Type' },
    { id: 'trainer',      label: 'Trainer' },
  ],
};

const METRIC_LABELS = {
  aod: {
    Total:           'Total Tests',
    NonNegative:     'Non-Negative (Drug)',
    AlcoholPositive: 'Alcohol Positive',
    Refusals:        'Refusals',
    PendingLab:      'Pending Lab',
    NonNegRate:      'Non-Neg Rate %',
  },
  patient: {
    Total:      'Total Presentations',
    WR:         'Work-Related (WR)',
    NWR:        'Non-Work-Related (NWR)',
    EDReferrals:'ED Referrals',
    DrConsults: 'Dr Consults',
  },
  training: {
    Total:      'Total Sessions',
    TotalHours: 'Total Hours',
    Passed:     'Passed',
  },
};

export default function ReportBuilder({ onRun, employers, selectedEmployers, onEmployerChange }) {
  const [dataset,   setDataset]   = useState('aod');
  const [groupBy,   setGroupBy]   = useState(['month']);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate,   setEndDate]   = useState(() => new Date().toISOString().split('T')[0]);
  const [running,   setRunning]   = useState(false);

  function toggleGroupBy(id) {
    setGroupBy(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(g => g !== id) : prev // keep at least 1
        : prev.length < 2 ? [...prev, id] : [prev[1], id]     // max 2
    );
  }

  async function handleRun() {
    setRunning(true);
    try {
      await onRun({ dataset, groupBy, startDate, endDate, employerIds: selectedEmployers });
    } finally {
      setRunning(false);
    }
  }

  const groupOpts    = GROUPBY_OPTIONS[dataset]  || [];
  const metricLabels = METRIC_LABELS[dataset]    || {};

  return (
    <div className="space-y-6">
      {/* Dataset */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">1. Choose Dataset</label>
        <div className="flex gap-3 flex-wrap">
          {DATASETS.map(d => (
            <button key={d.id} onClick={() => { setDataset(d.id); setGroupBy([GROUPBY_OPTIONS[d.id][0].id]); }}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                dataset === d.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 bg-white'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">2. Date Range</label>
        <div className="flex gap-3 items-center flex-wrap">
          <div>
            <span className="text-xs text-gray-500 mr-1">From</span>
            <input type="date" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <span className="text-xs text-gray-500 mr-1">To</span>
            <input type="date" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {[
              { label: 'This week', fn: () => {
                const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
                setStartDate(mon.toISOString().split('T')[0]); setEndDate(now.toISOString().split('T')[0]);
              }},
              { label: 'This month', fn: () => {
                const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1);
                setStartDate(first.toISOString().split('T')[0]); setEndDate(now.toISOString().split('T')[0]);
              }},
              { label: 'Last 30d', fn: () => {
                const now = new Date(); const past = new Date(now); past.setDate(now.getDate() - 30);
                setStartDate(past.toISOString().split('T')[0]); setEndDate(now.toISOString().split('T')[0]);
              }},
              { label: 'YTD', fn: () => {
                const now = new Date();
                setStartDate(`${now.getFullYear()}-01-01`); setEndDate(now.toISOString().split('T')[0]);
              }},
            ].map(p => (
              <button key={p.label} onClick={p.fn}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 text-gray-600">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Group By */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          3. Group By <span className="text-gray-400 font-normal">(up to 2)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {groupOpts.map(g => (
            <button key={g.id} onClick={() => toggleGroupBy(g.id)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                groupBy.includes(g.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 bg-white'
              }`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics info (auto-calculated) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">4. Metrics (auto-selected for dataset)</label>
        <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-2">
          {Object.entries(metricLabels).map(([k, v]) => (
            <span key={k} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">{v}</span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Info size={11} /> All relevant metrics for the chosen dataset are always included.
        </p>
      </div>

      {/* Employer filter (AOD only) */}
      {dataset === 'aod' && employers?.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">5. Filter by Company</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3">
            <button onClick={() => onEmployerChange(employers.map(e => e.EmployerID))}
              className="px-2 py-1 text-xs border rounded bg-white hover:bg-blue-50">All</button>
            <button onClick={() => onEmployerChange([])}
              className="px-2 py-1 text-xs border rounded bg-white hover:bg-red-50">None</button>
            {employers.map(e => (
              <button key={e.EmployerID}
                onClick={() => onEmployerChange(
                  selectedEmployers.includes(e.EmployerID)
                    ? selectedEmployers.filter(id => id !== e.EmployerID)
                    : [...selectedEmployers, e.EmployerID]
                )}
                className={`px-2 py-1 text-xs border rounded transition-colors ${
                  selectedEmployers.includes(e.EmployerID)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                }`}>
                {e.CompanyName}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleRun} disabled={running}
        className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm">
        {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        Run Report
      </button>
    </div>
  );
}
