import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, Search, AlertTriangle, Clock, Edit2, Trash2, X, Users, Award, UserCheck, ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import ESOReport from './ESOReport';

const API_BASE = '/api';

const TRAINING_TYPES = ['CPD', 'Competency', 'Drill', 'Course', 'Attendance'];

const TRAINING_CATEGORIES = ['MEDICAL', 'RESCUE'];

const TRAINING_PACKAGES = ['HLT', 'PUA', 'RII', 'N/A'];

const TYPE_COLORS = {
  CPD:        { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  Competency: { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
  Drill:      { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
  Course:     { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  Attendance: { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-200' },
};

const expiryStatus = (expiryDate) => {
  if (!expiryDate) return null;
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)  return { label: 'Overdue',      color: 'text-red-600',   bg: 'bg-red-50 border-red-200' };
  if (days <= 30) return { label: `${days}d`,     color: 'text-red-500',   bg: 'bg-red-50 border-red-200' };
  if (days <= 60) return { label: `${days}d`,     color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
  return { label: format(parseISO(expiryDate), 'dd/MM/yy'), color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
};

const buildUnitsByPackage = (units) => {
  const grouped = {};
  for (const pkg of TRAINING_PACKAGES) grouped[pkg] = [];
  for (const u of units) {
    if (grouped[u.TrainingPackage] !== undefined) grouped[u.TrainingPackage].push(u.Name);
  }
  return grouped;
};

const detectPackageFromUnits = (unitName, units) => {
  if (!unitName) return '';
  const match = units.find(u => u.Name === unitName);
  return match?.TrainingPackage || '';
};

const emptyForm = () => ({
  trainingDate: format(new Date(), 'yyyy-MM-dd'),
  trainingType: 'CPD',
  title: '',
  category: 'MEDICAL',
  competencyUnit: '',
  secondaryUnit: '',
  trainingPackage: '',
  cpdType: '',
  disciplines: '',
  trainerId: '',
  attendeeIds: [],
  hours: '',
  durationMinutes: '',
  expiryDate: '',
  passed: true,
  interactive: 'Yes',
  clinicalVsNonClinical: 'Clinical',
  trainerVerification: false,
  learningOutcome: '',
  notes: '',
});

// ── AttendeePicker ──────────────────────────────────────────────────────────────
const AttendeePicker = ({ people, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = selectedIds.map(id => people.find(p => p.TrainerID === id)).filter(Boolean);

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm text-left">
        <span className={selected.length ? 'text-gray-900' : 'text-gray-400'}>
          {selected.length ? selected.map(p => p.Name).join(', ') : 'Select attendees...'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {people.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No people found. Add them in the People tab.</p>}
          {people.map(p => (
            <label key={p.TrainerID}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selectedIds.includes(p.TrainerID)}
                onChange={() => toggle(p.TrainerID)} className="w-4 h-4 accent-blue-600" />
              <span className="flex-1 truncate">{p.Name}</span>
              {p.IsTrainer ? (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Trainer</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Manage Units tab ───────────────────────────────────────────────────────────
const UNIT_PACKAGES = ['HLT', 'PUA', 'RII', 'N/A'];

const ManageUnitsTab = () => {
  const [units, setUnits]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editUnit, setEditUnit]   = useState(null);
  const [form, setForm]           = useState({ code: '', name: '', trainingPackage: 'HLT', category: '', isActive: 1 });
  const [saving, setSaving]       = useState(false);
  const [filterPkg, setFilterPkg] = useState('');
  const [search, setSearch]       = useState('');
  const [error, setError]         = useState('');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API_BASE}/training-units`);
    setUnits(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUnit(null);
    setForm({ code: '', name: '', trainingPackage: 'HLT', category: '', isActive: 1 });
    setError('');
    setShowForm(true);
  };
  const openEdit = (u) => {
    setEditUnit(u);
    setForm({ code: u.Code || '', name: u.Name, trainingPackage: u.TrainingPackage, category: u.Category || '', isActive: u.IsActive });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { code: form.code, name: form.name.trim(), trainingPackage: form.trainingPackage, category: form.category || null, isActive: form.isActive };
      const url = editUnit ? `${API_BASE}/training-units/${editUnit.TrainingUnitID}` : `${API_BASE}/training-units`;
      const method = editUnit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Save failed'); return; }
      setShowForm(false);
      load();
    } catch (err) { setError('Save failed: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (u) => {
    if (!confirm(`Delete "${u.Name}"? This cannot be undone.`)) return;
    await fetch(`${API_BASE}/training-units/${u.TrainingUnitID}`, { method: 'DELETE' });
    load();
  };

  const filtered = units.filter(u => {
    if (filterPkg && u.TrainingPackage !== filterPkg) return false;
    if (search && !u.Name.toLowerCase().includes(search.toLowerCase()) && !(u.Code || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pkgColors = { HLT: 'bg-blue-100 text-blue-700', PUA: 'bg-red-100 text-red-700', RII: 'bg-amber-100 text-amber-700', 'N/A': 'bg-gray-100 text-gray-600' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search units..." className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-52" />
          </div>
          <select value={filterPkg} onChange={e => setFilterPkg(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Packages</option>
            {UNIT_PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Unit
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Package</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No units found.</td></tr>
              ) : filtered.map(u => (
                <tr key={u.TrainingUnitID} className={`hover:bg-gray-50 ${!u.IsActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${pkgColors[u.TrainingPackage] || 'bg-gray-100 text-gray-600'}`}>{u.TrainingPackage}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{u.Code || '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{u.Name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{u.Category || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(u)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">{editUnit ? 'Edit Training Unit' : 'Add Training Unit'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Training Package *</label>
                  <select value={form.trainingPackage} onChange={e => setForm({...form, trainingPackage: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required>
                    {UNIT_PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Code</label>
                  <input type="text" value={form.code} onChange={e => setForm({...form, code: e.target.value})}
                    placeholder="e.g. HLTAID011" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="Full unit name" required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    placeholder="e.g. MEDICAL" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.isActive} onChange={e => setForm({...form, isActive: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                  </select>
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Saving...' : (editUnit ? 'Save Changes' : 'Add Unit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── People management tab ───────────────────────────────────────────────────────
const PeopleTab = () => {
  const [people, setPeople]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPerson, setEditPerson] = useState(null);
  const [form, setForm]         = useState({ name: '', qualifications: '', email: '', phone: '', isTrainer: false });
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API_BASE}/trainers`);
    setPeople(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditPerson(null);
    setForm({ name: '', qualifications: '', email: '', phone: '', isTrainer: false });
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditPerson(p);
    setForm({ name: p.Name, qualifications: p.Qualifications || '', email: p.Email || '', phone: p.Phone || '', isTrainer: !!p.IsTrainer });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name, qualifications: form.qualifications, email: form.email, phone: form.phone, isActive: 1, isTrainer: form.isTrainer ? 1 : 0 };
      if (editPerson) {
        await fetch(`${API_BASE}/trainers/${editPerson.TrainerID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch(`${API_BASE}/trainers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this person from the training list?')) return;
    await fetch(`${API_BASE}/trainers/${id}`, { method: 'DELETE' });
    load();
  };

  const toggleTrainer = async (p) => {
    await fetch(`${API_BASE}/trainers/${p.TrainerID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.Name, qualifications: p.Qualifications, email: p.Email, phone: p.Phone, isActive: p.IsActive, isTrainer: p.IsTrainer ? 0 : 1 }),
    });
    load();
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b bg-gray-50">
        <p className="text-sm font-medium text-gray-700">Trainers &amp; Attendees</p>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" /> Add Person
        </button>
      </div>
      {loading ? (
        <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : people.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No people yet.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Qualifications</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Email / Phone</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Is Trainer</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {people.map(p => (
              <tr key={p.TrainerID} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.Name}</td>
                <td className="px-4 py-2.5 text-gray-500">{p.Qualifications || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{[p.Email, p.Phone].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => toggleTrainer(p)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      p.IsTrainer ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {p.IsTrainer ? <><Check className="w-3 h-3" /> Trainer</> : 'Attendee only'}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(p)} className="p-1 text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p.TrainerID)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-base font-semibold">{editPerson ? 'Edit Person' : 'Add Person'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
                <input value={form.qualifications} onChange={e => setForm({...form, qualifications: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. HLTAID011, RN, Paramedic" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isTrainer} onChange={e => setForm({...form, isTrainer: e.target.checked})}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Mark as Trainer</span>
                <span className="text-xs text-gray-400">(can be selected as session trainer)</span>
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Saving...' : (editPerson ? 'Save Changes' : 'Add Person')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main TrainingTracker ────────────────────────────────────────────────────────
const TrainingTracker = () => {
  const [mainTab, setMainTab]       = useState('records');
  const [records, setRecords]       = useState([]);
  const [people, setPeople]         = useState([]);
  const [trainingUnits, setTrainingUnits] = useState([]);
  const [cpdTypes, setCpdTypes]     = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form, setForm]             = useState(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [activeTab, setActiveTab]   = useState('All');
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPackage, setFilterPackage]   = useState('');
  const [search, setSearch]         = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [recs, sum, peopleList, units, cpd] = await Promise.all([
        fetch(`${API_BASE}/training`).then(r => r.json()),
        fetch(`${API_BASE}/training/summary`).then(r => r.json()),
        fetch(`${API_BASE}/trainers`).then(r => r.json()),
        fetch(`${API_BASE}/training-units`).then(r => r.json()),
        fetch(`${API_BASE}/cpd-types`).then(r => r.json()),
      ]);
      setRecords(Array.isArray(recs) ? recs : []);
      setPeople(Array.isArray(peopleList) ? peopleList.filter(p => p.IsActive !== 0) : []);
      setTrainingUnits(Array.isArray(units) ? units.filter(u => u.IsActive !== 0) : []);
      setCpdTypes(Array.isArray(cpd) ? cpd : []);
      setSummary(sum);
    } catch (err) {
      console.error('Failed to load training data', err);
    } finally {
      setLoading(false);
    }
  };

  const [cleaning, setCleaning] = useState(false);

  const trainers = people.filter(p => p.IsTrainer);

  const cleanupDuplicates = async () => {
    if (!confirm('This will find and remove exact duplicate training records (same date, title, trainer). Continue?')) return;
    setCleaning(true);
    try {
      const res = await fetch(`${API_BASE}/training/cleanup-duplicates`, { method: 'POST' });
      const data = await res.json();
      alert(`Cleanup complete: ${data.removed} duplicates removed from ${data.duplicateGroups} groups`);
      loadAll();
    } catch (err) { alert('Cleanup failed: ' + err.message); }
    finally { setCleaning(false); }
  };

  const openAdd = () => { setEditRecord(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (r) => {
    setEditRecord(r);
    const attendeeIds = r.AttendeeIDs
      ? r.AttendeeIDs.split(',').map(Number).filter(Boolean)
      : [];
    setForm({
      trainingDate: r.TrainingDate,
      trainingType: r.TrainingType,
      title: r.Title || '',
      category: r.Category || 'MEDICAL',
      competencyUnit: r.CompetencyUnit || '',
      secondaryUnit: r.SecondaryUnit || '',
      trainingPackage: r.TrainingPackage || '',
      cpdType: r.CPDType || '',
      disciplines: r.Disciplines || '',
      trainerId: r.TrainerID || '',
      attendeeIds,
      hours: r.Hours || '',
      durationMinutes: r.DurationMinutes || '',
      expiryDate: r.ExpiryDate || '',
      passed: r.Passed !== 0,
      interactive: r.Interactive || 'Yes',
      clinicalVsNonClinical: r.ClinicalVsNonClinical || 'Clinical',
      trainerVerification: !!r.TrainerVerification,
      learningOutcome: r.LearningOutcome || '',
      notes: r.Notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url    = editRecord ? `${API_BASE}/training/${editRecord.TrainingID}` : `${API_BASE}/training`;
      const method = editRecord ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setShowModal(false);
      loadAll();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this training record?')) return;
    await fetch(`${API_BASE}/training/${id}`, { method: 'DELETE' });
    loadAll();
  };

  const typeTabs = ['All', ...TRAINING_TYPES];

  const filtered = records.filter(r => {
    if (activeTab !== 'All' && r.TrainingType !== activeTab) return false;
    if (filterTrainer && String(r.TrainerID) !== String(filterTrainer)) return false;
    if (filterCategory && r.Category !== filterCategory) return false;
    if (filterPackage && r.TrainingPackage !== filterPackage) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.Title?.toLowerCase().includes(s) &&
          !r.CompetencyUnit?.toLowerCase().includes(s) &&
          !r.Disciplines?.toLowerCase().includes(s) &&
          !r.TrainerName?.toLowerCase().includes(s) &&
          !r.AttendeeNames?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const unitsByPackage = buildUnitsByPackage(trainingUnits);

  const handleCompetencyUnitChange = (unit) => {
    const pkg = detectPackageFromUnits(unit, trainingUnits);
    setForm(f => ({ ...f, competencyUnit: unit, trainingPackage: pkg || f.trainingPackage }));
  };

  const mainTabs = [
    { id: 'records', label: 'Records', icon: GraduationCap },
    { id: 'eso',     label: 'ESO Certificate', icon: Award },
    { id: 'units',   label: 'Manage Units', icon: Award },
    { id: 'people',  label: 'Manage People', icon: Users },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Tracker</h1>
          <p className="text-gray-500">CPD, competencies, drills and training records</p>
        </div>
        <div className="flex gap-2">
          {mainTab === 'records' && (
            <>
              <button onClick={cleanupDuplicates} disabled={cleaning}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${cleaning ? 'animate-spin' : ''}`} /> Clean Duplicates
              </button>
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Add Record
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main navigation tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {mainTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMainTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              mainTab === id ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── ESO Certificate tab ── */}
      {mainTab === 'eso' && <ESOReport />}

      {/* ── Manage Units tab ── */}
      {mainTab === 'units' && <ManageUnitsTab />}

      {/* ── Manage People tab ── */}
      {mainTab === 'people' && <PeopleTab />}

      {/* ── Records tab ── */}
      {mainTab === 'records' && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-2xl font-bold text-blue-600">{Number(summary.totalCPDHours).toFixed(1)}</p>
                <p className="text-sm text-gray-500">Total CPD Hours</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-2xl font-bold text-gray-800">{records.length}</p>
                <p className="text-sm text-gray-500">Total Records</p>
              </div>
              <div className={`rounded-xl border p-4 ${summary.expiringSoon?.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                <p className={`text-2xl font-bold ${summary.expiringSoon?.length > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                  {summary.expiringSoon?.length || 0}
                </p>
                <p className="text-sm text-gray-500">Expiring within 60 days</p>
              </div>
              <div className={`rounded-xl border p-4 ${summary.overdue?.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <p className={`text-2xl font-bold ${summary.overdue?.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  {summary.overdue?.length || 0}
                </p>
                <p className="text-sm text-gray-500">Overdue</p>
              </div>
            </div>
          )}

          {/* Alerts */}
          {summary?.overdue?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <p className="font-semibold text-red-800 text-sm">Overdue competencies / certifications</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.overdue.map(r => (
                  <span key={r.TrainingID} className="text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded-full">
                    {r.Title} (exp. {format(parseISO(r.ExpiryDate), 'dd/MM/yy')})
                  </span>
                ))}
              </div>
            </div>
          )}
          {summary?.expiringSoon?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <p className="font-semibold text-amber-800 text-sm">Expiring within 60 days</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.expiringSoon.map(r => (
                  <span key={r.TrainingID} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-full">
                    {r.Title} ({differenceInDays(parseISO(r.ExpiryDate), new Date())}d)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search unit, discipline, trainer or attendee..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <select value={filterTrainer} onChange={e => setFilterTrainer(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All trainers</option>
              {trainers.map(t => <option key={t.TrainerID} value={t.TrainerID}>{t.Name}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All categories</option>
              {TRAINING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterPackage} onChange={e => setFilterPackage(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All packages</option>
              {TRAINING_PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Type tabs */}
          <div className="flex gap-1 mb-4 border-b">
            {typeTabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  activeTab === tab ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {tab}
                {tab !== 'All' && (
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {records.filter(r => r.TrainingType === tab).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No training records found.</p>
                <button onClick={openAdd} className="mt-3 text-blue-600 text-sm hover:underline">Add the first record</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Cat</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Pkg</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Competency Unit</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Trainer</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Attendees</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Hrs</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Expiry</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(r => {
                      const catColor = r.Category === 'MEDICAL' ? 'bg-blue-100 text-blue-700'
                        : r.Category === 'RESCUE' ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600';
                      const pkgColor = r.TrainingPackage === 'HLT' ? 'bg-green-100 text-green-700'
                        : r.TrainingPackage === 'PUA' ? 'bg-red-100 text-red-700'
                        : r.TrainingPackage === 'RII' ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-500';
                      const exp = expiryStatus(r.ExpiryDate);
                      return (
                        <tr key={r.TrainingID} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-sm">
                            {r.TrainingDate ? format(parseISO(r.TrainingDate), 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {r.Category && <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${catColor}`}>{r.Category}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {r.TrainingPackage && <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${pkgColor}`}>{r.TrainingPackage}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 text-sm">{r.CompetencyUnit || r.Title || '-'}</p>
                            {r.SecondaryUnit && <p className="text-xs text-gray-400 mt-0.5">+ {r.SecondaryUnit}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm max-w-xs truncate">{r.Disciplines || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">
                            {r.TrainerName ? (
                              <span className="flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                                {r.TrainerName}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate" title={r.AttendeeNames || ''}>
                            {r.AttendeeNames || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-sm">{r.Hours > 0 ? `${r.Hours}h` : '-'}</td>
                          <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
                            {r.DurationMinutes > 0 ? `${r.DurationMinutes} min` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {exp ? (
                              <span className={`text-xs px-2 py-0.5 rounded border ${exp.bg} ${exp.color}`}>{exp.label}</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-blue-600">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(r.TrainingID)} className="p-1 text-gray-400 hover:text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{editRecord ? 'Edit Training Record' : 'Add Training Record'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">

              {/* Date, Category, Record Type */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={form.trainingDate} onChange={e => setForm({...form, trainingDate: e.target.value})}
                    required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required>
                    {TRAINING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Record Type</label>
                  <select value={form.trainingType} onChange={e => setForm({...form, trainingType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Training Package + Competency Unit */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Training Package</label>
                  <select value={form.trainingPackage} onChange={e => setForm({...form, trainingPackage: e.target.value, competencyUnit: ''})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">Select...</option>
                    {TRAINING_PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competency Unit (Primary)</label>
                  <select value={form.competencyUnit} onChange={e => handleCompetencyUnitChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">Select unit...</option>
                    {form.trainingPackage && unitsByPackage[form.trainingPackage]?.length
                      ? unitsByPackage[form.trainingPackage].map(u => <option key={u} value={u}>{u}</option>)
                      : TRAINING_PACKAGES.map(pkg => unitsByPackage[pkg]?.length ? (
                          <optgroup key={pkg} label={pkg}>
                            {unitsByPackage[pkg].map(u => <option key={u} value={u}>{u}</option>)}
                          </optgroup>
                        ) : null)
                    }
                  </select>
                </div>
              </div>

              {/* Secondary Unit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Unit <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={form.secondaryUnit} onChange={e => setForm({...form, secondaryUnit: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">None</option>
                  {TRAINING_PACKAGES.map(pkg => unitsByPackage[pkg]?.length ? (
                    <optgroup key={pkg} label={pkg}>
                      {unitsByPackage[pkg].map(u => <option key={u} value={u}>{u}</option>)}
                    </optgroup>
                  ) : null)}
                </select>
              </div>

              {/* Disciplines / Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Disciplines / Session Description</label>
                <textarea value={form.disciplines} onChange={e => setForm({...form, disciplines: e.target.value})}
                  rows={2} placeholder="e.g. Patient Handling / Basket stretcher / Medical assessments..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              {/* Trainer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trainer</label>
                <select value={form.trainerId} onChange={e => setForm({...form, trainerId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Select trainer...</option>
                  {trainers.map(t => <option key={t.TrainerID} value={t.TrainerID}>{t.Name}{t.Qualifications ? ` — ${t.Qualifications}` : ''}</option>)}
                </select>
                {trainers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No trainers found. Go to <strong>Manage People</strong> and mark someone as a Trainer.</p>
                )}
              </div>

              {/* Attendees */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attendees</label>
                <AttendeePicker people={people} selectedIds={form.attendeeIds}
                  onChange={ids => setForm(f => ({ ...f, attendeeIds: ids }))} />
              </div>

              {/* CPD Type, Hours, Duration, Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPD Type</label>
                  <select value={form.cpdType} onChange={e => setForm({...form, cpdType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">Select...</option>
                    {cpdTypes.map(t => <option key={t.CPDTypeID} value={t.Name}>{t.Name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiryDate} onChange={e => setForm({...form, expiryDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input type="number" step="1" min="0" value={form.durationMinutes} onChange={e => setForm({...form, durationMinutes: e.target.value})}
                    placeholder="e.g. 60" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours (CPD)</label>
                  <input type="number" step="0.5" min="0" value={form.hours} onChange={e => setForm({...form, hours: e.target.value})}
                    placeholder="0.5" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              {/* Interactive, Clinical */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interactive</label>
                  <select value={form.interactive} onChange={e => setForm({...form, interactive: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinical / Non-Clinical</label>
                  <select value={form.clinicalVsNonClinical} onChange={e => setForm({...form, clinicalVsNonClinical: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="Clinical">Clinical</option>
                    <option value="Non-Clinical">Non-Clinical</option>
                  </select>
                </div>
              </div>

              {/* Learning Outcome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning Outcome / Reflection</label>
                <textarea value={form.learningOutcome} onChange={e => setForm({...form, learningOutcome: e.target.value})}
                  rows={2} placeholder="Key learning outcomes or reflection..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              {/* Checkboxes */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.passed} onChange={e => setForm({...form, passed: e.target.checked})}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="font-medium text-gray-700">Completed successfully</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.trainerVerification} onChange={e => setForm({...form, trainerVerification: e.target.checked})}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="font-medium text-gray-700">Trainer verified</span>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  rows={2} placeholder="Additional notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Saving...' : (editRecord ? 'Save Changes' : 'Add Record')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingTracker;
