import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, UserPlus, Search, Edit2, Loader2, X, ClipboardList, Download, Upload, CheckCircle, AlertTriangle, GitMerge, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useApp } from '../context/AppContext';

import { format } from 'date-fns';
import PatientFormModal from '../components/PatientFormModal';
import PatientMergeModal from '../components/PatientMergeModal';
import { HelpIcon } from '../components/Tooltip';
import { HELP } from '../utils/helpText';

const CSV_HEADERS = ['FullName','DateOfBirth','Sex','BadgeNumber','EmployeeNumber','Employer','PatientType','Department','Position','Email','Phone','IsActive'];

const escapeCSV = (v) => {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

const parseCSV = (text) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const cells = []; let cell = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cell += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cell.trim()); cell = ''; }
      else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
};

const Workers = () => {
  const { lookups, employerCategories, hideBadgeNumber } = useApp();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmployer, setFilterEmployer] = useState('');
  const [filterWorkerType, setFilterWorkerType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSimpleImportModal, setShowSimpleImportModal] = useState(false);
  const [mergingWorker, setMergingWorker] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [workersData, employersData] = await Promise.all([
        api.getPersons({ search: searchTerm, employerId: filterEmployer, workerTypeId: filterWorkerType }),
        api.getEmployers()
      ]);
      setWorkers(workersData);
      setEmployers(employersData);
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    await loadData();
  };

  const handleEdit = (worker) => {
    setEditingWorker(worker);
    setShowModal(true);
  };

  const handleDelete = async (worker) => {
    if (!confirm(`Archive "${worker.FullName}"? They will be removed from the active list but can be restored via Admin → Archive.`)) return;
    try {
      await api.deletePerson(worker.PersonID);
      await loadData();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWorker(null);
  };

  const handleSave = async () => {
    await loadData();
    handleCloseModal();
  };

  const handleExport = () => {
    const allData = workers.length ? workers : [];
    const csvLines = [
      CSV_HEADERS.join(','),
      ...allData.map(w => CSV_HEADERS.map(h => {
        const map = { FullName: w.FullName, DateOfBirth: w.DateOfBirth, Sex: w.SexName,
          BadgeNumber: w.BadgeNumber, EmployeeNumber: w.EmployeeNumber, Employer: w.EmployerName,
          PatientType: w.WorkerTypeName, Department: w.Department, Position: w.Position,
          Email: w.Email, Phone: w.Phone, IsActive: w.IsActive ?? 1 };
        return escapeCSV(map[h] ?? '');
      }).join(','))
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && workers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">Patients <HelpIcon text={HELP.nav.workers} /></h1>
          <p className="text-gray-500">{workers.length} registered patients</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
            title="Export current list as CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setShowSimpleImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 text-sm text-green-700"
            title="Import a simple CSV with just Name, Employer and optional DOB"
          >
            <Upload className="w-4 h-4" />
            Quick Import
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Patient
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, badge, or employee number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          <select
            value={filterEmployer}
            onChange={(e) => setFilterEmployer(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg"
          >
            <option value="">All Employers</option>
            {employers.map(e => (
              <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>
            ))}
          </select>
          <select
            value={filterWorkerType}
            onChange={(e) => setFilterWorkerType(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg"
          >
            <option value="">All Patient Types</option>
            {lookups.workerTypes.map(wt => (
              <option key={wt.WorkerTypeID} value={wt.WorkerTypeID}>{wt.Name}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Search
          </button>
        </div>
      </div>

      {/* Workers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {workers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No patients found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
                  {!hideBadgeNumber && <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Badge/Employee #</th>}
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Employer</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Tests</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Record</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Merge</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Archive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workers.map(worker => (
                  <tr key={worker.PersonID} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{worker.FullName}</p>
                      {worker.DateOfBirth && (
                        <p className="text-xs text-gray-500">DOB: {format(new Date(worker.DateOfBirth), 'dd/MM/yyyy')}</p>
                      )}
                    </td>
                    {!hideBadgeNumber && (
                    <td className="px-4 py-3 text-gray-600">
                      {worker.BadgeNumber || worker.EmployeeNumber || '-'}
                    </td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{worker.EmployerName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        worker.WorkerTypeName?.includes('Staff') ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {worker.WorkerTypeName || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{worker.TestCount || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(worker)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/patient/${worker.PersonID}`)}
                        className="p-1 text-gray-400 hover:text-green-600"
                        title="View patient record"
                      >
                        <ClipboardList className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setMergingWorker(worker)}
                        className="p-1 text-gray-400 hover:text-purple-600"
                        title="Merge with another patient"
                      >
                        <GitMerge className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(worker)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Archive patient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <PatientFormModal
          patient={editingWorker}
          employers={employers}
          lookups={lookups}
          onClose={handleCloseModal}
          onSaved={handleSave}
        />
      )}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => { loadData(); }}
        />
      )}
      {showSimpleImportModal && (
        <SimpleImportModal
          onClose={() => setShowSimpleImportModal(false)}
          onImported={() => { loadData(); }}
        />
      )}
      {mergingWorker && (
        <PatientMergeModal
          targetPatient={mergingWorker}
          onClose={() => setMergingWorker(null)}
          onMerged={() => { loadData(); setMergingWorker(null); }}
        />
      )}
    </div>
  );
};

const ImportModal = ({ onClose, onImported }) => {
  const fileRef = useRef();
  const [step, setStep] = useState('pick'); // pick | preview | results
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState('');

  const downloadTemplate = () => {
    const example = ['John Smith','1985-06-15','Male','B001','E001','Acme Corp','Contractor','Mining','Operator','','','1'];
    const csv = CSV_HEADERS.join(',') + '\n' + example.join(',');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'patients_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if (!parsed.length) { setParseError('No valid rows found. Check the file has a header row and data rows.'); return; }
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await api.importPersons(rows);
      setResults(result);
      setStep('results');
      onImported();
    } catch (err) {
      setParseError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const PREVIEW_COLS = ['FullName','DateOfBirth','BadgeNumber','Employer','PatientType','IsActive'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Import Patients / Donors</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'pick' && 'Upload a CSV file to create or update patient records'}
              {step === 'preview' && `${rows.length} rows parsed — review before importing`}
              {step === 'results' && 'Import complete'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* STEP: pick */}
          {step === 'pick' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                <p className="font-medium">CSV Format</p>
                <p>Required column: <code className="bg-blue-100 px-1 rounded">FullName</code></p>
                <p>Optional columns: <code className="bg-blue-100 px-1 rounded">DateOfBirth (YYYY-MM-DD)</code>, <code className="bg-blue-100 px-1 rounded">Sex</code>, <code className="bg-blue-100 px-1 rounded">BadgeNumber</code>, <code className="bg-blue-100 px-1 rounded">EmployeeNumber</code>, <code className="bg-blue-100 px-1 rounded">Employer</code>, <code className="bg-blue-100 px-1 rounded">PatientType</code>, <code className="bg-blue-100 px-1 rounded">Department</code>, <code className="bg-blue-100 px-1 rounded">Position</code>, <code className="bg-blue-100 px-1 rounded">Email</code>, <code className="bg-blue-100 px-1 rounded">Phone</code>, <code className="bg-blue-100 px-1 rounded">IsActive (1/0)</code></p>
                <p className="text-blue-600">Existing patients are matched by BadgeNumber → EmployeeNumber → Name+DOB → Name</p>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium text-gray-700">Click to choose a CSV file</p>
                <p className="text-sm text-gray-400 mt-1">or drag and drop</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{parseError}
                </div>
              )}

              <button onClick={downloadTemplate} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> Download CSV template
              </button>
            </>
          )}

          {/* STEP: preview */}
          {step === 'preview' && (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">#</th>
                        {PREVIEW_COLS.map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0, 100).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          {PREVIEW_COLS.map(h => (
                            <td key={h} className="px-3 py-2 text-gray-700 text-xs max-w-[150px] truncate">{row[h] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 100 && (
                  <p className="px-3 py-2 text-xs text-gray-400 border-t">Showing first 100 of {rows.length} rows</p>
                )}
              </div>
              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{parseError}
                </div>
              )}
            </>
          )}

          {/* STEP: results */}
          {step === 'results' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{results.created}</p>
                  <p className="text-sm text-green-600">Created</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{results.updated}</p>
                  <p className="text-sm text-blue-600">Updated</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{results.skipped}</p>
                  <p className="text-sm text-amber-600">Skipped</p>
                </div>
              </div>

              {results.errors?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Row Errors ({results.errors.length})</p>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {results.errors.map((e, i) => (
                      <div key={i} className="flex gap-2 px-3 py-2 border-b last:border-0 bg-red-50 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span className="text-red-700">Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.errors?.length === 0 && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">All {results.total} rows processed successfully</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t shrink-0">
          {step === 'pick' && (
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('pick'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Back</button>
              <button onClick={handleImport} disabled={importing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-300">
                {importing ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Importing...</span> : `Import ${rows.length} Rows`}
              </button>
            </>
          )}
          {step === 'results' && (
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Done</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Simple Import Modal (Name + Employer + optional DOB) ────────────────────
// Completely separate from ImportModal — does not share any code or state.

const SIMPLE_CSV_HEADERS = ['Name', 'Employer', 'DOB'];

const parseSimpleCSV = (text) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const cells = []; let cell = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cell += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cell.trim()); cell = ''; }
      else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
};

const SimpleImportModal = ({ onClose, onImported }) => {
  const fileRef = useRef();
  const [step, setStep] = useState('pick');
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState('');

  const downloadTemplate = () => {
    const example = ['John Smith', 'Acme Corp', '1985-06-15'];
    const csv = SIMPLE_CSV_HEADERS.join(',') + '\n' + example.join(',');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'simple_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseSimpleCSV(ev.target.result);
      if (!parsed.length) { setParseError('No valid rows found. Check the file has a header row and data rows.'); return; }
      const hasName = parsed.some(r => r.Name || r.FullName || r['Full Name']);
      if (!hasName) { setParseError('No "Name" column found. The CSV must have a Name column.'); return; }
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await api.importPersonsSimple(rows);
      setResults(result);
      setStep('results');
      onImported();
    } catch (err) {
      setParseError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Quick Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'pick' && 'Simple CSV: Name + Employer + optional DOB'}
              {step === 'preview' && `${rows.length} rows parsed — review before importing`}
              {step === 'results' && 'Import complete'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {step === 'pick' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 space-y-1">
                <p className="font-medium">Simple CSV Format</p>
                <p>Required column: <code className="bg-green-100 px-1 rounded">Name</code></p>
                <p>Optional columns: <code className="bg-green-100 px-1 rounded">Employer</code>, <code className="bg-green-100 px-1 rounded">DOB (YYYY-MM-DD)</code></p>
                <p className="text-green-700 text-xs">If the employer doesn't exist it will be created automatically. Existing patients matched by Name+DOB or Name.</p>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium text-gray-700">Click to choose a CSV file</p>
                <p className="text-sm text-gray-400 mt-1">or drag and drop</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{parseError}
                </div>
              )}

              <button onClick={downloadTemplate} className="text-sm text-green-700 hover:underline flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> Download simple template
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">#</th>
                        {['Name','Employer','DOB'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0, 100).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          {['Name','Employer','DOB'].map(h => (
                            <td key={h} className="px-3 py-2 text-gray-700 text-xs max-w-[200px] truncate">
                              {row[h] || row.FullName || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 100 && (
                  <p className="px-3 py-2 text-xs text-gray-400 border-t">Showing first 100 of {rows.length} rows</p>
                )}
              </div>
              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{parseError}
                </div>
              )}
            </>
          )}

          {step === 'results' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{results.created}</p>
                  <p className="text-sm text-green-600">Created</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{results.updated}</p>
                  <p className="text-sm text-blue-600">Updated</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{results.skipped}</p>
                  <p className="text-sm text-amber-600">Skipped</p>
                </div>
              </div>

              {results.warnings?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-700 mb-2">New employers created ({results.warnings.length})</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                    {results.warnings.map((w, i) => (
                      <div key={i} className="px-3 py-2 border-b last:border-0 bg-amber-50 text-xs text-amber-700">
                        Row {w.row}{w.name ? ` (${w.name})` : ''}: {w.warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.errors?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Row Errors ({results.errors.length})</p>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {results.errors.map((e, i) => (
                      <div key={i} className="flex gap-2 px-3 py-2 border-b last:border-0 bg-red-50 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span className="text-red-700">Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.errors?.length === 0 && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">All {results.total} rows processed successfully</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t shrink-0">
          {step === 'pick' && (
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('pick'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Back</button>
              <button onClick={handleImport} disabled={importing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:bg-gray-300">
                {importing ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Importing...</span> : `Import ${rows.length} Rows`}
              </button>
            </>
          )}
          {step === 'results' && (
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Done</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Workers;
