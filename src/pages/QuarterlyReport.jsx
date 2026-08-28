import React, { useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  FileText, Download, Printer, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Clock, Users, Activity
} from 'lucide-react';

const API_BASE = '/api';

const QUARTERS = ['Q1','Q2','Q3','Q4'];
const QUARTER_LABELS = { Q1:'Jan – Mar', Q2:'Apr – Jun', Q3:'Jul – Sep', Q4:'Oct – Dec' };
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function currentQuarter() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

const fmt = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—';
const fmtN = (n) => (n === null || n === undefined) ? '—' : n;
const bac = (v) => v != null && v !== '' ? `${parseFloat(v).toFixed(3)}%` : '—';

const SectionHeader = ({ title, count, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-slate-700 text-white px-4 py-3 rounded-t-lg hover:bg-slate-600 transition-colors"
      >
        <span className="font-semibold text-sm uppercase tracking-wide">{title}
          {count !== undefined && <span className="ml-2 bg-slate-500 text-white text-xs px-2 py-0.5 rounded-full">{count}</span>}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="border border-slate-200 rounded-b-lg overflow-hidden">{children}</div>}
    </div>
  );
};

const Cell = ({ v, className = '' }) => (
  <td className={`px-3 py-2 text-sm border-b border-gray-100 ${className}`}>{v ?? '—'}</td>
);

export default function QuarterlyReport() {
  const [year, setYear]       = useState(currentYear);
  const [quarter, setQuarter] = useState(currentQuarter());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const printRef              = useRef(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/reports/quarterly?year=${year}&quarter=${quarter}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const handleCopyTable = (tableId) => {
    const el = document.getElementById(tableId);
    if (!el) return;
    const rows = Array.from(el.querySelectorAll('tr'));
    const text = rows.map(r =>
      Array.from(r.querySelectorAll('th,td')).map(c => c.innerText).join('\t')
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  };

  const { summary, details, meta } = data || {};
  const { byCategory = [], totals = {}, dna = {}, byWorkerType = [] } = summary || {};
  const { nonNegList = [], bacPosList = [], causeList = [], pendingList = [] } = details || {};

  // Rows for the main summary table matching the report format
  const summaryRows = [
    ...byCategory,
    { Category: 'TOTAL', ...totals, _isTotal: true }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto" ref={printRef}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> Quarterly AOD Report
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Generates values in the format required for the quarterly contractor report
          </p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}
              className="border rounded px-3 py-2 text-sm">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
            <select value={quarter} onChange={e => setQuarter(e.target.value)}
              className="border rounded px-3 py-2 text-sm">
              {QUARTERS.map(q => <option key={q} value={q}>{q} — {QUARTER_LABELS[q]}</option>)}
            </select>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Generate'}
          </button>
          {data && <>
            <button onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm">
              <Printer className="w-4 h-4" /> Print
            </button>
          </>}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          Error: {error}
        </div>
      )}

      {!data && !loading && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-16 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg">Select a year and quarter then click <strong>Generate</strong></p>
        </div>
      )}

      {data && (
        <>
          {/* Report title */}
          <div className="bg-slate-800 text-white px-6 py-4 rounded-t-lg mb-0">
            <h2 className="text-lg font-bold">
              AOD Quarterly Report — {quarter} {year} ({QUARTER_LABELS[quarter]})
            </h2>
            <p className="text-slate-400 text-sm">
              {fmt(meta.startDate)} – {fmt(meta.endDate)} &nbsp;·&nbsp; Generated {format(new Date(meta.generatedAt), 'dd MMM yyyy HH:mm')}
            </p>
          </div>

          {/* ── SUMMARY STAT CARDS ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-5">
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-blue-600">{fmtN(totals.TotalTests)}</div>
              <div className="text-xs text-gray-500 mt-1">Total Tests</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-green-600">{fmtN(totals.DrugNegative)}</div>
              <div className="text-xs text-gray-500 mt-1">Drug Negative</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-red-600">{fmtN(totals.DrugNonNegative)}</div>
              <div className="text-xs text-gray-500 mt-1">Drug Non-Negative</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-orange-600">{fmtN(totals.BACPositive)}</div>
              <div className="text-xs text-gray-500 mt-1">BAC Positive</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-yellow-600">{fmtN(totals.DrugPending)}</div>
              <div className="text-xs text-gray-500 mt-1">Pending Results</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-purple-600">{fmtN(totals.UniqueWorkers)}</div>
              <div className="text-xs text-gray-500 mt-1">Unique Workers</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-red-500">{fmtN(totals.DrugConfirmedPositive)}</div>
              <div className="text-xs text-gray-500 mt-1">Confirmed Positive</div>
            </div>
            <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
              <div className="text-3xl font-bold text-gray-600">{fmtN(dna.DNACount)}</div>
              <div className="text-xs text-gray-500 mt-1">Did Not Attend</div>
            </div>
          </div>

          {/* ── MAIN RESULTS TABLE (matches report format exactly) ── */}
          <SectionHeader title="Results by Test Category" defaultOpen={true}>
            <div className="flex justify-end px-3 pt-2 print:hidden">
              <button onClick={() => handleCopyTable('tbl-main')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Copy to clipboard
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="tbl-main" className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">SCJV Test Category</th>
                    <th className="text-center px-3 py-2 font-medium">Drug – Total</th>
                    <th className="text-center px-3 py-2 font-medium">Drug – Negative</th>
                    <th className="text-center px-3 py-2 font-medium">Drug – Non-Negative</th>
                    <th className="text-center px-3 py-2 font-medium">Drug – Confirmed +ve</th>
                    <th className="text-center px-3 py-2 font-medium">Drug – Pending</th>
                    <th className="text-center px-3 py-2 font-medium">Alcohol – Total</th>
                    <th className="text-center px-3 py-2 font-medium">Alcohol – Negative</th>
                    <th className="text-center px-3 py-2 font-medium">Alcohol – Positive</th>
                    <th className="text-center px-3 py-2 font-medium">Unique Workers</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row, i) => (
                    <tr key={i} className={row._isTotal ? 'bg-slate-100 font-bold' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-sm border-b border-gray-100">{row.Category}</td>
                      <td className="px-3 py-2 text-sm border-b text-center">{fmtN(row.TotalTests)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-green-700">{fmtN(row.DrugNegative)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-red-600 font-medium">{fmtN(row.DrugNonNegative)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-red-800 font-bold">{fmtN(row.DrugConfirmedPositive)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-yellow-600">{fmtN(row.DrugPending)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center">{fmtN(row.TotalTests)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-green-700">{fmtN(row.BACNegative)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center text-red-600 font-medium">{fmtN(row.BACPositive)}</td>
                      <td className="px-3 py-2 text-sm border-b text-center">{fmtN(row.UniqueWorkers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionHeader>

          {/* ── WORKFORCE TYPE ── */}
          <SectionHeader title="Breakdown by Workforce Type" defaultOpen={true}>
            <div className="overflow-x-auto">
              <table id="tbl-wt" className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Workforce Type</th>
                    <th className="text-center px-3 py-2 font-medium">Total Tests</th>
                    <th className="text-center px-3 py-2 font-medium">Unique Workers</th>
                  </tr>
                </thead>
                <tbody>
                  {byWorkerType.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 border-b">
                      <Cell v={row.WorkerType} />
                      <Cell v={row.TotalTests} className="text-center" />
                      <Cell v={row.UniqueWorkers} className="text-center" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionHeader>

          {/* ── DNA ── */}
          <SectionHeader title={`Did Not Attend (DNA)`} count={dna.DNACount} defaultOpen={true}>
            <div className="px-4 py-3 bg-gray-50 text-sm">
              <span className="font-medium">{dna.DNACount}</span> DNA events involving <span className="font-medium">{dna.DNAUnique}</span> unique workers
            </div>
          </SectionHeader>

          {/* ── DRUG NON-NEGATIVES ── */}
          <SectionHeader title="Drug Non-Negative / Pending Detail" count={nonNegList.length} defaultOpen={true}>
            {nonNegList.length === 0
              ? <p className="px-4 py-3 text-sm text-gray-500">None this quarter.</p>
              : (
                <div className="overflow-x-auto">
                  <div className="flex justify-end px-3 pt-2 print:hidden">
                    <button onClick={() => handleCopyTable('tbl-nn')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <table id="tbl-nn" className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date','Time','Name','Company','Worker Type','Category','Oral Result','Urine?','Sample Sent?','Urine Result','Confirmatory','Substances','Notes','Status'].map(h =>
                          <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {nonNegList.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <Cell v={fmt(r.TestDate)} />
                          <Cell v={r.TestTime} />
                          <Cell v={r.Name} className="font-medium" />
                          <Cell v={r.Company} />
                          <Cell v={r.WorkerType} />
                          <Cell v={r.TestCategory} />
                          <Cell v={r.OralResult} className="text-red-600 font-medium" />
                          <Cell v={r.UrineUndertaken ? 'Yes' : 'No'} />
                          <Cell v={r.SampleSentToLab ? 'Yes' : 'No'} />
                          <Cell v={r.UrineResult} />
                          <Cell v={r.ConfirmatoryResult} />
                          <Cell v={r.DetectedSubstances} />
                          <Cell v={r.Notes} />
                          <Cell v={r.IsPending ? 'Pending' : r.TestStatus} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionHeader>

          {/* ── BAC POSITIVES ── */}
          <SectionHeader title="BAC Positive Detail" count={bacPosList.length} defaultOpen={true}>
            {bacPosList.length === 0
              ? <p className="px-4 py-3 text-sm text-gray-500">None this quarter.</p>
              : (
                <div className="overflow-x-auto">
                  <div className="flex justify-end px-3 pt-2 print:hidden">
                    <button onClick={() => handleCopyTable('tbl-bac')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <table id="tbl-bac" className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date','Time','Name','Company','Worker Type','Category','Initial BAC','Final BAC','Outcome','Notes'].map(h =>
                          <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {bacPosList.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <Cell v={fmt(r.TestDate)} />
                          <Cell v={r.TestTime} />
                          <Cell v={r.Name} className="font-medium" />
                          <Cell v={r.Company} />
                          <Cell v={r.WorkerType} />
                          <Cell v={r.TestCategory} />
                          <Cell v={bac(r.BACInitialValue)} />
                          <Cell v={bac(r.BACFinalValue)} className="font-medium text-red-600" />
                          <Cell v={r.FinalBACOutcome} />
                          <Cell v={r.Notes} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionHeader>

          {/* ── FOR CAUSE ── */}
          <SectionHeader title="For Cause Detail" count={causeList.length} defaultOpen={true}>
            {causeList.length === 0
              ? <p className="px-4 py-3 text-sm text-gray-500">None this quarter.</p>
              : (
                <div className="overflow-x-auto">
                  <div className="flex justify-end px-3 pt-2 print:hidden">
                    <button onClick={() => handleCopyTable('tbl-cause')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <table id="tbl-cause" className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date','Time','Name','Company','Worker Type','Oral Result','Initial BAC','Final BAC','Drug Outcome','BAC Outcome','Confirmatory','Notes'].map(h =>
                          <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {causeList.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <Cell v={fmt(r.TestDate)} />
                          <Cell v={r.TestTime} />
                          <Cell v={r.Name} className="font-medium" />
                          <Cell v={r.Company} />
                          <Cell v={r.WorkerType} />
                          <Cell v={r.OralResult} />
                          <Cell v={bac(r.BACInitialValue)} />
                          <Cell v={bac(r.BACFinalValue)} />
                          <Cell v={r.FinalDrugOutcome} />
                          <Cell v={r.FinalBACOutcome} />
                          <Cell v={r.ConfirmatoryResult} />
                          <Cell v={r.Notes} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionHeader>

          {/* ── PENDING ── */}
          <SectionHeader title="Pending Results" count={pendingList.length} defaultOpen={true}>
            {pendingList.length === 0
              ? <p className="px-4 py-3 text-sm text-gray-500">No pending results.</p>
              : (
                <div className="overflow-x-auto">
                  <div className="flex justify-end px-3 pt-2 print:hidden">
                    <button onClick={() => handleCopyTable('tbl-pend')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <table id="tbl-pend" className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date','Name','Company','Category','Oral Result','Urine Result','Confirmatory','Substances','Notes'].map(h =>
                          <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingList.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <Cell v={fmt(r.TestDate)} />
                          <Cell v={r.Name} className="font-medium" />
                          <Cell v={r.Company} />
                          <Cell v={r.TestCategory} />
                          <Cell v={r.OralResult} />
                          <Cell v={r.UrineResult} />
                          <Cell v={r.ConfirmatoryResult} />
                          <Cell v={r.DetectedSubstances} />
                          <Cell v={r.Notes} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionHeader>
        </>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .p-6 * { visibility: visible; }
          .p-6 { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
