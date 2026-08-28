import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Shuffle, Loader2, CheckCircle, XCircle, Clock, Upload, FileText, AlertCircle, FileUp, FlaskConical, Trash2, Plus, Undo2, X, Link, Edit, Check } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';

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

const statusIcon = (status) => {
  if (status === 'Completed' || status === 'Tested') return <CheckCircle className="w-5 h-5 text-green-600" />;
  if (status === 'DNA') return <XCircle className="w-5 h-5 text-red-600" />;
  return <Clock className="w-5 h-5 text-amber-600" />;
};

const statusBg = (status) => {
  if (status === 'Completed' || status === 'Tested') return 'bg-green-100';
  if (status === 'DNA') return 'bg-red-100';
  return 'bg-amber-100';
};

const statusBadge = (status) => {
  if (status === 'Completed' || status === 'Tested') return 'bg-green-100 text-green-700';
  if (status === 'DNA') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

// ─── Pending Tests inline panel ───────────────────────────────────────────────
function PendingTestsPanel({ testTypes }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persons, setPersons] = useState([]);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const searchRef = useRef(null);
  const [form, setForm] = useState({
    personId: '', personName: '',
    scheduledDate: format(new Date(), 'yyyy-MM-dd'),
    scheduledTime: '', testTypeId: '', notes: '',
  });
  const [editingScheduled, setEditingScheduled] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPending(await api.getScheduledTests({ status: 'Scheduled' })); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getPersons().then(setPersons).catch(() => {}); }, []);

  const handleSearch = (val) => {
    setSearch(val);
    setForm(f => ({ ...f, personId: '', personName: '' }));
    if (val.length >= 2) {
      setSuggestions(persons.filter(p => nameMatchesSearch(p.FullName, val)).slice(0, 8));
    } else { setSuggestions([]); }
  };

  const selectPerson = (p) => {
    setForm(f => ({ ...f, personId: p.PersonID, personName: p.FullName }));
    setSearch(p.FullName);
    setSuggestions([]);
  };

  const handleAdd = async () => {
    if (!form.personId || !form.scheduledDate) return;
    setSaving(true);
    try {
      await api.createScheduledTest({
        personId: form.personId, scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime || null,
        testTypeId: form.testTypeId || null, notes: form.notes,
      });
      setForm(f => ({ ...f, personId: '', personName: '', scheduledTime: '', notes: '' }));
      setSearch('');
      load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleStatus = async (id, status) => {
    await api.updateScheduledTest(id, { status });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this pending test?')) return;
    await api.deleteScheduledTest(id);
    load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Add form */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <FlaskConical size={16} className="text-blue-500" /> Add Pending Test
        </h3>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 mb-1">Person *</label>
          <input ref={searchRef} value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map(p => (
                <button key={p.PersonID} onClick={() => selectPerson(p)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0">
                  <span className="font-medium">{p.FullName}</span>
                </button>
              ))}
            </div>
          )}
          {form.personId && <p className="text-xs text-green-600 mt-1">✓ Person selected</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input type="date" value={form.scheduledDate}
              onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
            <input type="time" value={form.scheduledTime}
              onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Test Type</label>
          <select value={form.testTypeId} onChange={e => setForm(f => ({ ...f, testTypeId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">— Not specified —</option>
            {testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" rows={2} />
        </div>
        <button onClick={handleAdd} disabled={!form.personId || !form.scheduledDate || saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add to Queue
        </button>
      </div>

      {/* List */}
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Upcoming Scheduled Tests</span>
          <span className="text-xs text-gray-400">{pending.length} pending</span>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>
          ) : pending.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No pending tests scheduled</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((t, i) => (
                  <tr key={t.ScheduleID} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{t.PersonName}</p>
                      <p className="text-sm text-gray-500">{t.EmployerName}</p>
                      {t.TestNumber && <p className="text-xs font-mono text-blue-600">{t.TestNumber}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.ScheduledDate}{t.ScheduledTime ? ` ${t.ScheduledTime}` : ''}
                    </td>
                    <td className="px-3 py-2">{t.TestTypeName || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => navigate('/new-test', { state: { fromSchedule: t, returnDate: t.ScheduledDate } })}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs">
                          <FlaskConical size={10} /> Test
                        </button>
                        <button onClick={() => handleStatus(t.ScheduleID, 'Completed')}
                          className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs">
                          <Check size={10} /> Done
                        </button>
                        <button onClick={() => handleStatus(t.ScheduleID, 'DNA')}
                          className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs">
                          DNA
                        </button>
                        <button
                          onClick={() => setEditingScheduled({ ...t })}
                          className="p-1 text-gray-300 hover:text-blue-500"
                          title="Edit"
                        >
                          <Edit size={12} />
                        </button>
                        <button onClick={() => handleDelete(t.ScheduleID)}
                          className="p-1 text-gray-300 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {editingScheduled && (
        <EditScheduledModal
          scheduled={editingScheduled}
          testTypes={testTypes}
          onClose={() => setEditingScheduled(null)}
          onComplete={() => { setEditingScheduled(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Main Scheduling page ──────────────────────────────────────────────────────
const Scheduling = () => {
  const { lookups, hideBadgeNumber } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('daily');
  const [scheduled, setScheduled] = useState([]);
  const [importedEntries, setImportedEntries] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditImportedModal, setShowEditImportedModal] = useState(false);
  const [showEditScheduledModal, setShowEditScheduledModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingScheduled, setEditingScheduled] = useState(null);
  const [testTypes, setTestTypes] = useState([]);

  useEffect(() => {
    api.getTestTypes().then(setTestTypes).catch(() => {});
  }, []);

  useEffect(() => { if (activeTab === 'daily') loadData(); }, [selectedDate, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [schedData, empData, importData] = await Promise.all([
        api.getScheduledTests({ date: selectedDate }),
        api.getEmployers(),
        api.getRandomListEntriesForDate(selectedDate)
      ]);
      setScheduled(schedData);
      setEmployers(empData);
      setImportedEntries(importData || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (scheduleId, status, notes = '') => {
    try {
      await api.updateScheduledTest(scheduleId, { status, notes });
      await loadData();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const handleUpdateEntryStatus = async (entryId, status) => {
    try {
      await api.updateRandomListEntry(entryId, { status });
      await loadData();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const handleDeleteScheduled = async (scheduleId) => {
    if (!confirm('Delete this scheduled entry?')) return;
    try {
      await api.deleteScheduledTest(scheduleId);
      await loadData();
    } catch (err) { alert('Failed to delete: ' + err.message); }
  };

  const handleUndoDNA = async (scheduleId) => {
    try {
      await api.updateScheduledTest(scheduleId, { status: 'Scheduled', notes: '' });
      await loadData();
    } catch (err) { alert('Failed to undo: ' + err.message); }
  };

  const handleUndoEntryDNA = async (entryId) => {
    try {
      await api.updateRandomListEntry(entryId, { status: 'Pending' });
      await loadData();
    } catch (err) { alert('Failed to undo: ' + err.message); }
  };

  const handleEditImportedEntry = (entry) => {
    setEditingEntry(entry);
    setShowEditImportedModal(true);
  };

  const handleEditScheduled = (sched) => {
    setEditingScheduled(sched);
    setShowEditScheduledModal(true);
  };

  const scheduledPending = scheduled.filter(s => s.Status === 'Scheduled').length;
  const scheduledDone = scheduled.filter(s => s.Status === 'Completed').length;
  const scheduledDNA = scheduled.filter(s => s.Status === 'DNA').length;

  const importedPending = importedEntries.filter(e => e.Status === 'Pending').length;
  const importedTested = importedEntries.filter(e => e.Status === 'Tested').length;
  const importedDNA = importedEntries.filter(e => e.Status === 'DNA').length;

  const totalPending = scheduledPending + importedPending;
  const totalDone = scheduledDone + importedTested;
  const totalDNA = scheduledDNA + importedDNA;

  // Group imported entries by shift
  const shiftGroups = importedEntries.reduce((acc, e) => {
    const key = e.Shift || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Test Scheduling</h1>
          <p className="text-gray-500">Daily schedule · Pending tests · Random selection</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/testing')} className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">
            <Link className="w-4 h-4" /> Testing Mgmt
          </button>
          {activeTab === 'daily' && (
            <>
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                <Plus className="w-4 h-4" /> Add Manual
              </button>
              <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Upload className="w-4 h-4" /> Import PDF List
              </button>
              <button onClick={() => setShowRandomModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Shuffle className="w-4 h-4" /> Random Selection
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {[['daily', Calendar, 'Daily Schedule'], ['pending', FlaskConical, 'Scheduled Tests']].map(([id, Icon, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} className={activeTab === id ? (id === 'daily' ? 'text-amber-500' : 'text-blue-500') : ''} />
            {label}
          </button>
        ))}
      </div>

      {/* Pending Tests tab */}
      {activeTab === 'pending' && <PendingTestsPanel testTypes={testTypes} />}

      {/* Daily Schedule tab */}
      {activeTab === 'daily' && (<>
      {/* Date Selector & Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div className="flex gap-6">
            <div className="text-center"><p className="text-2xl font-bold text-amber-600">{totalPending}</p><p className="text-xs text-gray-500">Pending</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-green-600">{totalDone}</p><p className="text-xs text-gray-500">Completed</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-red-600">{totalDNA}</p><p className="text-xs text-gray-500">DNA</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-gray-700">{scheduled.length + importedEntries.length}</p><p className="text-xs text-gray-500">Total</p></div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
      ) : (
        <>
          {/* Imported PDF List entries */}
          {importedEntries.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
              <div className="p-4 border-b flex items-center gap-2">
                <FileUp className="w-5 h-5 text-blue-600" />
                <h2 className="font-semibold">Imported Random List — {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}</h2>
                <span className="ml-auto text-sm text-gray-500">{importedEntries.length} people</span>
              </div>
              {Object.entries(shiftGroups).map(([shift, entries]) => (
                <div key={shift}>
                  {Object.keys(shiftGroups).length > 1 && (
                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">{shift} Shift</div>
                  )}
                  <div className="divide-y">
                    {entries.map(e => (
                      <div key={e.EntryID} className="p-4 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${statusBg(e.Status)}`}>
                            {statusIcon(e.Status)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{e.DisplayName || e.EmployeeName}</p>
                            <p className="text-sm text-gray-500">
                              {e.MatchedEmployerName || e.DefaultEmployerName || '—'}
                              {!hideBadgeNumber && e.MatchedBadge && ` • #${e.MatchedBadge}`}
                              {e.MatchedPersonID && <span className="ml-2 text-xs text-green-600">✓ Matched</span>}
                            </p>
                            {(e.Department || e.Position) && (
                              <p className="text-xs text-gray-400">
                                {[e.Department, e.Position].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {e.TestNumber && <p className="text-xs font-mono text-blue-600">Test: {e.TestNumber}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded font-medium ${statusBadge(e.Status)}`}>{e.Status}</span>
                          {/* Edit button for all statuses */}
                          <button
                            onClick={() => handleEditImportedEntry(e)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit entry"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {(e.Status === 'Pending' || e.Status === 'Scheduled') && (
                            <>
                              <button
                                onClick={() => navigate('/new-test', { state: { fromEntry: e, returnDate: selectedDate } })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                                <FlaskConical className="w-3.5 h-3.5" /> Run Test
                              </button>
                              <button onClick={() => handleUpdateEntryStatus(e.EntryID, 'DNA')} className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200">DNA</button>
                            </>
                          )}
                          {e.Status === 'DNA' && (
                            <button onClick={() => handleUndoEntryDNA(e.EntryID)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200" title="Undo DNA">
                              <Undo2 className="w-3.5 h-3.5" /> Undo
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual Scheduled Tests */}
          {scheduled.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
              <div className="p-4 border-b"><h2 className="font-semibold">System Scheduled Tests</h2></div>
              <div className="divide-y">
                {scheduled.map(s => (
                  <div key={s.ScheduleID} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${statusBg(s.Status)}`}>
                        {statusIcon(s.Status)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{s.PersonName}</p>
                        <p className="text-sm text-gray-500">{s.EmployerName}{!hideBadgeNumber && s.BadgeNumber ? ` • ${s.BadgeNumber}` : ''}</p>
                        {s.TestNumber && <p className="text-xs font-mono text-blue-600 mt-0.5">{s.TestNumber}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${statusBadge(s.Status)}`}>{s.Status}</span>
                      {/* Edit button for all statuses */}
                      <button
                        onClick={() => handleEditScheduled(s)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit scheduled test"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {s.Status === 'Scheduled' && (
                        <>
                          <button
                            onClick={() => navigate('/new-test', { state: { fromSchedule: s, returnDate: selectedDate } })}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                            <FlaskConical className="w-3.5 h-3.5" /> Run Test
                          </button>
                          <button onClick={() => handleUpdateStatus(s.ScheduleID, 'Completed')} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">Complete</button>
                          <button onClick={() => handleUpdateStatus(s.ScheduleID, 'DNA', 'Did not attend')} className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200">DNA</button>
                          <button onClick={() => handleDeleteScheduled(s.ScheduleID)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {s.Status === 'DNA' && (
                        <>
                          <button onClick={() => handleUndoDNA(s.ScheduleID)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200" title="Undo DNA">
                            <Undo2 className="w-3.5 h-3.5" /> Undo
                          </button>
                          <button onClick={() => handleDeleteScheduled(s.ScheduleID)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {importedEntries.length === 0 && scheduled.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">Nothing scheduled for this date</p>
              <p className="text-sm mt-1 mb-4">Import a PDF list or create a random selection</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  <Upload className="w-4 h-4" /> Import PDF List
                </button>
                <button onClick={() => setShowRandomModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <Shuffle className="w-4 h-4" /> Random Selection
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </>)}

      {showRandomModal && (
        <RandomSelectionModal employers={employers} workerTypes={lookups.workerTypes} onClose={() => setShowRandomModal(false)} onComplete={() => { loadData(); setShowRandomModal(false); }} />
      )}

      {showImportModal && (
        <ImportPDFModal
          employers={employers}
          testTypes={lookups?.testTypes || []}
          onClose={() => setShowImportModal(false)}
          onComplete={() => { loadData(); setShowImportModal(false); }}
        />
      )}

      {showAddModal && (
        <ManualAddModal
          selectedDate={selectedDate}
          testTypes={testTypes}
          onClose={() => setShowAddModal(false)}
          onComplete={() => { loadData(); setShowAddModal(false); }}
        />
      )}

      {showEditImportedModal && editingEntry && (
        <EditImportedEntryModal
          entry={editingEntry}
          employers={employers}
          onClose={() => { setShowEditImportedModal(false); setEditingEntry(null); }}
          onComplete={() => { loadData(); setShowEditImportedModal(false); setEditingEntry(null); }}
        />
      )}

      {showEditScheduledModal && editingScheduled && (
        <EditScheduledModal
          scheduled={editingScheduled}
          testTypes={testTypes}
          onClose={() => { setShowEditScheduledModal(false); setEditingScheduled(null); }}
          onComplete={() => { loadData(); setShowEditScheduledModal(false); setEditingScheduled(null); }}
        />
      )}
    </div>
  );
};

const RandomSelectionModal = ({ employers, workerTypes, onClose, onComplete }) => {
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), count: 10, employerId: '', workerTypeId: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await api.createRandomSelection(form);
      setResult(data);
    } catch (err) {
      alert('Failed to generate: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-4 border-b"><h2 className="text-lg font-semibold">Random Selection</h2></div>
        
        {!result ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number to Select</label>
              <input type="number" value={form.count} onChange={(e) => setForm({...form, count: parseInt(e.target.value) || 1})} min="1" max="100" className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employer (optional)</label>
              <select value={form.employerId} onChange={(e) => setForm({...form, employerId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">All Employers</option>
                {employers.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patient Type (optional)</label>
              <select value={form.workerTypeId} onChange={(e) => setForm({...form, workerTypeId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">All Types</option>
                {workerTypes.map(wt => <option key={wt.WorkerTypeID} value={wt.WorkerTypeID}>{wt.Name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleGenerate} disabled={loading} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg disabled:bg-green-400">
                {loading ? 'Generating...' : 'Generate Selection'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-gray-900">{result.count} donors selected</p>
              <p className="text-sm text-gray-500">Batch ID: {result.batchId}</p>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
              {result.scheduled.map((s, i) => (
                <div key={i} className="p-2 text-sm">{i+1}. {s.fullName}</div>
              ))}
            </div>
            <button onClick={onComplete} className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Done</button>
          </div>
        )}
      </div>
    </div>
  );
};

const ImportPDFModal = ({ onClose, onComplete, employers = [], testTypes = [] }) => {
  const [file, setFile] = useState(null);
  const [listDate, setListDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shift, setShift] = useState('Day');
  const [employerId, setEmployerId] = useState('');
  const [testTypeId, setTestTypeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') {
      setFile(f);
      setError('');
    } else {
      setError('Please select a PDF file');
      setFile(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a PDF file');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.importRandomListPDF(file, listDate, shift, employerId || null, testTypeId || null);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Import Random Test List (PDF)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        {!result ? (
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600">
              Upload a PDF containing the random test list you received. The system will extract names and match them to existing patients/donors.
            </p>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer">
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <FileText className="w-8 h-8" />
                    <span className="font-medium">{file.name}</span>
                  </div>
                ) : (
                  <div className="text-gray-500">
                    <Upload className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>Click to select PDF file</p>
                    <p className="text-xs mt-1">or drag and drop</p>
                  </div>
                )}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">List Date</label>
                <input
                  type="date"
                  value={listDate}
                  onChange={(e) => setListDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                  <option value="Swing">Swing</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employer <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={employerId}
                  onChange={(e) => setEmployerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">All / from PDF</option>
                  {employers.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Type <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={testTypeId}
                  onChange={(e) => setTestTypeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">Not specified</option>
                  {testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={loading || !file}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 hover:bg-blue-700"
              >
                {loading ? 'Importing...' : 'Import List'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 flex-1 overflow-auto">
            <div className="text-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-gray-900">Import Complete</p>
              <p className="text-sm text-gray-500">
                {result.entriesCount} entries imported for {listDate}
              </p>
            </div>

            <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
              {result.entries?.map((entry, i) => (
                <div key={i} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{entry.employeeName}</p>
                    <p className="text-gray-500 text-xs">{entry.department} {entry.position ? `• ${entry.position}` : ''}</p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700">Pending</span>
                </div>
              ))}
            </div>

            <button onClick={onComplete} className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              View Schedule
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ManualAddModal = ({ selectedDate, testTypes, onClose, onComplete }) => {
  const [persons, setPersons] = useState([]);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [form, setForm] = useState({
    personId: '',
    scheduledDate: selectedDate,
    scheduledTime: '',
    testTypeId: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPersons().then(setPersons).catch(() => {});
  }, []);

  const handleSearch = (val) => {
    setSearch(val);
    setForm(f => ({ ...f, personId: '' }));
    if (val.length >= 2) {
      const m = persons.filter(p => nameMatchesSearch(p.FullName, val)).slice(0, 8);
      setSuggestions(m);
    } else { setSuggestions([]); }
  };

  const selectPerson = (p) => {
    setForm(f => ({ ...f, personId: p.PersonID }));
    setSearch(p.FullName);
    setSuggestions([]);
  };

  const handleSave = async () => {
    if (!form.personId) { alert('Please select a person'); return; }
    setSaving(true);
    try {
      await api.createScheduledTest(form);
      onComplete();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Add Manual Scheduled Test</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Person *</label>
            <input
              value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map(p => (
                  <button key={p.PersonID} onClick={() => selectPerson(p)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.FullName}</span>
                  </button>
                ))}
              </div>
            )}
            {form.personId && <p className="text-xs text-green-600 mt-1">Person selected</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({...f, scheduledDate: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({...f, scheduledTime: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Test Type</label>
            <select value={form.testTypeId} onChange={e => setForm(f => ({...f, testTypeId: e.target.value}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Not specified</option>
              {testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.personId}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 hover:bg-blue-700">
              {saving ? 'Saving...' : 'Schedule Test'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditImportedEntryModal = ({ entry, employers, onClose, onComplete }) => {
  const [form, setForm] = useState({
    employeeName: entry.EmployeeName || '',
    department: entry.Department || '',
    position: entry.Position || '',
    matchedPersonId: entry.MatchedPersonID || '',
    matchedEmployerId: entry.ResolvedEmployerID || ''
  });
  const [persons, setPersons] = useState([]);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPersons().then(setPersons).catch(() => {});
    // Set initial search text if person is matched
    if (entry.MatchedPersonID && entry.MatchedPersonName) {
      setSearch(entry.MatchedPersonName);
    }
  }, [entry]);

  const handleSearch = (val) => {
    setSearch(val);
    if (val.length >= 2) {
      const m = persons.filter(p => nameMatchesSearch(p.FullName, val)).slice(0, 8);
      setSuggestions(m);
    } else { setSuggestions([]); }
  };

  const selectPerson = (p) => {
    setForm(f => ({ ...f, matchedPersonId: p.PersonID, matchedEmployerId: p.EmployerID || '' }));
    setSearch(p.FullName);
    setSuggestions([]);
  };

  const clearMatch = () => {
    setForm(f => ({ ...f, matchedPersonId: '', matchedEmployerId: '' }));
    setSearch('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.editRandomListEntry(entry.EntryID, {
        employeeName: form.employeeName,
        department: form.department,
        position: form.position,
        matchedPersonId: form.matchedPersonId || null,
        matchedEmployerId: form.matchedEmployerId || null
      });
      onComplete();
    } catch (err) { alert('Failed to save: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this imported entry?')) return;
    setSaving(true);
    try {
      await api.deleteRandomListEntry(entry.EntryID);
      onComplete();
    } catch (err) { alert('Failed to delete: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Edit Imported Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Person Matching */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Match to Person</label>
            <div className="flex gap-2">
              <input
                value={search} onChange={e => handleSearch(e.target.value)}
                placeholder="Search by name..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              {form.matchedPersonId && (
                <button onClick={clearMatch} className="px-3 py-2 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50">
                  Clear
                </button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map(p => (
                  <button key={p.PersonID} onClick={() => selectPerson(p)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.FullName}</span>
                    {p.BadgeNumber && <span className="text-gray-400 ml-2">#{p.BadgeNumber}</span>}
                  </button>
                ))}
              </div>
            )}
            {form.matchedPersonId && <p className="text-xs text-green-600 mt-1">✓ Matched to system person</p>}
          </div>

          {/* Name from PDF */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-xs font-normal text-gray-400">(as extracted from PDF)</span></label>
            <input
              value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          {/* PDF metadata — Department / Position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-xs font-normal text-gray-400">(from PDF)</span></label>
              <input
                value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position <span className="text-xs font-normal text-gray-400">(from PDF)</span></label>
              <input
                value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Employer Override (if person matched, this auto-fills) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
            <select
              value={form.matchedEmployerId} onChange={e => setForm(f => ({ ...f, matchedEmployerId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Not specified</option>
              {employers.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleDelete} disabled={saving}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
              Delete
            </button>
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 hover:bg-blue-700">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditScheduledModal = ({ scheduled, testTypes, onClose, onComplete }) => {
  const originalDate = scheduled.ScheduledDate || '';
  const plainNotes = (scheduled.Notes || '').split('\n').filter(l => !/^\[\d{4}-\d{2}-\d{2}/.test(l)).join('\n').trim();
  const [form, setForm] = useState({
    scheduledDate: scheduled.ScheduledDate || '',
    scheduledTime: scheduled.ScheduledTime || '',
    testTypeId: scheduled.TestTypeID || '',
    notes: plainNotes,
    changeReason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dateChanged = form.scheduledDate !== originalDate;

  const handleSave = async () => {
    setError('');
    if (dateChanged && !form.changeReason.trim()) {
      setError('You must provide a reason for changing the scheduled date.');
      return;
    }
    setSaving(true);
    try {
      await api.updateScheduledTest(scheduled.ScheduleID, {
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime,
        testTypeId: form.testTypeId,
        notes: form.notes,
        changeReason: dateChanged ? form.changeReason : undefined,
      });
      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  // Audit history lines from Notes
  const historyLines = (scheduled.Notes || '').split('\n').filter(l => /^\[\d{4}-\d{2}-\d{2}/.test(l));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Edit Scheduled Test</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Person info */}
          <div>
            <p className="font-medium text-gray-900">{scheduled.PersonName}</p>
            <p className="text-sm text-gray-500">{scheduled.EmployerName}{!hideBadgeNumber && scheduled.BadgeNumber ? ` • ${scheduled.BadgeNumber}` : ''}</p>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
                {dateChanged && (
                  <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    was {originalDate}
                  </span>
                )}
              </label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={e => { setError(''); setForm(f => ({ ...f, scheduledDate: e.target.value })); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${dateChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={form.scheduledTime}
                onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Reason for date change — shown + required only when date differs */}
          {dateChanged && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <label className="block text-sm font-semibold text-amber-800">
                Reason for date change <span className="text-red-500">*</span>
              </label>
              <textarea
                autoFocus
                value={form.changeReason}
                onChange={e => { setError(''); setForm(f => ({ ...f, changeReason: e.target.value })); }}
                placeholder="e.g. Worker unavailable — rescheduled to next available slot"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white resize-none"
                rows={2}
              />
              <p className="text-xs text-amber-700">This reason will be recorded in the audit trail.</p>
            </div>
          )}

          {/* Test type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Test Type</label>
            <select
              value={form.testTypeId}
              onChange={e => setForm(f => ({ ...f, testTypeId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Not specified</option>
              {testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
            </select>
          </div>

          {/* Notes (plain, non-audit lines) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
              rows={2}
              placeholder="Optional notes"
            />
          </div>

          {/* Reschedule history */}
          {historyLines.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Reschedule History</p>
              <div className="space-y-1">
                {historyLines.map((l, i) => (
                  <p key={i} className="text-xs text-gray-600 font-mono">{l}</p>
                ))}
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 hover:bg-blue-700 text-sm font-medium">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scheduling;
