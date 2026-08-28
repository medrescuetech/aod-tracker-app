import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';

/**
 * Shared patient add/edit modal.
 * Props:
 *   patient   – existing Person object (edit mode) or null (add mode)
 *   employers – array of { EmployerID, CompanyName }
 *   lookups   – { sexes: [...], workerTypes: [...] }
 *   onClose   – called to dismiss
 *   onSaved   – called after successful save
 */
const PatientFormModal = ({ patient, employers, lookups, onClose, onSaved }) => {
  const { hideBadgeNumber } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName:       patient?.FullName        || '',
    dateOfBirth:    patient?.DateOfBirth     || '',
    sexId:          patient?.SexID           || '',
    employerId:     patient?.EmployerID      || '',
    workerTypeId:   patient?.WorkerTypeID    || '',
    badgeNumber:    patient?.BadgeNumber     || '',
    employeeNumber: patient?.EmployeeNumber  || '',
    department:     patient?.Department      || '',
    position:       patient?.Position        || '',
    email:          patient?.Email           || '',
    phone:          patient?.Phone           || '',
    isActive:       patient?.IsActive ?? 1,
  });

  const [saving, setSaving]         = useState(false);
  const [dupStatus, setDupStatus]   = useState('idle'); // idle | checking | exact | partial | clear
  const [dupData, setDupData]       = useState({ exactMatch: null, partialMatches: [] });
  const [ackPartial, setAckPartial] = useState(false);
  const dupTimer                    = useRef(null);

  const checkDup = useCallback(async (fullName, dob, employerId) => {
    if (!fullName.trim()) { setDupStatus('idle'); return; }
    setDupStatus('checking');
    try {
      const result = await api.checkPersonDuplicate({
        fullName, dob: dob || undefined, employerId: employerId || undefined,
        excludeId: patient?.PersonID,
      });
      setDupData(result);
      if (result.exactMatch)                  setDupStatus('exact');
      else if (result.partialMatches?.length) setDupStatus('partial');
      else                                    setDupStatus('clear');
    } catch { setDupStatus('idle'); }
  }, [patient?.PersonID]);

  useEffect(() => {
    setAckPartial(false);
    clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(() => {
      checkDup(form.fullName, form.dateOfBirth, form.employerId);
    }, 600);
    return () => clearTimeout(dupTimer.current);
  }, [form.fullName, form.dateOfBirth, form.employerId, checkDup]);

  const canSave = dupStatus !== 'exact' && !(dupStatus === 'partial' && !ackPartial);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      if (patient) {
        await api.updatePerson(patient.PersonID, form);
      } else {
        await api.createPerson(form);
      }
      onSaved();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{patient ? 'Edit Patient' : 'Add Patient'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input type="text" value={form.fullName} onChange={f('fullName')} required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
              <select value={form.sexId} onChange={f('sexId')} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {lookups?.sexes?.map(s => <option key={s.SexID} value={s.SexID}>{s.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
              <select value={form.employerId} onChange={f('employerId')} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {employers?.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patient Type</label>
              <select value={form.workerTypeId} onChange={f('workerTypeId')} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option value="">Select...</option>
                {lookups?.workerTypes?.map(wt => <option key={wt.WorkerTypeID} value={wt.WorkerTypeID}>{wt.Name}</option>)}
              </select>
            </div>
            {!hideBadgeNumber && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Badge Number</label>
              <input type="text" value={form.badgeNumber} onChange={f('badgeNumber')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            )}
            {!hideBadgeNumber && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee Number</label>
              <input type="text" value={form.employeeNumber} onChange={f('employeeNumber')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input type="text" value={form.department} onChange={f('department')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <input type="text" value={form.position} onChange={f('position')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={f('phone')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
            </div>
            {patient && (
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={!!form.isActive}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 accent-blue-600" />
                  Active patient
                </label>
              </div>
            )}
          </div>

          {/* Duplicate warnings */}
          {dupStatus === 'exact' && dupData.exactMatch && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <div className="flex items-center gap-2 font-medium mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Patient already exists
              </div>
              <p>
                <strong>{dupData.exactMatch.FullName}</strong>
                {dupData.exactMatch.EmployerName ? ` — ${dupData.exactMatch.EmployerName}` : ''}
              </p>
              <button type="button" onClick={() => navigate(`/patient/${dupData.exactMatch.PersonID}`)}
                className="mt-1.5 text-red-600 hover:underline text-xs">View existing record →</button>
            </div>
          )}
          {dupStatus === 'partial' && dupData.partialMatches?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-800 mb-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Possible duplicate — same surname, DOB{form.employerId ? ' & employer' : ''}
              </div>
              {dupData.partialMatches.map(p => (
                <div key={p.PersonID} className="flex items-center justify-between text-xs text-amber-900 mb-1">
                  <span><strong>{p.FullName}</strong>{p.EmployerName ? ` — ${p.EmployerName}` : ''}</span>
                  <button type="button" onClick={() => navigate(`/patient/${p.PersonID}`)}
                    className="text-amber-700 hover:underline ml-2">View →</button>
                </div>
              ))}
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-amber-800 font-medium">
                <input type="checkbox" checked={ackPartial} onChange={e => setAckPartial(e.target.checked)}
                  className="w-4 h-4 accent-amber-600" />
                I confirm this is a different patient
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving || !canSave}
              className={`flex-1 px-4 py-2 rounded-lg text-white text-sm transition-colors ${canSave ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>
              {saving ? 'Saving...' : dupStatus === 'checking' ? 'Checking...' : (patient ? 'Save Changes' : 'Add Patient')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PatientFormModal;
