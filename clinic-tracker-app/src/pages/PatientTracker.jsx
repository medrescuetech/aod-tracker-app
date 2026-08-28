import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stethoscope, Plus, Search, Loader2, X, Eye, EyeOff, Pencil, Trash2, Calendar, Clock, ChevronLeft, ChevronRight, Trash } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format, subDays, addDays, parseISO, isSameDay } from 'date-fns';

// Helper: Check if a name matches search term in either "First Last" or "Last, First" format
function nameMatchesSearch(fullName, searchTerm) {
  if (!fullName || !searchTerm) return false;
  const name = fullName.toLowerCase().trim();
  const search = searchTerm.toLowerCase().trim();

  if (name.includes(search)) return true;

  if (search.includes(',')) {
    const parts = search.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [surname, firstname] = parts;
      const reversed = `${firstname} ${surname}`;
      if (name.includes(reversed)) return true;
    }
  } else if (search.includes(' ')) {
    const parts = search.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstname = parts[0];
      const surname = parts.slice(1).join(' ');
      const reversed = `${surname} ${firstname}`;
      if (name.includes(reversed)) return true;
    }
  }

  return false;
}

const BASE_WR_NWR = ['WR', 'WR Review', 'NWR', 'NWR Review'];
const CAMP_OPTIONS = ['Camp', 'Camp Review'];

const DEFAULT_PT_CONFIG = {
  showClassification: false,
  enableCamp: true,
  classifications: ['First Aid', 'Assessment Only', 'WR Review', 'NWR Review'],
  fatMtcClasses: ['FAT', 'MTC', 'LTI', 'Review'],
  injuryTypes: ['Laceration/Cut', 'Bruise/Contusion', 'Sprain/Strain', 'Fracture', 'Burn', 'Eye Injury', 'Insect Bite/Sting', 'Skin Irritation/Rash', 'Heat Related', 'Respiratory', 'Illness', 'Mental Health', 'Other'],
  bodyLocations: ['Head', 'Face', 'Eye', 'Ear', 'Neck', 'Shoulder', 'Upper Arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Finger', 'Chest', 'Back - Upper', 'Back - Lower', 'Abdomen', 'Hip', 'Thigh', 'Knee', 'Lower Leg', 'Ankle', 'Foot', 'Toe', 'Multiple', 'Other'],
};

const WR_BADGE = {
  'WR': 'bg-amber-100 text-amber-700',
  'WR Review': 'bg-amber-200 text-amber-800',
  'NWR': 'bg-blue-100 text-blue-700',
  'NWR Review': 'bg-blue-200 text-blue-800',
  'Camp': 'bg-purple-100 text-purple-700',
  'Camp Review': 'bg-purple-200 text-purple-800',
};

const PatientTracker = () => {
  const { lookups, ptConfig } = useApp();
  const cfg = ptConfig || DEFAULT_PT_CONFIG;
  const WR_NWR_OPTIONS = cfg.enableCamp !== false ? [...BASE_WR_NWR, ...CAMP_OPTIONS] : BASE_WR_NWR;
  const today = format(new Date(), 'yyyy-MM-dd');
  const sevenDaysAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd');

  const [events, setEvents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [clinicians, setClinicians] = useState([]);
  const [referralOptions, setReferralOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [filterType, setFilterType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNames, setShowNames] = useState(false);
  const [activeTab, setActiveTab] = useState('events');

  useEffect(() => { loadData(); }, [startDate, endDate, filterType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsData, workersData, employersData, cliniciansData, refOpts] = await Promise.all([
        api.getPatientEvents({ startDate, endDate, eventType: filterType }),
        api.getPersons(),
        api.getEmployers(),
        api.getClinicians(),
        api.getReferralOptions(),
      ]);
      setEvents(eventsData);
      setWorkers(workersData);
      setEmployers(Array.isArray(employersData) ? employersData : []);
      setClinicians(cliniciansData);
      setReferralOptions(Array.isArray(refOpts) ? refOpts : []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm('Delete this event?')) return;
    try {
      await api.deletePatientEvent(eventId);
      loadData();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const setPreset = (days) => {
    setEndDate(today);
    setStartDate(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
  };

  const filteredEvents = events.filter(e => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return e.PersonName?.toLowerCase().includes(s) ||
           e.WrNwr?.toLowerCase().includes(s) ||
           e.InjuryType?.toLowerCase().includes(s) ||
           e.BodyLocation?.toLowerCase().includes(s) ||
           e.Workgroup?.toLowerCase().includes(s) ||
           e.Comment?.toLowerCase().includes(s);
  });

  const maskName = (name) => (showNames || !name) ? name : '●●●';

  const wrCount = filteredEvents.filter(e => e.WrNwr?.startsWith('WR') && !e.WrNwr?.startsWith('NWR')).length;
  const nwrCount = filteredEvents.filter(e => e.WrNwr?.startsWith('NWR') || e.WrNwr?.startsWith('Camp')).length;
  const edCount = filteredEvents.filter(e => e.Referral === 'ED').length;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Tracker</h1>
          <p className="text-gray-500">Clinical events and review appointments</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button 
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'events' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Stethoscope size={14} className={activeTab === 'events' ? 'text-blue-600' : ''} />
          Clinical Events
        </button>
        <button 
          onClick={() => setActiveTab('reviews')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'reviews' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={14} className={activeTab === 'reviews' ? 'text-teal-600' : ''} />
          Reviews Calendar
        </button>
      </div>

      {activeTab === 'events' ? (
        <ClinicalEventsTab 
          filteredEvents={filteredEvents}
          loading={loading}
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          setPreset={setPreset}
          filterType={filterType}
          setFilterType={setFilterType}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          showNames={showNames}
          setShowNames={setShowNames}
          maskName={maskName}
          wrCount={wrCount}
          nwrCount={nwrCount}
          edCount={edCount}
          setShowModal={setShowModal}
          setEditingEvent={setEditingEvent}
          handleDelete={handleDelete}
          showModal={showModal}
          editingEvent={editingEvent}
          workers={workers}
          employers={employers}
          clinicians={clinicians}
          referralOptions={referralOptions}
          loadData={loadData}
          cfg={cfg}
        />
      ) : (
        <ReviewsCalendarTab />
      )}
    </div>
  );
};

const ClinicalEventsTab = ({ 
  filteredEvents, loading, startDate, endDate, setStartDate, setEndDate, setPreset,
  filterType, setFilterType, searchTerm, setSearchTerm, showNames, setShowNames,
  maskName, wrCount, nwrCount, edCount, setShowModal, setEditingEvent, handleDelete,
  showModal, editingEvent, workers, employers, clinicians, referralOptions, loadData, cfg
}) => {
  const _cfg = cfg || DEFAULT_PT_CONFIG;
  const _wrOptions = _cfg.enableCamp !== false ? [...BASE_WR_NWR, ...CAMP_OPTIONS] : BASE_WR_NWR;
  return (
  <>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl border p-4">
        <p className="text-3xl font-bold text-blue-600">{filteredEvents.length}</p>
        <p className="text-sm text-gray-500">Total Events</p>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <p className="text-3xl font-bold text-amber-600">{wrCount}</p>
        <p className="text-sm text-gray-500">Work Related</p>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <p className="text-3xl font-bold text-blue-500">{nwrCount}</p>
        <p className="text-sm text-gray-500">Non-Work Related</p>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <p className="text-3xl font-bold text-red-600">{edCount}</p>
        <p className="text-sm text-gray-500">ED Referrals</p>
      </div>
    </div>

    <div className="bg-white rounded-xl border p-4 mb-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setPreset(d)}
              className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              {d}d
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">WR/NWR</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All</option>
            {_wrOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Name, injury, location..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <button onClick={() => setShowNames(!showNames)}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          {showNames ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showNames ? 'Hide Names' : 'Show Names'}
        </button>
      </div>
    </div>

    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} &nbsp;
          <span className="text-gray-400 font-normal">
            {format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')} – {format(new Date(endDate + 'T00:00:00'), 'dd/MM/yyyy')}
          </span>
        </p>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-12 text-center text-gray-400">
          <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No events in this range</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Time</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Patient</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Workgroup</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">WR/NWR</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Classification</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Body Location</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Injury Type</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Referral</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEvents.map(e => (
                <tr key={e.EventID} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => setEditingEvent(e)}>
                  <td className="px-3 py-2.5 text-gray-600">{e.EventDate ? format(new Date(e.EventDate + 'T00:00:00'), 'dd/MM/yy') : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{e.EventTime || '—'}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{maskName(e.PersonName) || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{e.Workgroup || e.EmployerName || '—'}</td>
                  <td className="px-3 py-2.5">{e.WrNwr ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${WR_BADGE[e.WrNwr] || 'bg-gray-100 text-gray-700'}`}>{e.WrNwr}</span> : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{e.Classification || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{e.BodyLocation || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{e.InjuryType || '—'}</td>
                  <td className="px-3 py-2.5">{e.Referral ? <span className={`text-xs px-2 py-0.5 rounded ${e.Referral === 'ED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{e.Referral}</span> : '—'}</td>
                  <td className="px-3 py-2.5" onClick={ev => ev.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingEvent(e)} className="p-1 text-gray-400 hover:text-blue-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(e.EventID)} className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {(showModal || editingEvent) && (
      <EventModal
        workers={workers}
        employers={employers}
        clinicians={clinicians}
        referralOptions={referralOptions}
        event={editingEvent}
        onClose={() => { setShowModal(false); setEditingEvent(null); }}
        onSave={() => { loadData(); setShowModal(false); setEditingEvent(null); }}
      />
    )}
  </>
  );
};

const EventModal = ({ workers, employers = [], clinicians = [], referralOptions = [], event, onClose, onSave }) => {
  const { lookups, ptConfig } = useApp();
  const cfg = ptConfig || DEFAULT_PT_CONFIG;
  const WR_NWR_OPTIONS = cfg.enableCamp !== false ? [...BASE_WR_NWR, ...CAMP_OPTIONS] : BASE_WR_NWR;
  const isEdit = !!event;

  const [form, setForm] = useState(() => ({
    eventDate: event?.EventDate ?? format(new Date(), 'yyyy-MM-dd'),
    eventTime: event?.EventTime ?? format(new Date(), 'HH:mm'),
    personId: event?.PersonID ?? '',
    patientName: event?.PatientName ?? event?.PersonName ?? '',
    workgroup: event?.Workgroup ?? '',
    workgroupEmployerId: event?.WorkgroupEmployerID ?? event?.ResolvedWorkgroupEmployerID ?? '',
    wrNwr: event?.WrNwr ?? '',
    bodyLocation: event?.BodyLocation ?? '',
    injuryType: event?.InjuryType ?? '',
    classification: event?.Classification ?? '',
    rtwPlan: event?.RtwPlan ?? '',
    drConsult: !!event?.DrConsult,
    referral: event?.Referral ?? '',
    clinicianId: event?.ClinicianID ?? '',
    comment: event?.Comment ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Sorted canonical employers for the workgroup dropdown
  const workgroupOptions = [...employers].sort((a, b) => a.CompanyName.localeCompare(b.CompanyName));

  const filteredWorkers = workers.filter(w => {
    if (!searchTerm) return true;
    return nameMatchesSearch(w.FullName, searchTerm) || (w.BadgeNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!form.personId && !form.patientName) || !form.wrNwr) {
      alert('Please enter patient name and WR/NWR classification');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.updatePatientEvent(event.EventID, form);
      } else {
        await api.createPatientEvent(form);
      }
      onSave();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Clinical Event' : 'Record Clinical Event'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={form.eventDate} onChange={(e) => setForm({...form, eventDate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input type="time" value={form.eventTime} onChange={(e) => setForm({...form, eventTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name *</label>
            <input type="text" value={form.patientName}
              onChange={(e) => {
                const name = e.target.value;
                const matched = workers.find(w => w.FullName === name);
                const autoEmpId = matched?.EmployerID ?? '';
                const autoEmpName = matched?.EmployerName ?? '';
                setForm(f => ({
                  ...f,
                  patientName: name,
                  personId: matched?.PersonID ?? '',
                  workgroupEmployerId: f.workgroupEmployerId || autoEmpId,
                  workgroup: f.workgroupEmployerId ? f.workgroup : autoEmpName,
                }));
                setSearchTerm(name);
              }}
              placeholder="Enter patient name..." className="w-full px-3 py-2 border border-gray-200 rounded-lg" list="patient-suggestions" required />
            <datalist id="patient-suggestions">
              {filteredWorkers.slice(0, 10).map(w => (
                <option key={w.PersonID} value={w.FullName}>{w.EmployerName}</option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workgroup</label>
            <select
              value={form.workgroupEmployerId}
              onChange={(e) => {
                const emp = employers.find(em => String(em.EmployerID) === String(e.target.value));
                setForm({...form, workgroupEmployerId: e.target.value, workgroup: emp?.CompanyName ?? ''});
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option value="">— Select workgroup —</option>
              {workgroupOptions.map(emp => (
                <option key={emp.EmployerID} value={emp.EmployerID}>{emp.CompanyName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WR/NWR *</label>
            <select value={form.wrNwr} onChange={(e) => setForm({...form, wrNwr: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required>
              <option value="">Select...</option>
              {WR_NWR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body Location</label>
              <select value={form.bodyLocation} onChange={(e) => setForm({...form, bodyLocation: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {(cfg.bodyLocations || DEFAULT_PT_CONFIG.bodyLocations).map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Injury Type</label>
              <select value={form.injuryType} onChange={(e) => setForm({...form, injuryType: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {(cfg.injuryTypes || DEFAULT_PT_CONFIG.injuryTypes).map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          {cfg.showClassification && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
                <select value={form.classification} onChange={(e) => setForm({...form, classification: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                  <option value="">Select...</option>
                  {(cfg.classifications || DEFAULT_PT_CONFIG.classifications).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT / MTC / LTI</label>
                <select value={form.fatMtcClass || ''} onChange={(e) => setForm({...form, fatMtcClass: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                  <option value="">Select...</option>
                  {(cfg.fatMtcClasses || DEFAULT_PT_CONFIG.fatMtcClasses).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral / Outcome</label>
              <select value={form.referral} onChange={(e) => setForm({...form, referral: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {referralOptions.map(opt => (
                  <option key={opt.OptionID} value={opt.Name}>{opt.Name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RTW Plan</label>
              <select value={form.rtwPlan} onChange={(e) => setForm({...form, rtwPlan: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {(cfg.rtwPlans || DEFAULT_PT_CONFIG.rtwPlans || ['Immediate RTW','Modified Duties','No RTW']).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="drConsult" checked={!!form.drConsult} onChange={(e) => setForm({...form, drConsult: e.target.checked})} className="w-4 h-4 accent-blue-600" />
            <label htmlFor="drConsult" className="text-sm font-medium text-gray-700 cursor-pointer">Doctor / Medical consult</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
            <textarea value={form.comment} onChange={(e) => setForm({...form, comment: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Additional comments..." />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

function ReviewsCalendarTab() {
  const [appointments, setAppointments] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom = format(viewDate, 'yyyy-MM-01');
      const lastDay = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
      const dateTo = format(lastDay, 'yyyy-MM-dd');
      const [apptsData, workersData] = await Promise.all([
        api.getReviewAppointments({ dateFrom, dateTo }),
        api.getPersons(),
      ]);
      setAppointments(apptsData);
      setWorkers(workersData);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [viewDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this appointment?')) return;
    try {
      await api.deleteReviewAppointment(id);
      loadData();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const getDaysInMonth = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const getAppointmentsForDay = (day) => {
    if (!day) return [];
    const dateStr = format(new Date(viewDate.getFullYear(), viewDate.getMonth(), day), 'yyyy-MM-dd');
    return appointments.filter(a => a.AppointmentDate === dateStr).sort((a, b) => (a.TimeSlot || '').localeCompare(b.TimeSlot || ''));
  };

  const today = new Date();
  const days = getDaysInMonth();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white rounded-xl border p-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">{format(viewDate, 'MMMM yyyy')}</h2>
          <div className="flex gap-1">
            <button onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setViewDate(new Date())} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Today</button>
            <button onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <button onClick={() => { setEditingAppointment(null); setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Schedule Review
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {dayNames.map(d => <div key={d} className="px-2 py-2 text-center text-sm font-medium text-gray-600">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayAppointments = getAppointmentsForDay(day);
            const isToday = day && isSameDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), day), today);
            const dateStr = day ? format(new Date(viewDate.getFullYear(), viewDate.getMonth(), day), 'yyyy-MM-dd') : null;
            return (
              <div key={i} className={`min-h-[120px] border-b border-r p-2 ${!day ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'} ${isToday ? 'bg-blue-50/50' : ''}`}>
                {day && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      {day}{isToday && <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Today</span>}
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.slice(0, 3).map(appt => (
                        <div key={appt.AppointmentID} onClick={() => { setEditingAppointment(appt); setShowModal(true); }} className="text-xs p-1.5 bg-blue-100 text-blue-800 rounded cursor-pointer hover:bg-blue-200 truncate" title={`${appt.FullName}${appt.TimeSlot ? ` at ${appt.TimeSlot}` : ''}${appt.Comment ? ` - ${appt.Comment}` : ''}`}>
                          {appt.TimeSlot && <span className="font-medium">{appt.TimeSlot} </span>}
                          <span className="truncate">{appt.FullName}</span>
                        </div>
                      ))}
                      {dayAppointments.length > 3 && <div className="text-xs text-gray-500 text-center">+{dayAppointments.length - 3} more</div>}
                    </div>
                    {dayAppointments.length === 0 && <button onClick={() => { setSelectedDate(dateStr); setEditingAppointment(null); setShowModal(true); }} className="mt-2 text-xs text-gray-400 hover:text-blue-600 opacity-0 hover:opacity-100 transition-opacity">+ Add</button>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''} in {format(viewDate, 'MMMM yyyy')}</p>
        </div>
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No appointments scheduled</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Patient</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Employer</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Comment</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appointments.sort((a, b) => a.AppointmentDate.localeCompare(b.AppointmentDate) || (a.TimeSlot || '').localeCompare(b.TimeSlot || '')).map(a => (
                  <tr key={a.AppointmentID} className="hover:bg-blue-50/30">
                    <td className="px-3 py-2.5 text-gray-600">{format(parseISO(a.AppointmentDate), 'dd/MM/yyyy')}</td>
                    <td className="px-3 py-2.5 text-gray-600">{a.TimeSlot || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{a.FullName}</td>
                    <td className="px-3 py-2.5 text-gray-500">{a.EmployerName || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-48 truncate" title={a.Comment}>{a.Comment || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.Status === 'Completed' ? 'bg-green-100 text-green-700' : a.Status === 'Cancelled' ? 'bg-gray-100 text-gray-600' : a.Status === 'No-Show' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{a.Status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingAppointment(a); setShowModal(true); }} className="p-1 text-gray-400 hover:text-blue-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(a.AppointmentID)} className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showModal || editingAppointment) && (
        <ReviewAppointmentModal workers={workers} appointment={editingAppointment} initialDate={selectedDate} onClose={() => { setShowModal(false); setEditingAppointment(null); }} onSave={() => { loadData(); setShowModal(false); setEditingAppointment(null); }} />
      )}
    </div>
  );
}

function ReviewAppointmentModal({ workers, appointment, initialDate, onClose, onSave }) {
  const isEdit = !!appointment;
  const [form, setForm] = useState(() => ({
    personId: appointment?.PersonID ?? '',
    patientName: appointment?.PatientName ?? appointment?.FullName ?? '',
    appointmentDate: appointment?.AppointmentDate ?? initialDate ?? format(new Date(), 'yyyy-MM-dd'),
    timeSlot: appointment?.TimeSlot ?? '',
    comment: appointment?.Comment ?? '',
    showCommentOnDashboard: appointment?.ShowCommentOnDashboard !== 0,
    status: appointment?.Status ?? 'Scheduled',
  }));
  const [saving, setSaving] = useState(false);
  const [showWorkerList, setShowWorkerList] = useState(false);

  const filteredWorkers = workers.filter(w => {
    if (!form.patientName) return true;
    const term = form.patientName.toLowerCase();
    return w.FullName.toLowerCase().includes(term) || (w.BadgeNumber || '').toLowerCase().includes(term);
  });

  const selectedWorker = workers.find(w => w.PersonID === form.personId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.personId && !form.patientName?.trim()) {
      alert('Please enter a patient name');
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        personId: form.personId || undefined,
        patientName: form.patientName?.trim() || undefined,
      };
      if (isEdit) {
        await api.updateReviewAppointment(appointment.AppointmentID, data);
      } else {
        await api.createReviewAppointment(data);
      }
      onSave();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Review Appointment' : 'Schedule Review'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
            <div className="relative">
              <input 
                type="text" 
                value={form.patientName} 
                onChange={(e) => { 
                  setForm({...form, patientName: e.target.value, personId: ''}); 
                  setShowWorkerList(e.target.value.length > 0);
                }} 
                onFocus={() => setShowWorkerList(form.patientName?.length > 0)} 
                onBlur={() => setTimeout(() => setShowWorkerList(false), 200)}
                placeholder="Type patient name or search..." 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" 
              />
              {showWorkerList && filteredWorkers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredWorkers.slice(0, 10).map(w => (
                    <button 
                      key={w.PersonID} 
                      type="button" 
                      onClick={() => { 
                        setForm({...form, personId: w.PersonID, patientName: w.FullName}); 
                        setShowWorkerList(false); 
                      }} 
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-sm">{w.FullName}</p>
                      <p className="text-xs text-gray-500">{w.EmployerName || 'No employer'}</p>
                    </button>
                  ))}
                  <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50">
                    Press Enter or click away to use "{form.patientName}"
                  </div>
                </div>
              )}
              {form.patientName && filteredWorkers.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">No matching patients. Will save as free-text entry.</p>
              )}
              {selectedWorker && (
                <p className="mt-1 text-xs text-green-600">✓ Linked to patient record</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={form.appointmentDate} onChange={(e) => setForm({...form, appointmentDate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Slot</label>
              <input type="time" value={form.timeSlot} onChange={(e) => setForm({...form, timeSlot: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment / Reason</label>
            <textarea value={form.comment} onChange={(e) => setForm({...form, comment: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Optional comment for review..." />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.showCommentOnDashboard} onChange={(e) => setForm({...form, showCommentOnDashboard: e.target.checked})} className="w-4 h-4 rounded" />
            <span className="text-gray-700">Show comment on dashboard</span>
          </label>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="No-Show">No-Show</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving || !form.patientName?.trim()} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Schedule Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientTracker;
