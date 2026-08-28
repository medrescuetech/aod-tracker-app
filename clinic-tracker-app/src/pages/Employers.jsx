import React, { useState, useEffect, useRef } from 'react';
import { Building2, Plus, Edit2, Loader2, X, GitMerge, Tag, ArrowLeftRight, RotateCcw, Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';

const Employers = () => {
  const { employerCategories, getEmployeeLabel } = useApp();
  const employeeLabel = getEmployeeLabel();
  
  const [employers, setEmployers] = useState([]);
  const [mergedEmployers, setMergedEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [editingEmployer, setEditingEmployer] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [showImportModal, setShowImportModal] = useState(false);
  
  const getCategoryBadgeColor = (category) => {
    return category === employeeLabel 
      ? 'bg-blue-100 text-blue-700' 
      : 'bg-purple-100 text-purple-700';
  };

  useEffect(() => { loadEmployers(); }, []);

  const loadEmployers = async () => {
    try {
      const [data, merged] = await Promise.all([
        api.getEmployers(),
        api.getMergedEmployers().catch(() => [])
      ]);
      setEmployers(data);
      setMergedEmployers(merged);
    } catch (err) {
      console.error('Failed to load employers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnmerge = async (employerId) => {
    if (!confirm('Restore this employer as independent?')) return;
    try {
      await api.unmergeEmployer(employerId);
      loadEmployers();
    } catch (err) {
      alert('Failed to restore: ' + err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  const activeEmployers = employers.filter(e => !e.MergedIntoEmployerID);

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employers</h1>
          <p className="text-gray-500">{activeEmployers.length} active, {mergedEmployers.length} merged</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/employers/export/csv" download className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
            <Download className="w-4 h-4" /> Export CSV
          </a>
          <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setShowMergeModal(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            <GitMerge className="w-4 h-4" /> Merge
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Employer
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {[['active', 'Active'], ['merged', 'Merged']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeEmployers.map(emp => (
            <div key={emp.EmployerID} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{emp.CompanyName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${getCategoryBadgeColor(emp.Category)}`}>
                      {emp.Category}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingEmployer(emp); setShowAliasModal(true); }} className="p-1 text-gray-400 hover:text-purple-600" title="Manage Aliases">
                    <Tag className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingEmployer(emp); setShowModal(true); }} className="p-1 text-gray-400 hover:text-blue-600">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-1 mt-3">
                {emp.ContactName && <p>Contact: {emp.ContactName}</p>}
                {emp.ContactEmail && <p>Email: {emp.ContactEmail}</p>}
                {emp.AlsoKnownAs && (
                  <p className="text-xs text-gray-400">
                    Also known as: {emp.AlsoKnownAs}
                  </p>
                )}
                <p className="font-medium text-gray-700">{emp.WorkerCount || 0} patients</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'merged' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mergedEmployers.map(emp => (
            <div key={emp.EmployerID} className="bg-gray-50 rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-500 line-through">{emp.CompanyName}</p>
                    <span className="text-xs text-gray-400">Merged into {emp.MergedIntoName}</span>
                  </div>
                </div>
                <button onClick={() => handleUnmerge(emp.EmployerID)} className="p-1 text-gray-400 hover:text-green-600" title="Restore">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <EmployerModal employer={editingEmployer} onClose={() => { setShowModal(false); setEditingEmployer(null); }} onSave={() => { loadEmployers(); setShowModal(false); setEditingEmployer(null); }} />
      )}

      {showMergeModal && (
        <MergeModal employers={activeEmployers} onClose={() => setShowMergeModal(false)} onSave={() => { loadEmployers(); setShowMergeModal(false); }} />
      )}

      {showAliasModal && editingEmployer && (
        <AliasModal employer={editingEmployer} onClose={() => { setShowAliasModal(false); setEditingEmployer(null); }} onSave={loadEmployers} />
      )}
      {showImportModal && (
        <CsvImportModal
          title="Import Employers"
          tooltip={[
            'Required: CompanyName',
            'Optional: Category, ContactName, ContactEmail, ContactPhone, Address',
            'Existing employers matched by name (case-insensitive). Missing optional fields keep existing values.',
            'Download Export CSV first to see the exact format.',
          ]}
          columns={['CompanyName','Category','ContactName','ContactEmail','ContactPhone','Address']}
          exampleRow={['Acme Corp','Contractor','Jane Smith','jane@acme.com','0400000000','123 Main St']}
          onImport={api.importEmployersCsv.bind(api)}
          onClose={() => setShowImportModal(false)}
          onImported={loadEmployers}
        />
      )}
    </div>
  );
};

const EmployerModal = ({ employer, onClose, onSave }) => {
  const { employerCategories, getEmployeeLabel, getContractorLabel } = useApp();
  const employeeLabel = getEmployeeLabel();
  const contractorLabel = getContractorLabel();
  
  const [form, setForm] = useState({
    companyName: employer?.CompanyName || '',
    fullLegalName: employer?.FullLegalName || '',
    alsoKnownAs: employer?.AlsoKnownAs || '',
    category: employer?.Category || contractorLabel,
    contactName: employer?.ContactName || '',
    contactEmail: employer?.ContactEmail || '',
    contactPhone: employer?.ContactPhone || '',
    address: employer?.Address || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (employer) {
        await api.updateEmployer(employer.EmployerID, form);
      } else {
        await api.createEmployer(form);
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{employer ? 'Edit Employer' : 'Add Employer'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <input type="text" value={form.companyName} onChange={(e) => setForm({...form, companyName: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Legal Name</label>
            <input type="text" value={form.fullLegalName} onChange={(e) => setForm({...form, fullLegalName: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="If different from company name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Also Known As</label>
            <input type="text" value={form.alsoKnownAs} onChange={(e) => setForm({...form, alsoKnownAs: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Comma-separated aliases (e.g., Melchor, Melchor Contracting)" />
            <p className="text-xs text-gray-500 mt-1">Separate multiple names with commas</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
              {employerCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This category applies to all employees of this employer
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input type="text" value={form.contactName} onChange={(e) => setForm({...form, contactName: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm({...form, contactEmail: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MergeModal = ({ employers, onClose, onSave }) => {
  const [targetId, setTargetId] = useState('');
  const [sourceIds, setSourceIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleToggleSource = (id) => {
    setSourceIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleMerge = async () => {
    if (!targetId || sourceIds.length === 0) {
      alert('Please select a target and at least one source employer');
      return;
    }
    if (sourceIds.includes(targetId)) {
      alert('Target cannot also be a source');
      return;
    }
    if (!confirm(`Merge ${sourceIds.length} employer(s) into the selected target? This cannot be undone.`)) return;

    setSaving(true);
    try {
      await api.mergeEmployers(parseInt(targetId), sourceIds.map(id => parseInt(id)));
      onSave();
    } catch (err) {
      alert('Failed to merge: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Merge Employers</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium">How merging works:</p>
            <ul className="list-disc ml-4 mt-1 text-xs space-y-1">
              <li>All workers from source employers will be moved to the target</li>
              <li>Source employer names will be added as aliases to the target</li>
              <li>Source employers will be marked as merged (can be restored later)</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Employer (keep this one)</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
              <option value="">Select target...</option>
              {employers.map(emp => (
                <option key={emp.EmployerID} value={emp.EmployerID}>{emp.CompanyName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source Employers (merge these into target)</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-60 overflow-y-auto">
              {employers.map(emp => (
                <label key={emp.EmployerID} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={sourceIds.includes(String(emp.EmployerID))}
                    onChange={() => handleToggleSource(String(emp.EmployerID))}
                    className="w-4 h-4 text-purple-600"
                  />
                  <span className="text-sm">{emp.CompanyName}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
            <button 
              onClick={handleMerge} 
              disabled={saving || !targetId || sourceIds.length === 0}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg disabled:bg-purple-400 hover:bg-purple-700"
            >
              {saving ? 'Merging...' : `Merge ${sourceIds.length} into Target`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AliasModal = ({ employer, onClose, onSave }) => {
  const [aliases, setAliases] = useState([]);
  const [newAlias, setNewAlias] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAliases();
  }, []);

  const loadAliases = async () => {
    try {
      const data = await api.getEmployerAliases(employer.EmployerID);
      setAliases(data);
    } catch (err) {
      console.error('Failed to load aliases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newAlias.trim()) return;
    setSaving(true);
    try {
      await api.addEmployerAlias(employer.EmployerID, newAlias.trim());
      setNewAlias('');
      loadAliases();
      onSave();
    } catch (err) {
      if (err.message.includes('already exists')) {
        alert('This alias already exists');
      } else {
        alert('Failed to add alias: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (aliasId) => {
    if (!confirm('Remove this alias?')) return;
    try {
      await api.removeEmployerAlias(employer.EmployerID, aliasId);
      loadAliases();
      onSave();
    } catch (err) {
      alert('Failed to remove alias: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Manage Aliases: {employer.CompanyName}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Aliases help match different names for the same company (e.g., "Melchor" and "Melchor Contracting").
          </p>

          <div className="flex gap-2">
            <input 
              type="text" 
              value={newAlias} 
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add new alias..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <button 
              onClick={handleAdd} 
              disabled={saving || !newAlias.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:bg-purple-400 text-sm"
            >
              Add
            </button>
          </div>

          {loading ? (
            <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y max-h-60 overflow-y-auto">
              {aliases.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">No aliases yet</p>
              ) : (
                aliases.map(alias => (
                  <div key={alias.AliasID} className="flex justify-between items-center p-3">
                    <span className="text-sm">{alias.AliasName}</span>
                    <button onClick={() => handleRemove(alias.AliasID)} className="text-gray-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {employer.AlsoKnownAs && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Also Known As (from profile):</p>
              <p className="text-sm text-gray-700">{employer.AlsoKnownAs}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable CSV import modal — used by Employers and imported by Settings
export const CsvImportModal = ({ title, tooltip, columns, exampleRow, onImport, onClose, onImported }) => {
  const fileRef = useRef();
  const [step, setStep] = useState('pick');
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState('');

  const parseCSV = (text) => {
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
    if (lines.length < 2) return [];
    const parseRow = (line) => {
      const cells=[]; let cell=''; let inQ=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){if(inQ&&line[i+1]==='"'){cell+='"';i++;}else inQ=!inQ;}
        else if(ch===','&&!inQ){cells.push(cell.trim());cell='';}
        else cell+=ch;
      }
      cells.push(cell.trim()); return cells;
    };
    const headers=parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim());
    return lines.slice(1).map(line=>{
      const vals=parseRow(line); const row={};
      headers.forEach((h,i)=>{row[h]=(vals[i]||'').replace(/^"|"$/g,'').trim();});
      return row;
    }).filter(r=>Object.values(r).some(v=>v));
  };

  const downloadTemplate = () => {
    const csv = columns.join(',') + '\n' + exampleRow.map(v => v.includes(',') ? `"${v}"` : v).join(',');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${title.replace(/\s+/g,'_').toLowerCase()}_template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if(!parsed.length){ setParseError('No valid rows found. Check the file has a header row and data rows.'); return; }
      setRows(parsed); setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await onImport(rows);
      setResults(result); setStep('results');
      onImported?.();
    } catch(err){ setParseError('Import failed: '+err.message); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step==='pick'&&'Upload a CSV file'}
              {step==='preview'&&`${rows.length} rows parsed — review before importing`}
              {step==='results'&&'Import complete'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {step==='pick' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                <p className="font-semibold mb-1">Expected CSV columns</p>
                <code className="block bg-blue-100 px-2 py-1 rounded text-xs font-mono">{columns.join(', ')}</code>
                <ul className="mt-2 space-y-0.5 text-xs list-disc list-inside text-blue-700">
                  {tooltip.map((t,i)=><li key={i}>{t}</li>)}
                </ul>
              </div>
              <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400"/>
                <p className="font-medium text-gray-700">Click to choose a CSV file</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden"/>
              </div>
              {parseError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>{parseError}</div>}
              <button onClick={downloadTemplate} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Download className="w-3.5 h-3.5"/> Download template with example row
              </button>
            </>
          )}
          {step==='preview' && (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">#</th>
                        {columns.map(h=><th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0,100).map((row,i)=>(
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                          {columns.map(h=><td key={h} className="px-3 py-2 text-gray-700 text-xs max-w-[160px] truncate">{row[h]||'—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length>100 && <p className="px-3 py-2 text-xs text-gray-400 border-t">Showing first 100 of {rows.length} rows</p>}
              </div>
              {parseError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>{parseError}</div>}
            </>
          )}
          {step==='results' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center"><p className="text-2xl font-bold text-green-700">{results.created}</p><p className="text-sm text-green-600">Created</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center"><p className="text-2xl font-bold text-blue-700">{results.updated}</p><p className="text-sm text-blue-600">Updated</p></div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center"><p className="text-2xl font-bold text-amber-700">{results.skipped}</p><p className="text-sm text-amber-600">Skipped</p></div>
              </div>
              {results.errors?.length>0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Row Errors ({results.errors.length})</p>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {results.errors.map((e,i)=>(
                      <div key={i} className="flex gap-2 px-3 py-2 border-b last:border-0 bg-red-50 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5"/>
                        <span className="text-red-700">Row {e.row}{e.name?` (${e.name})`:''}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {results.errors?.length===0 && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle className="w-4 h-4"/><span className="text-sm">All {results.total} rows processed successfully</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t shrink-0">
          {step==='pick' && <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>}
          {step==='preview' && (
            <>
              <button onClick={()=>{setStep('pick');setRows([]);if(fileRef.current)fileRef.current.value='';}} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Back</button>
              <button onClick={handleImport} disabled={importing} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-300">
                {importing?<span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Importing...</span>:`Import ${rows.length} Rows`}
              </button>
            </>
          )}
          {step==='results' && <button onClick={onClose} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Done</button>}
        </div>
      </div>
    </div>
  );
};

export default Employers;
