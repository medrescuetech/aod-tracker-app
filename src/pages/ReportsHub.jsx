import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Loader2, Play, Bookmark, BookmarkCheck, Trash2,
  ChevronRight, Activity, Beaker, Shield, TrendingUp, Heart,
  ClipboardList, AlertTriangle, Target, Zap, GraduationCap,
  Users, Briefcase, FileWarning, Settings, X, Plus, Pencil,
  FileText
} from 'lucide-react';
import api from '../services/api';
import ReportViewer from '../components/ReportViewer';
import ReportBuilder from '../components/ReportBuilder';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

// ─── Report catalogue ─────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'aod-operational', label: '1.1 Operational AOD', icon: Activity, color: 'blue',
    reports: [
      { id: 'daily-activity',      name: 'Daily AOD Activity',       desc: 'Total tests by type, employee vs contractor, DNA' },
      { id: 'non-negative-summary',name: 'Non-Negative Summary',      desc: 'Drug non-neg, alcohol positive, pending lab' },
      { id: 'testing-compliance',  name: 'Testing Compliance',        desc: '% randoms completed, DNA trends' },
    ],
  },
  {
    id: 'aod-lab', label: '1.2 Lab & Chain of Custody', icon: Beaker, color: 'purple',
    reports: [
      { id: 'rft-register',      name: 'RFT Register',             desc: 'Non-neg screens, chain of custody, lab turnaround' },
      { id: 'lab-reconciliation',name: 'Lab Outcome Reconciliation',desc: 'Initial vs confirmatory, consistent/inconsistent' },
      { id: 'non-negative-status',name: 'Non-Negative Status',      desc: 'Open, In Review, Closed case breakdown' },
    ],
  },
  {
    id: 'aod-compliance', label: '1.3 Compliance & Audit', icon: Shield, color: 'green',
    reports: [
      { id: 'compliance-dashboard',name: 'AOD Compliance Dashboard', desc: '% workforce tested, contractor vs employee coverage' },
      { id: 'policy-breach',       name: 'Policy Breach Register',   desc: 'Confirmed positives, refusals, invalid samples' },
      { id: 'audit-trail',         name: 'Audit Trail',              desc: 'Edits to results, who changed what and when' },
    ],
  },
  {
    id: 'aod-quarterly', label: '1.4 AOD Quarterly Reports', icon: FileText, color: 'slate',
    reports: [
      { id: 'quarter-results',       name: 'Quarter Results',            desc: 'Contractor summary by test category' },
      { id: 'scjv-employees',        name: 'SCJV Employees Summary',     desc: 'Staff-only quarterly summary' },
      { id: 'for-cause',             name: 'For Cause Report',           desc: 'Detail extract for cause/suspicion tests' },
      { id: 'pos-bac',               name: 'POS Bac Report',             desc: 'Positive BAC detail for quarter' },
      { id: 'quarter-non-negs',      name: 'Quarter Non-Negs',           desc: 'Oral non-negative cases detail' },
      { id: 'pending-other',         name: 'Pending & Other Report',     desc: 'Pending/unresolved cases with reasons' },
      { id: 'unique-employees',      name: 'Unique Employees',           desc: 'Deduplicated person counts by category' },
    ],
  },
  {
    id: 'aod-trends', label: '1.5 Trend & Risk', icon: TrendingUp, color: 'amber',
    reports: [
      { id: 'substance-trends',       name: 'Substance Trends',          desc: 'Drug class trends, temporal patterns' },
      { id: 'high-risk-segmentation', name: 'High-Risk Segmentation',     desc: 'Contractor vs employee risk, repeat non-neg' },
      { id: 'test-type-effectiveness',name: 'Test Type Effectiveness',    desc: 'Yield by random, for cause, post-incident' },
    ],
  },
  {
    id: 'patient-operational', label: '2.1 Clinical Operations', icon: Heart, color: 'red',
    reports: [
      { id: 'daily-presentation', name: 'Daily Presentation',  desc: 'Total patients, WR vs NWR, Camp vs Site' },
      { id: 'weekly-event',       name: 'Weekly Event Report', desc: 'WR/NWR classification, injury types, dispositions' },
      { id: 'clinical-workload', name: 'Clinical Workload',   desc: 'Presentations per shift/day, peak demand' },
      { id: 'reviews-calendar',   name: 'Reviews Calendar',    desc: 'Scheduled patient reviews by date range' },
    ],
  },
  {
    id: 'patient-governance', label: '2.2 Clinical Governance', icon: ClipboardList, color: 'indigo',
    reports: [
      { id: 'acuity-casemix',name: 'Acuity & Case Mix',        desc: 'Low vs high acuity, trauma vs medical' },
      { id: 'disposition',   name: 'Disposition Report',       desc: 'RTW, restricted duties, ED transport, RFDS' },
      { id: 'ed-referral',   name: 'ED Referral Analysis',     desc: '% referred vs transported' },
    ],
  },
  {
    id: 'patient-safety', label: '2.3 Safety & WHS', icon: AlertTriangle, color: 'orange',
    reports: [
      { id: 'wri-analysis', name: 'Work-Related Injury Analysis', desc: 'Mechanism of injury, location trends' },
      { id: 'lost-time',    name: 'Lost Time / Restricted Work', desc: 'Links to RTW processes, WHS reporting' },
      { id: 'nwr-hospital', name: 'NWR Hospitalisation',         desc: 'NWR + ED referrals, workforce health' },
    ],
  },
  {
    id: 'tc-site-weekly', label: '2.4 TC Site Weekly Reports', icon: ClipboardList, color: 'teal',
    reports: [
      { id: 'tc-site-weekly',     name: 'TC Site Weekly Dashboard',  desc: 'Combined weekly summary with all sections' },
      { id: 'patient-wr-location',name: 'WR Injury Locations',     desc: 'Work-related injuries by body location' },
      { id: 'patient-wr-type',    name: 'WR Injury Types',         desc: 'Work-related injuries by injury type' },
      { id: 'patient-wr-class',   name: 'WR/NWR Classification',   desc: 'Work vs Non-Work split' },
      { id: 'patient-nwr-class',  name: 'NWR Detailed Class',      desc: 'NWR Hospital/Review/NWR breakdown' },
      { id: 'wr-injury-outcome',  name: 'RTW Outcomes',            desc: 'Return to Work outcomes' },
      { id: 'aod-weekly-summary', name: 'AOD Weekly Summary',      desc: 'AOD tests by type count' },
      { id: 'aod-nonnegative',    name: 'AOD Non-Negative',        desc: 'Non-negative AOD results count' },
    ],
  },
  {
    id: 'integrated', label: '3. AOD + Patient Integrated', icon: Zap, color: 'pink',
    reports: [
      { id: 'post-incident-linkage',  name: 'Post-Incident AOD Linkage',  desc: 'AOD tests triggered by incidents' },
      { id: 'injury-aod-correlation', name: 'Injury vs AOD Correlation',  desc: 'Overlap between incidents and non-negatives' },
      { id: 'near-miss-aod',          name: 'Near Miss AOD',              desc: 'Non-neg initial → negative lab (safety signal)' },
    ],
  },
  {
    id: 'training-ahpra', label: '4.1 AHPRA CPD', icon: GraduationCap, color: 'cyan',
    reports: [
      { id: 'training-summary', name: 'Training Summary',     desc: 'Sessions, hours, attendees by type' },
      { id: 'training-expiry',  name: 'Expiry / Due Report',  desc: 'Training nearing or past expiry' },
      { id: 'cpd-hours',        name: 'CPD Hours Tracker',    desc: 'Hours completed vs required' },
    ],
  },
  {
    id: 'training-workforce', label: '4.2 Workforce Capability', icon: Users, color: 'slate',
    reports: [
      { id: 'skills-matrix',      name: 'Skills Currency Matrix',     desc: 'BA, fire, road crash rescue, confined space' },
      { id: 'competency-expiry',  name: 'Competency Expiry',          desc: 'Units nearing expiry' },
      { id: 'readiness-dashboard',name: 'Operational Readiness',      desc: '% staff fully compliant' },
    ],
  },
  {
    id: 'executive', label: '5. Executive', icon: BarChart3, color: 'violet',
    reports: [
      { id: 'monthly-dashboard', name: 'Monthly Dashboard',     desc: 'AOD + injury + training KPIs' },
      { id: 'quarterly-aod',     name: 'Quarterly AOD Report',  desc: 'Trends, compliance rates, key risks' },
      { id: 'repeat-risk',       name: 'Repeat Risk Register',  desc: 'Pattern recognition individuals' },
    ],
  },
  {
    id: 'data-quality', label: '6. Data Quality', icon: Settings, color: 'gray',
    reports: [
      { id: 'data-quality',    name: 'Data Quality Report',   desc: 'Missing fields, invalid entries' },
      { id: 'logic-exception', name: 'Logic Exception Report',desc: 'Cases that break expected rules' },
    ],
  },
];

const COLOR_MAP = {
  blue:   'bg-blue-50   border-blue-200   text-blue-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
  green:  'bg-green-50  border-green-200  text-green-800',
  teal:   'bg-teal-50   border-teal-200   text-teal-800',
  slate:  'bg-slate-50  border-slate-200  text-slate-800',
  amber:  'bg-amber-50  border-amber-200  text-amber-800',
  red:    'bg-red-50    border-red-200    text-red-800',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  pink:   'bg-pink-50   border-pink-200   text-pink-800',
  cyan:   'bg-cyan-50   border-cyan-200   text-cyan-800',
  violet: 'bg-violet-50 border-violet-200 text-violet-800',
  gray:   'bg-gray-50   border-gray-200   text-gray-700',
};

const TABS = ['Reports', 'Custom Builder', 'Saved Templates'];

// ─── Template save modal ──────────────────────────────────────────────────────

function SaveTemplateModal({ reportId, config, onSave, onClose }) {
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.saveReportTemplate({ name, description, reportId: reportId || null, config: config || null });
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Save as Template</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly AOD Summary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2}
            value={description} onChange={e => setDesc(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center gap-1">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsHub() {
  const [tab,               setTab]              = useState(0);
  const [expandedCategory,  setExpandedCategory] = useState(null);
  const [selectedReport,    setSelectedReport]   = useState(null); // { id, name }
  const [loading,           setLoading]          = useState(false);
  const [reportData,        setReportData]       = useState(null);
  const [customData,        setCustomData]       = useState(null);
  const [customConfig,      setCustomConfig]     = useState(null);
  const [templates,         setTemplates]        = useState([]);
  const [templatesLoading,  setTemplatesLoading] = useState(false);
  const [employers,         setEmployers]        = useState([]);
  const [selectedEmployers, setSelectedEmployers]= useState([]);
  const [saveModalOpen,     setSaveModalOpen]    = useState(false);
  const [saveTarget,        setSaveTarget]       = useState(null); // { reportId, config }
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end:   format(endOfMonth(new Date()),   'yyyy-MM-dd'),
  });

  useEffect(() => {
    api.getEmployers().then(d => {
      setEmployers(d);
      setSelectedEmployers(d.map(e => e.EmployerID));
    }).catch(() => {});
    loadTemplates();
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try { setTemplates(await api.getReportTemplates()); }
    catch {}
    finally { setTemplatesLoading(false); }
  }, []);

  function buildParams() {
    return { startDate: dateRange.start, endDate: dateRange.end, employerIds: selectedEmployers };
  }

  async function runReport(report) {
    setSelectedReport(report);
    setReportData(null);
    setLoading(true);
    try {
      const data = await api.generateReport(report.id, buildParams());
      setReportData(data);
    } catch (e) { alert('Report failed: ' + e.message); }
    finally { setLoading(false); }
  }

  async function runFromTemplate(tpl) {
    setTab(0); // switch to reports tab
    const parsedConfig = tpl.Config ? JSON.parse(tpl.Config) : null;
    if (tpl.ReportId) {
      await runReport({ id: tpl.ReportId, name: tpl.Name });
    } else if (parsedConfig) {
      setTab(1);
      // Pre-fill builder would be complex; just run it directly
      setCustomData(null);
      setLoading(true);
      try {
        const data = await api.runCustomReport({ ...parsedConfig, ...buildParams() });
        setCustomData(data);
        setCustomConfig(parsedConfig);
      } catch (e) { alert('Report failed: ' + e.message); }
      finally { setLoading(false); }
    }
  }

  async function handleCustomRun(config) {
    setCustomData(null);
    setCustomConfig(config);
    const data = await api.runCustomReport(config);
    setCustomData(data);
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Delete this template?')) return;
    await api.deleteReportTemplate(id);
    loadTemplates();
  }

  function openSaveModal(reportId, config) {
    setSaveTarget({ reportId, config });
    setSaveModalOpen(true);
  }

  const params = buildParams();

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-xl"><BarChart3 size={24} className="text-violet-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports Hub</h1>
            <p className="text-gray-500 text-sm">Analytics, exports, and custom report builder</p>
          </div>
        </div>

        {/* Global date range */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 text-xs">From</span>
            <input type="date" className="border border-gray-200 rounded px-2 py-1 text-xs"
              value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))} />
            <span className="text-gray-500 text-xs">To</span>
            <input type="date" className="border border-gray-200 rounded px-2 py-1 text-xs"
              value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(() => {
              const y = new Date().getFullYear();
              const qStart = (q) => `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
              const qEnd = (q) => format(endOfMonth(new Date(y, q * 3 - 1, 1)), 'yyyy-MM-dd');
              // AU Financial Year: July 1 → June 30
              const fyStart = `${new Date().getMonth() >= 6 ? y : y - 1}-07-01`;
              const fyEnd = `${new Date().getMonth() >= 6 ? y + 1 : y}-06-30`;
              return [
                { label: 'Week', fn: () => setDateRange({ start: format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd') }) },
                { label: 'Month', fn: () => setDateRange({ start: format(startOfMonth(new Date()),'yyyy-MM-dd'), end: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
                { label: 'YTD', fn: () => setDateRange({ start: `${y}-01-01`, end: format(new Date(),'yyyy-MM-dd') }) },
                { label: 'Q1', fn: () => setDateRange({ start: qStart(1), end: qEnd(1) }) },
                { label: 'Q2', fn: () => setDateRange({ start: qStart(2), end: qEnd(2) }) },
                { label: 'Q3', fn: () => setDateRange({ start: qStart(3), end: qEnd(3) }) },
                { label: 'Q4', fn: () => setDateRange({ start: qStart(4), end: qEnd(4) }) },
                { label: 'FY', fn: () => setDateRange({ start: fyStart, end: fyEnd }) },
              ];
            })().map(p => (
              <button key={p.label} onClick={p.fn}
                className="px-2 py-1 text-xs border rounded hover:bg-blue-50 hover:border-blue-300 text-gray-500">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Employer category filter */}
      {employers.length > 0 && (
        <div className="flex items-center gap-2 mb-4 bg-white border border-gray-200 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-500 mr-1">Filter:</span>
          <button
            onClick={() => setSelectedEmployers(employers.map(e => e.EmployerID))}
            className={`px-3 py-1 text-xs border rounded-lg font-medium transition-colors ${
              selectedEmployers.length === employers.length ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-300'
            }`}>
            All
          </button>
          <button
            onClick={() => setSelectedEmployers(employers.filter(e => e.Category === 'Employee').map(e => e.EmployerID))}
            className={`px-3 py-1 text-xs border rounded-lg font-medium transition-colors ${
              selectedEmployers.length > 0 && selectedEmployers.length === employers.filter(e => e.Category === 'Employee').length && selectedEmployers.every(id => employers.find(e => e.EmployerID === id)?.Category === 'Employee')
                ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:border-green-300'
            }`}>
            Employees Only
          </button>
          <button
            onClick={() => setSelectedEmployers(employers.filter(e => e.Category === 'Contractor').map(e => e.EmployerID))}
            className={`px-3 py-1 text-xs border rounded-lg font-medium transition-colors ${
              selectedEmployers.length > 0 && selectedEmployers.length === employers.filter(e => e.Category === 'Contractor').length && selectedEmployers.every(id => employers.find(e => e.EmployerID === id)?.Category === 'Contractor')
                ? 'bg-orange-600 text-white border-orange-600' : 'border-gray-200 text-gray-500 hover:border-orange-300'
            }`}>
            Contractors Only
          </button>
          <span className="text-xs text-gray-400 ml-2">{selectedEmployers.length} of {employers.length} companies</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === i ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
            {t === 'Saved Templates' && templates.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs rounded-full px-1.5 py-0.5">{templates.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── TAB: Reports ─── */}
      {tab === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: category browser */}
          <div className="lg:col-span-1 space-y-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isExpanded = expandedCategory === cat.id;
              const cls = COLOR_MAP[cat.color] || COLOR_MAP.gray;
              return (
                <div key={cat.id} className={`rounded-xl border ${cls} overflow-hidden`}>
                  <button
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon size={15} />
                      {cat.label}
                    </span>
                    <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="border-t border-current border-opacity-10">
                      {cat.reports.map(r => (
                        <button key={r.id}
                          onClick={() => runReport(r)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-black/5 transition-colors border-b border-current border-opacity-5 last:border-0 ${
                            selectedReport?.id === r.id ? 'bg-black/10' : ''
                          }`}>
                          <div className="text-xs font-medium">{r.name}</div>
                          <div className="text-xs opacity-60 mt-0.5">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: report output */}
          <div className="lg:col-span-2">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                <Loader2 size={32} className="animate-spin text-blue-500 mb-3" />
                <p className="text-gray-500 text-sm">Generating report…</p>
              </div>
            )}
            {!loading && !reportData && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                <BarChart3 size={40} className="text-gray-200 mb-3" />
                <p className="text-gray-400 font-medium">Select a report from the left panel</p>
                <p className="text-gray-300 text-sm mt-1">Results will appear here</p>
              </div>
            )}
            {!loading && reportData && selectedReport && (
              <ReportViewer
                reportId={selectedReport.id}
                reportName={selectedReport.name}
                data={reportData}
                params={params}
                onSaveTemplate={() => openSaveModal(selectedReport.id, null)}
                onClose={() => { setReportData(null); setSelectedReport(null); }}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Custom Builder ─── */}
      {tab === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Custom Report Builder</h2>
            <ReportBuilder
              onRun={handleCustomRun}
              employers={employers}
              selectedEmployers={selectedEmployers}
              onEmployerChange={setSelectedEmployers}
            />
          </div>
          <div className="lg:col-span-3">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                <Loader2 size={32} className="animate-spin text-blue-500 mb-3" />
                <p className="text-gray-500 text-sm">Running query…</p>
              </div>
            )}
            {!loading && !customData && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                <Play size={36} className="text-gray-200 mb-3" />
                <p className="text-gray-400 font-medium">Configure and run your report</p>
              </div>
            )}
            {!loading && customData && (
              <ReportViewer
                reportId="custom"
                reportName={`Custom: ${(customConfig?.groupBy || []).join(' × ')} (${customConfig?.dataset})`}
                data={customData}
                params={params}
                isCustom
                onSaveTemplate={() => openSaveModal(null, customConfig)}
                onClose={() => setCustomData(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Saved Templates ─── */}
      {tab === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {templates.length} saved template{templates.length !== 1 ? 's' : ''} — run any report with one click.
            </p>
            <button onClick={() => { setTab(0); }}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <Plus size={14} /> Create from Reports tab
            </button>
          </div>

          {templatesLoading && (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
          )}

          {!templatesLoading && templates.length === 0 && (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
              <Bookmark size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-medium">No saved templates yet</p>
              <p className="text-gray-300 text-sm mt-1">
                Run a report or custom query, then click "Save as Template" to store it here.
              </p>
            </div>
          )}

          {!templatesLoading && templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tpl => (
                <div key={tpl.TemplateID} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{tpl.Name}</div>
                      {tpl.Description && <div className="text-xs text-gray-500 mt-0.5">{tpl.Description}</div>}
                    </div>
                    <button onClick={() => deleteTemplate(tpl.TemplateID)}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {tpl.ReportId && (
                      <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5">
                        {tpl.ReportId}
                      </span>
                    )}
                    {!tpl.ReportId && (
                      <span className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5">
                        Custom query
                      </span>
                    )}
                    <span>Saved {new Date(tpl.CreatedAt).toLocaleDateString('en-AU')}</span>
                  </div>
                  <button onClick={() => runFromTemplate(tpl)}
                    className="flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-blue-700">
                    <Play size={12} /> Run Report
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save template modal */}
      {saveModalOpen && saveTarget && (
        <SaveTemplateModal
          reportId={saveTarget.reportId}
          config={saveTarget.config}
          onSave={() => { setSaveModalOpen(false); loadTemplates(); }}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </div>
  );
}
