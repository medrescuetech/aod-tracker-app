import React, { useState, useEffect, useRef } from 'react';
import { Award, Printer, Settings, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Loader2, Save } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../services/api';

const API_BASE = '/api';

const token = () => localStorage.getItem('aod_token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(opts.headers || {}) } });

// ─── ESO Report page ───────────────────────────────────────────────────────────
const ESOReport = () => {
  const [clinicians, setClinicians]   = useState([]);
  const [clinicianId, setClinicianId] = useState('');
  const [startDate, setStartDate]     = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate]         = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [showManage, setShowManage]   = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    api.getClinicians().then(setClinicians).catch(console.error);
  }, []);

  const generate = async () => {
    if (!clinicianId) return alert('Select a student first');
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/reports/eso-certificate?clinicianId=${clinicianId}&startDate=${startDate}&endDate=${endDate}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setReportData(data);
    } catch (err) {
      alert('Failed to generate report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const doPrint = () => window.print();

  const fmtDate = (d) => { try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; } };
  const fmtHours = (h) => h > 0 ? `${parseFloat(h).toFixed(1)} hrs` : '—';

  return (
    <div>
      {/* Screen-only controls */}
      <div className="no-print mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ESO Annual Training Certificate</h1>
            <p className="text-gray-500">Generate a certificate of training hours by student and date range</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowManage(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              <Settings className="w-4 h-4" /> Manage Units
            </button>
            {reportData && (
              <button onClick={doPrint}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
            <select value={clinicianId} onChange={e => setClinicianId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Select student...</option>
              {clinicians.map(c => <option key={c.ClinicianID} value={c.ClinicianID}>{c.Name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:bg-green-400">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* ── PRINTABLE CERTIFICATE ─────────────────────────────────────────── */}
      {reportData && (
        <div ref={printRef} id="eso-certificate">

          {/* PAGE 1 — Certificate cover */}
          <div className="print-page cert-cover bg-white rounded-xl border-2 border-gray-300 p-10 mb-6">
            {/* Header */}
            <div className="text-center border-b-2 border-gray-800 pb-6 mb-6">
              <p className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-1">Site Health Management</p>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Annual ESO Training</h1>
              <h2 className="text-xl font-semibold text-gray-600 mt-1">Certificate of Hours</h2>
            </div>

            {/* Student + period */}
            <div className="text-center mb-8">
              <p className="text-sm text-gray-500 mb-1">This certifies the training hours completed by</p>
              <p className="text-3xl font-bold text-blue-700 mb-3">{reportData.clinician?.Name}</p>
              <p className="text-sm text-gray-500">
                For the period{' '}
                <span className="font-semibold text-gray-800">
                  {fmtDate(reportData.period.startDate)} – {fmtDate(reportData.period.endDate)}
                </span>
              </p>
            </div>

            {/* Unit hours table */}
            <table className="w-full text-sm border-collapse mb-6">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="text-left px-4 py-2 font-semibold">Competency Unit</th>
                  <th className="text-right px-4 py-2 font-semibold w-28">Hours</th>
                  <th className="text-right px-4 py-2 font-semibold w-24">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {reportData.units.map((unit, i) => (
                  <tr key={i} className={`border-b border-gray-200 ${unit.groupName === 'Driving Competency' ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className={`px-4 py-2 ${unit.groupName === 'Driving Competency' ? 'font-semibold text-blue-800' : 'text-gray-800'}`}>
                      {unit.displayName}
                      {unit.groupName === 'Driving Competency' && <span className="ml-2 text-xs text-blue-500 font-normal">(any driving unit)</span>}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${unit.totalHours > 0 ? 'font-semibold text-gray-900' : 'text-gray-300'}`}>
                      {unit.totalHours > 0 ? `${unit.totalHours.toFixed(1)}` : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right ${unit.sessions.length > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                      {unit.sessions.length > 0 ? unit.sessions.length : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800 text-white">
                  <td className="px-4 py-2 font-bold">TOTAL</td>
                  <td className="px-4 py-2 text-right font-bold font-mono">{reportData.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-bold">
                    {reportData.units.reduce((s, u) => s + u.sessions.length, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signature block */}
            <div className="flex justify-between items-end mt-10 pt-6 border-t border-gray-300">
              <div>
                <div className="w-48 border-b border-gray-400 mb-1 h-8"></div>
                <p className="text-xs text-gray-500">Authorised Signatory</p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>Generated: {format(new Date(), 'dd/MM/yyyy')}</p>
                <p>Site Health Management System</p>
              </div>
            </div>
          </div>

          {/* PAGE 2+ — Session details */}
          {reportData.units.filter(u => u.sessions.length > 0).map((unit, ui) => (
            <div key={ui} className={`print-page bg-white rounded-xl border p-8 mb-4 ${ui > 0 ? 'print-break' : ''}`}>
              <div className="flex justify-between items-start mb-4 border-b pb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Training Session Details</p>
                  <h3 className="text-lg font-bold text-gray-900">{unit.displayName}</h3>
                  {unit.groupName === 'Driving Competency' && (
                    <p className="text-xs text-blue-600 mt-0.5">Includes: PUAVEH001 · HLTOUT007 · HLTOUT006</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-700">{unit.totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-gray-400">{unit.sessions.length} sessions</p>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Unit / Description</th>
                    <th className="text-left px-3 py-2 font-medium">Trainer</th>
                    <th className="text-right px-3 py-2 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unit.sessions.map((s, si) => (
                    <tr key={si} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-xs">{si + 1}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(s.TrainingDate)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs max-w-xs">
                        <p className="font-medium text-gray-800">{s.CompetencyUnit || s.Title || '—'}</p>
                        {s.Disciplines && <p className="text-gray-400 mt-0.5 truncate">{s.Disciplines}</p>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{s.TrainerName || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        {s.Hours > 0 ? `${parseFloat(s.Hours).toFixed(1)}h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-gray-700">Unit total</td>
                    <td className="px-3 py-2 text-right text-blue-700">{unit.totalHours.toFixed(1)}h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Manage Units Modal */}
      {showManage && <ManageUnitsModal onClose={() => setShowManage(false)} />}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #eso-certificate, #eso-certificate * { visibility: visible !important; }
          #eso-certificate { position: fixed; top: 0; left: 0; width: 100%; }
          .print-break { page-break-before: always; }
          .cert-cover { border: none !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
};

// ─── Manage Units Modal ────────────────────────────────────────────────────────
const ManageUnitsModal = ({ onClose }) => {
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editUnit, setEditUnit] = useState(null);  // null = new
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: '', displayName: '', groupName: 'Standard', sortOrder: 0 });
  const [saving, setSaving]     = useState(false);
  const [expandGroup, setExpandGroup] = useState({ Standard: true, 'Driving Competency': true });

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API_BASE}/eso-cert-units`);
    setUnits(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUnit(null);
    setForm({ name: '', displayName: '', groupName: 'Standard', sortOrder: units.length });
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditUnit(u);
    setForm({ name: u.Name, displayName: u.DisplayName || '', groupName: u.GroupName || 'Standard', sortOrder: u.SortOrder });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editUnit) {
        await authFetch(`${API_BASE}/eso-cert-units/${editUnit.UnitID}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await authFetch(`${API_BASE}/eso-cert-units`, { method: 'POST', body: JSON.stringify(form) });
      }
      setShowForm(false);
      load();
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this unit from the ESO certificate?')) return;
    await authFetch(`${API_BASE}/eso-cert-units/${id}`, { method: 'DELETE' });
    load();
  };

  const toggleActive = async (u) => {
    await authFetch(`${API_BASE}/eso-cert-units/${u.UnitID}`, {
      method: 'PUT',
      body: JSON.stringify({ name: u.Name, displayName: u.DisplayName, groupName: u.GroupName, sortOrder: u.SortOrder, isActive: !u.IsActive }),
    });
    load();
  };

  const grouped = units.reduce((acc, u) => {
    const g = u.GroupName || 'Standard';
    (acc[g] = acc[g] || []).push(u);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Manage ESO Certificate Units</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : (
            Object.entries(grouped).map(([group, groupUnits]) => (
              <div key={group} className="mb-4">
                <button onClick={() => setExpandGroup(g => ({ ...g, [group]: !g[group] }))}
                  className="w-full flex justify-between items-center px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-200">
                  <span>{group} <span className="font-normal text-gray-400">({groupUnits.length})</span></span>
                  {expandGroup[group] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {expandGroup[group] && (
                  <div className="mt-1 divide-y border rounded-lg overflow-hidden">
                    {groupUnits.map(u => (
                      <div key={u.UnitID} className={`flex items-center justify-between px-3 py-2 text-sm ${!u.IsActive ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${u.IsActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{u.Name}</p>
                          {u.DisplayName && <p className="text-xs text-gray-400">{u.DisplayName}</p>}
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button onClick={() => toggleActive(u)}
                            className={`text-xs px-2 py-0.5 rounded border ${u.IsActive ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                            {u.IsActive ? 'Active' : 'Inactive'}
                          </button>
                          <button onClick={() => openEdit(u)} className="p-1 text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(u.UnitID)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t">
          {showForm ? (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit Name (must match CompetencyUnit in training records) *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. HLTAID011 Provide first aid" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Group</label>
                  <select value={form.groupName} onChange={e => setForm({ ...form, groupName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="Standard">Standard</option>
                    <option value="Driving Competency">Driving Competency</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: +e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : (editUnit ? 'Update' : 'Add Unit')}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Add Unit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ESOReport;
