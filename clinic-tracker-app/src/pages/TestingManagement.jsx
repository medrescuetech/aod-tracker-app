import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserX, Clock, Shuffle, Loader2, Plus, Trash2, CheckCircle,
  XCircle, FileSpreadsheet, Printer, ChevronDown, Search, Upload, Download,
  AlertTriangle, RefreshCw, FlaskConical, X, Calendar, BarChart3, Link
} from 'lucide-react';
import api from '../services/api';
import { format } from 'date-fns';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const DNA_REASONS = ['Not at work', 'Not located on site', 'Refused to attend', 'Medically exempt', 'Off-duty', 'Other'];
const SHIFTS = ['Day', 'Night', 'Roster'];

function PersonSearch({ value, onChange, placeholder = 'Search person…' }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  const search = useCallback((q) => {
    clearTimeout(debounce.current);
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchPersons(q);
        setResults(data || []);
        setOpen(true);
      } catch {}
      finally { setLoading(false); }
    }, 280);
  }, []);

  function select(p) {
    setQuery(p.FullName);
    setOpen(false);
    onChange(p);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        {loading && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
        <input
          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder={value?.FullName || placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(p => (
            <li key={p.PersonID}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between"
              onMouseDown={() => select(p)}>
              <span className="font-medium">{p.FullName}</span>
              <span className="text-xs text-gray-400">{p.BadgeNumber || p.EmployeeNumber || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── TAB 1: DNA Log ────────────────────────────────────────────────────────────

function DnaTab({ testTypes, lookups }) {
  const now = new Date();
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [dateFrom, setDateFrom] = useState(format(now, 'yyyy-MM-01'));
  const [dateTo,   setDateTo]   = useState(format(now, 'yyyy-MM-dd'));
  const [form, setForm] = useState({
    person:          null,
    scheduledDate:   format(now, 'yyyy-MM-dd'),
    scheduledTime:   format(now, 'HH:mm'),
    testTypeId:      '',
    reasonCategory:  DNA_REASONS[0],
    reason:          '',
    notes:           '',
    followUpRequired: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords(await api.getAttendanceRecords({ dateFrom, dateTo })); }
    catch {}
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.scheduledDate) return;
    setSaving(true);
    try {
      await api.createAttendanceRecord({
        personId:        form.person?.PersonID || null,
        personName:      form.person?.FullName  || '',
        scheduledDate:   form.scheduledDate,
        scheduledTime:   form.scheduledTime,
        testTypeId:      form.testTypeId || null,
        reasonCategory:  form.reasonCategory,
        reason:          form.reason,
        notes:           form.notes,
        followUpRequired: form.followUpRequired,
      });
      setForm(f => ({
        ...f, person: null, reason: '', notes: '', followUpRequired: false,
        scheduledDate: format(new Date(), 'yyyy-MM-dd'),
        scheduledTime: format(new Date(), 'HH:mm'),
      }));
      load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this record?')) return;
    await api.deleteAttendanceRecord(id);
    load();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Record form */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <UserX size={16} className="text-red-500" /> Record DNA Event
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Person</label>
          <PersonSearch value={form.person} onChange={p => setForm(f => ({ ...f, person: p }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled Date</label>
            <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled Time</label>
            <input type="time" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Test Type</label>
          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            value={form.testTypeId} onChange={e => setForm(f => ({ ...f, testTypeId: e.target.value }))}>
            <option value="">— Select —</option>
            {(testTypes || []).filter(t => t.Code !== 'DNA').map(t =>
              <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason Category</label>
          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            value={form.reasonCategory} onChange={e => setForm(f => ({ ...f, reasonCategory: e.target.value }))}>
            {DNA_REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason / Notes</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" rows={2}
            placeholder="Free text reason…"
            value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.followUpRequired}
            onChange={e => setForm(f => ({ ...f, followUpRequired: e.target.checked }))} />
          <span className="text-gray-700">Follow-up required</span>
        </label>

        <button onClick={handleSave} disabled={!form.scheduledDate || saving}
          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Record DNA
        </button>
      </div>

      {/* Log */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-700">DNA Log</span>
          <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={13} className="text-gray-500" />
          </button>
          <span className="ml-auto text-xs text-gray-400">{records.length} records</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No DNA records found</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">FU</th>
                  <th className="px-3 py-2 text-left">Recorded</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.AttendanceID} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium">{r.PersonName || r.personName || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.ScheduledDate}{r.ScheduledTime ? ` ${r.ScheduledTime}` : ''}</td>
                    <td className="px-3 py-2"><span className="bg-red-100 text-red-700 rounded px-1.5 py-0.5">{r.ReasonCategory || r.Status}</span></td>
                    <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{r.Reason || '—'}</td>
                    <td className="px-3 py-2">{r.FollowUpRequired ? <AlertTriangle size={12} className="text-amber-500" /> : '—'}</td>
                    <td className="px-3 py-2 text-gray-400">{r.RecordedAt ? r.RecordedAt.substring(0, 16).replace('T', ' ') : '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleDelete(r.AttendanceID)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TAB 2: Random Generator ──────────────────────────────────────────────────

function RandomGeneratorTab({ employers, workerTypes }) {
  const [mode,       setMode]       = useState('system'); // 'system' | 'csv'
  const [generating, setGenerating] = useState(false);
  const [result,     setResult]     = useState(null);
  const [csvFile,    setCsvFile]    = useState(null);
  const [addingPending, setAddingPending] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    listDate:    format(new Date(), 'yyyy-MM-dd'),
    shift:       'Day',
    count:       10,
    employerId:  '',
    workerTypeId:'',
    notes:       '',
    selectAll:   false,
    csvCount:    '',
  });

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    try {
      let data;
      if (mode === 'csv') {
        if (!csvFile) { alert('Please select a CSV file'); return; }
        data = await api.generateRandomListFromCsv(csvFile, {
          listDate: form.listDate, shift: form.shift,
          ...(form.csvCount ? { count: form.csvCount } : {}),
          notes: form.notes || '',
        });
      } else {
        data = await api.generateRandomList({
          listDate: form.listDate, shift: form.shift, count: form.count,
          ...(form.employerId   ? { employerId:   form.employerId }   : {}),
          ...(form.workerTypeId ? { workerTypeId: form.workerTypeId } : {}),
          notes: form.notes || '',
        });
      }
      setResult(data);
    } catch (e) { alert('Generate failed: ' + e.message); }
    finally { setGenerating(false); }
  }

  async function handleAddToPending() {
    if (!result?.listId) return;
    setAddingPending(true);
    try {
      const r = await api.addRandomListToPending(result.listId);
      alert(`${r.added} person${r.added !== 1 ? 's' : ''} added to pending queue.`);
    } catch (e) { alert(e.message); }
    finally { setAddingPending(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Config panel */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Shuffle size={16} className="text-green-500" /> Random List Generator
        </h3>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {[['system', 'From system persons'], ['csv', 'From CSV upload']].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)}
              className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                mode === v ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'
              }`}>{l}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={form.listDate} onChange={e => setForm(f => ({ ...f, listDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
            <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {mode === 'system' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Number to select</label>
              <input type="number" min={1} max={200}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                value={form.count} onChange={e => setForm(f => ({ ...f, count: parseInt(e.target.value) || 10 }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Company</label>
              <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                value={form.employerId} onChange={e => setForm(f => ({ ...f, employerId: e.target.value }))}>
                <option value="">All companies</option>
                {(employers || []).map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Worker Type</label>
              <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                value={form.workerTypeId} onChange={e => setForm(f => ({ ...f, workerTypeId: e.target.value }))}>
                <option value="">All types</option>
                {(workerTypes || []).map(w => <option key={w.WorkerTypeID} value={w.WorkerTypeID}>{w.Name}</option>)}
              </select>
            </div>
          </>
        )}

        {mode === 'csv' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CSV File (Name, EmployeeNumber, Department…)</label>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => setCsvFile(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  <Upload size={13} /> {csvFile ? csvFile.name : 'Choose CSV…'}
                </button>
                {csvFile && <button onClick={() => setCsvFile(null)} className="text-gray-400 hover:text-red-500"><X size={15} /></button>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Select N random (blank = use all)</label>
              <input type="number" min={1} placeholder="e.g. 15"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                value={form.csvCount} onChange={e => setForm(f => ({ ...f, csvCount: e.target.value }))} />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input type="text" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            placeholder="Optional notes for this list"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <button onClick={handleGenerate} disabled={generating || (mode === 'csv' && !csvFile)}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />}
          Generate List
        </button>
      </div>

      {/* Result */}
      <div className="lg:col-span-3">
        {!result ? (
          <div className="flex flex-col items-center justify-center h-full py-20 bg-white rounded-xl border border-dashed border-gray-200">
            <Shuffle size={36} className="text-gray-200 mb-3" />
            <p className="text-gray-400 font-medium">Configure and generate a random list</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary + actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-gray-900">
                  {result.count || result.selected} persons selected
                  {result.totalInFile && <span className="text-gray-400 font-normal text-sm"> (from {result.totalInFile} in file)</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">List #{result.listId} · {form.listDate} · {form.shift} shift</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => api.openRandomListExcelExport(result.listId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                  <FileSpreadsheet size={13} /> Excel
                </button>
                <button onClick={() => api.openRandomListPdfExport(result.listId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">
                  <Printer size={13} /> Print / PDF
                </button>
                <button onClick={handleAddToPending} disabled={addingPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {addingPending ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                  Add to Pending
                </button>
              </div>
            </div>

            {/* List table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Emp #</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.entries || []).map((e, i) => (
                    <tr key={e.EntryID || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">{e.EmployeeNumber || '—'}</td>
                      <td className="px-3 py-2 font-medium">{e.EmployeeName}</td>
                      <td className="px-3 py-2 text-gray-500">{e.Department || '—'}</td>
                      <td className="px-3 py-2">
                        {e.MatchedPersonID
                          ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={11} /> In system</span>
                          : <span className="text-gray-400">Not matched</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dna',       label: 'DNA Log',         icon: UserX,       color: 'text-red-600' },
  { id: 'random',    label: 'Random Generator', icon: Shuffle,     color: 'text-green-600' },
];

export default function TestingManagement() {
  const navigate = useNavigate();
  const [tab,         setTab]         = useState('dna');
  const [testTypes,   setTestTypes]   = useState([]);
  const [employers,   setEmployers]   = useState([]);
  const [workerTypes, setWorkerTypes] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getTestTypes().catch(() => []),
      api.getEmployers().catch(() => []),
      api.getWorkerTypes ? api.getWorkerTypes().catch(() => []) : Promise.resolve([]),
    ]).then(([tt, emp, wt]) => { setTestTypes(tt); setEmployers(emp); setWorkerTypes(wt); });
  }, []);

  const active = TABS.find(t => t.id === tab);
  const Icon = active?.icon || UserX;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl"><FlaskConical size={24} className="text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Testing Management</h1>
            <p className="text-gray-500 text-sm">DNA log · Random generator</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/scheduling')} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">
            <Calendar size={14} /> Scheduling
          </button>
          <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">
            <BarChart3 size={14} /> Reports
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => {
          const TIcon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <TIcon size={14} className={tab === t.id ? t.color : ''} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dna'    && <DnaTab testTypes={testTypes} />}
      {tab === 'random' && <RandomGeneratorTab employers={employers} workerTypes={workerTypes} />}
    </div>
  );
}
