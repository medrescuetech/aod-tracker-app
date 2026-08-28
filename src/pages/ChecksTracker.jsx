import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Plus, CheckCircle2, AlertTriangle, Clock,
  ChevronDown, ChevronUp, Pencil, Trash2, History, X, Loader2,
  CalendarCheck, RefreshCw, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { format, parseISO } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().split('T')[0];

function statusMeta(status) {
  switch (status) {
    case 'ok':       return { label: 'OK',        color: 'text-green-700  bg-green-50  border-green-200',  dot: 'bg-green-500',  icon: CheckCircle2 };
    case 'due-soon': return { label: 'Due Soon',   color: 'text-amber-700  bg-amber-50  border-amber-200',  dot: 'bg-amber-400',  icon: Clock };
    case 'overdue':  return { label: 'Overdue',    color: 'text-red-700    bg-red-50    border-red-200',    dot: 'bg-red-500',    icon: AlertTriangle };
    default:         return { label: 'Never Done', color: 'text-gray-600   bg-gray-50   border-gray-200',   dot: 'bg-gray-400',   icon: AlertTriangle };
  }
}

function fmtDate(d) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

function freqLabel(days) {
  if (days === 1)  return 'Daily';
  if (days === 7)  return 'Weekly';
  if (days === 14) return 'Fortnightly';
  if (days === 30) return 'Monthly';
  if (days === 90) return 'Quarterly';
  return `Every ${days} days`;
}

const FREQ_OPTIONS = [1, 7, 14, 30, 60, 90, 180, 365];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = statusMeta(status);
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function CheckFormModal({ check, onSave, onClose }) {
  const [form, setForm] = useState({
    name: check?.Name || '',
    description: check?.Description || '',
    frequencyDays: check?.FrequencyDays || 7,
    isActive: check?.IsActive !== 0,
    formUrl: check?.FormUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      if (check) {
        await api.updateCheck(check.CheckID, form);
      } else {
        await api.createCheck(form);
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{check ? 'Edit Check' : 'New Compliance Check'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Sharps bin check"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2} value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional details about this check"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Required Frequency *</label>
            <div className="flex gap-2 flex-wrap">
              {FREQ_OPTIONS.map(d => (
                <button
                  key={d} type="button"
                  onClick={() => set('frequencyDays', d)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    form.frequencyDays === d
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}
                >
                  {freqLabel(d)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number" min="1" max="365"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:ring-2 focus:ring-blue-500"
                value={form.frequencyDays}
                onChange={e => set('frequencyDays', parseInt(e.target.value, 10) || 7)}
              />
              <span className="text-sm text-gray-500">days (custom)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link to Form <span className="text-xs font-normal text-gray-400">(optional — MS Forms, SharePoint, etc.)</span>
            </label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.formUrl} onChange={e => set('formUrl', e.target.value)}
              placeholder="https://forms.office.com/..."
            />
          </div>

          {check && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" className="rounded" checked={form.isActive}
                onChange={e => set('isActive', e.target.checked)}
              />
              <span className="text-sm text-gray-700">Active (show in overview)</span>
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {check ? 'Save Changes' : 'Create Check'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompleteModal({ check, onSave, onClose }) {
  const [form, setForm] = useState({ completedDate: TODAY(), completedBy: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.completedBy.trim()) { setError('Completed by is required'); return; }
    setSaving(true);
    try {
      await api.addCheckCompletion(check.CheckID, form);
      onSave();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Complete Check</h2>
            <p className="text-sm text-gray-500">{check.Name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Completed *</label>
            <input type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={form.completedDate} onChange={e => set('completedDate', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Completed By *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={form.completedBy} onChange={e => set('completedBy', e.target.value)}
              placeholder="Name(s) of person(s) who completed this check"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any observations or follow-up actions"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              <CheckCircle2 size={14} />
              Mark Complete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryPanel({ check, onClose }) {
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCompletions(await api.getCheckCompletions(check.CheckID)); }
    catch {}
    finally { setLoading(false); }
  }, [check.CheckID]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(cid) {
    if (!window.confirm('Remove this completion entry?')) return;
    await api.deleteCheckCompletion(check.CheckID, cid);
    load();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Completion History</h2>
            <p className="text-sm text-gray-500">{check.Name} · {freqLabel(check.FrequencyDays)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : completions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No completions recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {completions.map(c => (
                <li key={c.CompletionID} className="flex items-start justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <CalendarCheck size={14} className="text-green-500 flex-shrink-0" />
                      {fmtDate(c.CompletedDate)}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">By: {c.CompletedBy}</div>
                    {c.Notes && <div className="text-xs text-gray-400 mt-0.5">{c.Notes}</div>}
                  </div>
                  <button onClick={() => handleDelete(c.CompletionID)}
                    className="text-gray-300 hover:text-red-500 transition-colors ml-3 mt-0.5 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-6 py-3 border-t">
          <button onClick={onClose}
            className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Check Row ────────────────────────────────────────────────────────────────

function CheckRow({ check, onComplete, onEdit, onDelete, onHistory }) {
  const m = statusMeta(check.status);
  const Icon = m.icon;
  return (
    <div className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${
      check.IsActive === 0 ? 'opacity-50' : ''
    }`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-1.5 ${
          check.status === 'ok'       ? 'bg-green-100 text-green-600' :
          check.status === 'due-soon' ? 'bg-amber-100 text-amber-600' :
          check.status === 'overdue'  ? 'bg-red-100   text-red-600'   :
                                        'bg-gray-100  text-gray-500'
        }`}>
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{check.Name}</span>
            <StatusBadge status={check.status} />
            {check.IsActive === 0 && (
              <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>
            )}
          </div>

          {check.Description && (
            <p className="text-xs text-gray-500 mt-0.5">{check.Description}</p>
          )}

          {check.FormUrl && (
            <a
              href={check.FormUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              <ExternalLink size={11} /> Open Form
            </a>
          )}

          <div className="flex gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
            <span>🔁 {freqLabel(check.FrequencyDays)}</span>
            {check.lastCompletion ? (
              <>
                <span>Last: {fmtDate(check.lastCompletion.CompletedDate)} by {check.lastCompletion.CompletedBy}</span>
                <span>Due: {fmtDate(check.dueDate)}</span>
                {check.daysSinceLast !== null && (
                  <span className={check.status === 'overdue' ? 'text-red-500 font-medium' : ''}>
                    {check.daysSinceLast === 0 ? 'Done today' : `${check.daysSinceLast}d ago`}
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-600 font-medium">Never completed</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {check.IsActive !== 0 && (
            <button onClick={() => onComplete(check)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 font-medium">
              <CheckCircle2 size={13} /> Complete
            </button>
          )}
          <button onClick={() => onHistory(check)}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
            title="View history">
            <History size={16} />
          </button>
          <button onClick={() => onEdit(check)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(check)}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
            title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTERS = ['all', 'overdue', 'due-soon', 'ok', 'never'];

export default function ChecksTracker() {
  const [checks,  setChecks]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const [modal,    setModal]    = useState(null); // 'create' | 'edit' | 'complete' | 'history'
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setChecks(await api.getChecks()); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Summary counts
  const counts = { overdue: 0, 'due-soon': 0, ok: 0, never: 0 };
  checks.filter(c => c.IsActive !== 0).forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

  const visible = checks.filter(c => {
    if (!showInactive && c.IsActive === 0) return false;
    if (filter !== 'all' && c.status !== filter) return false;
    return true;
  });

  function openComplete(check) { setSelected(check); setModal('complete'); }
  function openEdit(check)     { setSelected(check); setModal('edit'); }
  function openHistory(check)  { setSelected(check); setModal('history'); }
  function openCreate()        { setSelected(null);  setModal('create'); }
  function closeModal()        { setModal(null); setSelected(null); }

  async function handleSave() { closeModal(); await load(); }

  async function handleDelete(check) {
    if (!window.confirm(`Delete "${check.Name}" and all its completion history?`)) return;
    await api.deleteCheck(check.CheckID);
    load();
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl"><ClipboardCheck size={24} className="text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Checks</h1>
            <p className="text-gray-500 text-sm">Track recurring checks and their completion status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">
            <Plus size={16} /> New Check
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { key: 'overdue',  label: 'Overdue',   bg: 'bg-red-50   border-red-200',   text: 'text-red-700',   num: 'text-red-600' },
          { key: 'due-soon', label: 'Due Soon',   bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', num: 'text-amber-600' },
          { key: 'ok',       label: 'On Track',   bg: 'bg-green-50 border-green-200', text: 'text-green-700', num: 'text-green-600' },
          { key: 'never',    label: 'Never Done', bg: 'bg-gray-50  border-gray-200',  text: 'text-gray-600',  num: 'text-gray-600' },
        ].map(({ key, label, bg, text, num }) => (
          <button key={key}
            onClick={() => setFilter(f => f === key ? 'all' : key)}
            className={`rounded-xl border p-3 text-left transition-all ${bg} ${
              filter === key ? 'ring-2 ring-blue-400' : 'hover:shadow-sm'
            }`}>
            <div className={`text-2xl font-bold ${num}`}>{counts[key] || 0}</div>
            <div className={`text-xs font-medium ${text}`}>{label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-blue-300 bg-white'
              }`}>
              {f === 'all' ? 'All' : f === 'due-soon' ? 'Due Soon' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
          <input type="checkbox" className="rounded"
            checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {/* Check list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-400" size={28} /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardCheck size={40} className="mx-auto mb-3 opacity-30" />
          {checks.length === 0
            ? <><p className="font-medium">No checks defined yet</p><p className="text-sm">Click "New Check" to create your first compliance check</p></>
            : <p>No checks match the current filter</p>
          }
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(c => (
            <CheckRow key={c.CheckID} check={c}
              onComplete={openComplete}
              onEdit={openEdit}
              onHistory={openHistory}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(modal === 'create' || modal === 'edit') && (
        <CheckFormModal check={modal === 'edit' ? selected : null} onSave={handleSave} onClose={closeModal} />
      )}
      {modal === 'complete' && selected && (
        <CompleteModal check={selected} onSave={handleSave} onClose={closeModal} />
      )}
      {modal === 'history' && selected && (
        <HistoryPanel check={selected} onClose={closeModal} />
      )}
    </div>
  );
}
