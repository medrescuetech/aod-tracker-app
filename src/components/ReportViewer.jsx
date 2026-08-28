import React, { useState, useMemo } from 'react';
import {
  Download, Printer, ChevronUp, ChevronDown, Search,
  ZoomIn, X, Loader2, FileSpreadsheet, FileText
} from 'lucide-react';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVal(val, type) {
  if (val === null || val === undefined || val === '') return '—';
  if (type === 'date' && typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      return new Date(val).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return val; }
  }
  if (type === 'percent') return `${val}%`;
  return String(val);
}

function SummaryCards({ summary }) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const entries = Object.entries(summary);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {entries.map(([k, v]) => (
        <div key={k} className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-[110px]">
          <div className="text-xl font-bold text-blue-700">{v ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-0.5 capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Drill-down modal ─────────────────────────────────────────────────────────

function DrilldownModal({ data, onClose }) {
  const [search, setSearch] = useState('');
  const rows = data?.rows || [];
  const cols = data?.columns || [];
  const filtered = search
    ? rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">Drill-down: Individual Records</h3>
            <p className="text-xs text-gray-500 mt-0.5">{rows.length} records found</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              placeholder="Filter records…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-auto flex-1">
          {cols.length === 0 ? (
            <p className="p-6 text-gray-400 text-center">No drill-down available for this report.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-800 text-white sticky top-0">
                <tr>{cols.map(c => <th key={c.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {cols.map(c => <td key={c.key} className="px-3 py-1.5 border-b border-gray-100">{fmtVal(r[c.key], c.type)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t text-right">
          <button onClick={onClose} className="border border-gray-300 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ReportViewer ────────────────────────────────────────────────────────

export default function ReportViewer({ reportId, reportName, data, params, isCustom, onSaveTemplate, onClose }) {
  const [sortCol, setSortCol]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc');
  const [search,  setSearch]    = useState('');
  const [drillData, setDrillData] = useState(null);
  const [drilling,  setDrilling]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfing,    setPdfing]    = useState(false);

  const columns = data?.columns || [];

  // For reports that return { summary, details/rows } with no explicit columns
  const autoRows = useMemo(() => {
    if (data?.rows) return data.rows;
    // Some reports use 'details' array
    if (Array.isArray(data?.details) && data.details.length > 0) return data.details;
    return null;
  }, [data]);

  const autoCols = useMemo(() => {
    if (columns.length) return columns;
    const sampleRow = autoRows?.[0];
    if (!sampleRow) return [];
    return Object.keys(sampleRow).map(k => ({ key: k, label: k }));
  }, [columns, autoRows]);

  const sortedRows = useMemo(() => {
    const rows = autoRows || [];
    let filtered = search
      ? rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
      : rows;
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [autoRows, search, sortCol, sortDir]);

  function toggleSort(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  // Extra sections: any array-valued key other than rows/details/columns/summary
  const extraSections = useMemo(() => {
    if (!data) return [];
    const skip = new Set(['rows', 'details', 'columns', 'summary']);
    return Object.entries(data)
      .filter(([k, v]) => !skip.has(k) && Array.isArray(v) && v.length > 0 && typeof v[0] === 'object')
      .map(([k, v]) => ({ key: k, rows: v, cols: Object.keys(v[0]).map(c => ({ key: c, label: c })) }));
  }, [data]);

  async function handleExcel() {
    setExporting(true);
    try { await api.exportReportExcel(reportId, params); }
    catch (e) { alert('Excel export failed: ' + e.message); }
    finally { setExporting(false); }
  }

  async function handlePdf() {
    setPdfing(true);
    try { await api.openReportPdf(reportId, params); }
    catch (e) { alert('PDF failed: ' + e.message); }
    finally { setPdfing(false); }
  }

  async function handleDrilldown() {
    setDrilling(true);
    try {
      const result = await api.drilldown({ reportId, ...params });
      setDrillData(result);
    } catch (e) { alert('Drill-down failed: ' + e.message); }
    finally { setDrilling(false); }
  }

  if (!data) return null;

  const DRILL_ENABLED = [
    'daily-activity', 'non-negative-summary', 'rft-register', 'repeat-risk',
    'near-miss-aod', 'daily-presentation', 'weekly-event', 'wri-analysis',
  ];
  const canDrilldown = isCustom ? false : DRILL_ENABLED.includes(reportId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-800 text-white">
        <div>
          <h3 className="font-semibold text-sm">{reportName || reportId}</h3>
          {params?.startDate && (
            <p className="text-slate-400 text-xs mt-0.5">
              {params.startDate} → {params.endDate}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canDrilldown && (
            <button onClick={handleDrilldown} disabled={drilling}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50">
              {drilling ? <Loader2 size={12} className="animate-spin" /> : <ZoomIn size={12} />}
              Drill-down
            </button>
          )}
          {onSaveTemplate && (
            <button onClick={onSaveTemplate}
              className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded text-xs font-medium">
              Save as Template
            </button>
          )}
          <button onClick={handleExcel} disabled={exporting}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50">
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
            Excel
          </button>
          <button onClick={handlePdf} disabled={pdfing}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50">
            {pdfing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            PDF
          </button>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-1"><X size={16} /></button>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Summary cards */}
        {data.summary && <SummaryCards summary={data.summary} />}

        {/* Main table */}
        {autoCols.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{sortedRows.length} rows</span>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="pl-7 pr-3 py-1 border border-gray-300 rounded-lg text-xs w-48 focus:ring-2 focus:ring-blue-500"
                  placeholder="Search table…"
                  value={search} onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    {autoCols.map(c => (
                      <th key={c.key}
                        className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-slate-600"
                        onClick={() => toggleSort(c.key)}>
                        <span className="flex items-center gap-1">
                          {c.label}
                          {sortCol === c.key
                            ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                            : <ChevronUp size={11} className="opacity-20" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={autoCols.length} className="text-center text-gray-400 py-6 text-xs">No data</td></tr>
                  ) : sortedRows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                      {autoCols.map(c => (
                        <td key={c.key} className="px-3 py-2 border-b border-gray-100 text-xs whitespace-nowrap">
                          {fmtVal(r[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Extra sections (e.g. byDate, byType from activity report) */}
        {extraSections.map(sec => (
          <div key={sec.key} className="mt-5">
            <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">{sec.key.replace(/([A-Z])/g, ' $1')}</h4>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>{sec.cols.map(c => <th key={c.key} className="px-3 py-2 text-left text-xs font-medium">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {sec.cols.map(c => <td key={c.key} className="px-3 py-2 border-b border-gray-100 text-xs">{fmtVal(r[c.key], c.type)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {drillData && <DrilldownModal data={drillData} onClose={() => setDrillData(null)} />}
    </div>
  );
}
