import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, Settings, FileText, Database, AlertTriangle, RefreshCw, Save, Eye, EyeOff, ToggleLeft, ToggleRight, X, Archive, RotateCcw, Trash2, Users, FlaskConical, BookOpen, ClipboardList, ChevronLeft, ChevronRight, Search, Mail, Plus, Loader2, FolderOpen, Upload, Edit2, Download, HardDrive, CheckCircle, ScrollText } from 'lucide-react';
import { format } from 'date-fns';

const API_BASE = '/api';

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [activeTab, setActiveTab] = useState('stats');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        setAdminToken(password);
        sessionStorage.setItem('adminToken', password);
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Connection error');
    }
  };

  useEffect(() => {
    const stored = sessionStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminToken('');
    sessionStorage.removeItem('adminToken');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Access</h1>
            <p className="text-gray-500 mt-1">Enter admin password to continue</p>
          </div>
          
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Lock className="w-4 h-4 inline mr-2" />
              Unlock Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500">System settings and configuration</p>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          Lock Admin
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { id: 'stats', label: 'Statistics', icon: Database },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'classification', label: 'Classification', icon: RefreshCw },
          { id: 'audit', label: 'Audit Logs', icon: FileText },
          { id: 'errors', label: 'Error Logs', icon: AlertTriangle },
          { id: 'archive', label: 'Archive', icon: Archive },
          { id: 'email-rules', label: 'Email Rules', icon: Mail },
          { id: 'documents',   label: 'Documents',   icon: FolderOpen },
          { id: 'import',      label: 'Import Data',  icon: Upload     },
          { id: 'bulk',        label: 'Bulk Edit',    icon: Edit2      },
          { id: 'backups',     label: 'Backups',      icon: HardDrive  },
          { id: 'logs',        label: 'Logs',         icon: ScrollText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px ${
              activeTab === tab.id 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'stats' && <StatsTab adminToken={adminToken} />}
      {activeTab === 'settings' && <SettingsTab adminToken={adminToken} />}
      {activeTab === 'classification' && <ClassificationTab adminToken={adminToken} />}
      {activeTab === 'audit' && <AuditTab adminToken={adminToken} />}
      {activeTab === 'errors' && <ErrorsTab adminToken={adminToken} />}
      {activeTab === 'archive' && <ArchiveTab adminToken={adminToken} />}
      {activeTab === 'email-rules' && <EmailRulesTab adminToken={adminToken} />}
      {activeTab === 'documents'   && <DocumentsTab   adminToken={adminToken} />}
      {activeTab === 'import'      && <ImportTab      adminToken={adminToken} />}
      {activeTab === 'bulk'        && <BulkEditTab    adminToken={adminToken} />}
      {activeTab === 'backups'      && <BackupTab       adminToken={adminToken} />}
      {activeTab === 'logs'           && <LogsTab         adminToken={adminToken} />}
    </div>
  );
};

const StatsTab = ({ adminToken }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/admin/stats`, {
      headers: { 'X-Admin-Token': adminToken }
    })
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [adminToken]);

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Tests" value={stats?.tests || 0} color="blue" />
      <StatCard label="Pending Tests" value={stats?.pendingTests || 0} color="amber" />
      <StatCard label="Total Persons" value={stats?.persons || 0} color="green" />
      <StatCard label="Total Employers" value={stats?.employers || 0} color="purple" />
      <StatCard label="Employee Employers" value={stats?.employeeEmployers || 0} color="blue" />
      <StatCard label="Contractor Employers" value={stats?.contractorEmployers || 0} color="amber" />
      <StatCard label="Attachments" value={stats?.attachments || 0} color="gray" />
      <StatCard label="Patient Events" value={stats?.patientEvents || 0} color="green" />
    </div>
  );
};

const StatCard = ({ label, value, color }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200'
  };
  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm opacity-75">{label}</p>
    </div>
  );
};

// ── Settings sub-tab: General (compliance + workflow + display) ──────────────
const SettingsGeneralPanel = ({ adminToken }) => {
  const [settings, setSettings] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('fontSizePreference') || 'large');
  const [requireCocUploads, setRequireCocUploads] = useState(false);
  const [cocSaving, setCocSaving] = useState(false);
  const [bacAutoClose, setBacAutoClose] = useState(true);
  const [bacAutoSaving, setBacAutoSaving] = useState(false);
  const [hideBadgeNumber, setHideBadgeNumber] = useState(false);
  const [badgeSaving, setBadgeSaving] = useState(false);

  useEffect(() => { load(); }, [adminToken]);
  useEffect(() => {
    document.documentElement.classList.toggle('font-large', fontSize === 'large');
    localStorage.setItem('fontSizePreference', fontSize);
  }, [fontSize]);

  const load = () => {
    fetch(`${API_BASE}/admin/app-settings`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json()).then(data => {
        setSettings(Array.isArray(data) ? data : []);
        const coc = Array.isArray(data) && data.find(s => s.ConfigKey === 'require_coc_uploads');
        if (coc) setRequireCocUploads(coc.ConfigValue === 'true');
        if (data.bacAutoClose !== undefined) setBacAutoClose(data.bacAutoClose);
        if (data.hideBadgeNumber !== undefined) setHideBadgeNumber(data.hideBadgeNumber);
      });
  };

  const updateSetting = async (key, value) => {
    await fetch(`${API_BASE}/admin/settings/${encodeURIComponent(key)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ value })
    });
    load();
  };

  const putAppSettings = async (patch) => {
    await fetch(`${API_BASE}/admin/app-settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify(patch)
    });
  };

  if (!settings) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Compliance */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">Compliance Settings</h2></div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Require Chain of Custody PDF uploads for non-negative results</p>
              <p className="text-sm text-gray-500 mt-0.5">When enabled, a warning is shown on non-negative test records until the relevant Chain of Custody PDF is attached.</p>
            </div>
            <button onClick={async () => { setCocSaving(true); await updateSetting('require_coc_uploads', !requireCocUploads ? 'true' : 'false'); setRequireCocUploads(v => !v); setCocSaving(false); }} disabled={cocSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${requireCocUploads ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {requireCocUploads ? <><ToggleRight className="w-5 h-5" /> Enabled</> : <><ToggleLeft className="w-5 h-5" /> Disabled</>}
            </button>
          </div>
        </div>
      </div>

      {/* Non-Negative Workflow */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">Non-Negative Workflow</h2></div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">BAC Positive Auto-Close</p>
              <p className="text-sm text-gray-500 mt-0.5">When enabled, non-negative cases with only BAC positive will be prompted for closure after saving lab results.</p>
            </div>
            <button onClick={async () => { setBacAutoSaving(true); await putAppSettings({ bacAutoClose: !bacAutoClose }); setBacAutoClose(v => !v); setBacAutoSaving(false); }} disabled={bacAutoSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${bacAutoClose ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {bacAutoClose ? <><ToggleRight className="w-5 h-5" /> Enabled</> : <><ToggleLeft className="w-5 h-5" /> Disabled</>}
            </button>
          </div>
        </div>
      </div>

      {/* ID Visibility */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">ID Field Visibility</h2></div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Hide Badge / Employee ID Numbers</p>
              <p className="text-sm text-gray-500 mt-0.5">When enabled, Badge Number and Employee Number fields are hidden from all forms and lists. Data is not deleted.</p>
            </div>
            <button onClick={async () => { setBadgeSaving(true); await putAppSettings({ hideBadgeNumber: !hideBadgeNumber }); setHideBadgeNumber(v => !v); setBadgeSaving(false); }} disabled={badgeSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${hideBadgeNumber ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {hideBadgeNumber ? <><ToggleRight className="w-5 h-5" /> Hidden</> : <><ToggleLeft className="w-5 h-5" /> Visible</>}
            </button>
          </div>
        </div>
      </div>

      {/* Display */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">Display Settings</h2></div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Font Size</p>
              <p className="text-sm text-gray-500">Normal = 14px · Large = 16px (default)</p>
            </div>
            <div className="flex gap-2">
              {['normal', 'large'].map(s => (
                <button key={s} onClick={() => setFontSize(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${fontSize === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* System Config key-value */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">System Configuration</h2></div>
        <div className="divide-y">
          {settings.map(s => <SettingRow key={s.ConfigKey} setting={s} onUpdate={updateSetting} />)}
          <div className="p-4 bg-gray-50">
            <p className="text-sm font-medium text-gray-700 mb-2">Add New Setting</p>
            <div className="flex gap-2">
              <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Value" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <button onClick={async () => { if (!newKey.trim()) return; await updateSetting(newKey, newValue); setNewKey(''); setNewValue(''); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Settings sub-tab: Drug Panels ─────────────────────────────────────────────
const SettingsDrugPanelPanel = ({ adminToken }) => {
  const [oralPanel, setOralPanel] = useState(['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO']);
  const [urinePanel, setUrinePanel] = useState(['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO']);
  const [saving, setSaving] = useState(false);
  const [newOral, setNewOral] = useState('');
  const [newUrine, setNewUrine] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/app-settings`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json()).then(data => {
        if (Array.isArray(data.oralPanel) && data.oralPanel.length) setOralPanel(data.oralPanel);
        if (Array.isArray(data.urinePanel) && data.urinePanel.length) setUrinePanel(data.urinePanel);
        setLoaded(true);
      });
  }, [adminToken]);

  const save = async (oral, urine) => {
    setSaving(true);
    await fetch(`${API_BASE}/admin/app-settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ oralPanel: oral, urinePanel: urine })
    });
    setSaving(false);
  };

  if (!loaded) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="p-4 border-b">
        <h2 className="font-semibold">Drug Panel Configuration</h2>
        <p className="text-sm text-gray-500 mt-0.5">Substances available for selection when a Non-Negative result is recorded.</p>
      </div>
      <div className="p-4 space-y-6">
        {[
          { label: 'Oral Fluid Panel', panel: oralPanel, setPanel: setOralPanel, other: urinePanel, color: 'blue', newVal: newOral, setNew: setNewOral },
          { label: 'Urine Panel', panel: urinePanel, setPanel: setUrinePanel, other: oralPanel, color: 'purple', newVal: newUrine, setNew: setNewUrine },
        ].map(({ label, panel, setPanel, other, color, newVal, setNew }) => (
          <div key={label}>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">{label}</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {panel.map((s, i) => (
                <span key={s} className={`flex items-center gap-1 px-2.5 py-1 bg-${color}-50 border border-${color}-200 rounded-full text-sm text-${color}-800`}>
                  {s}
                  <button onClick={() => { const p = panel.filter((_, j) => j !== i); setPanel(p); save(label.includes('Oral') ? p : other, label.includes('Oral') ? other : p); }} className={`ml-1 text-${color}-400 hover:text-red-500`}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newVal} onChange={e => setNew(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newVal.trim() && !panel.includes(newVal.trim())) { const p = [...panel, newVal.trim()]; setPanel(p); save(label.includes('Oral') ? p : other, label.includes('Oral') ? other : p); setNew(''); } } }}
                placeholder="e.g. BUP" className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
              <button onClick={() => { if (newVal.trim() && !panel.includes(newVal.trim())) { const p = [...panel, newVal.trim()]; setPanel(p); save(label.includes('Oral') ? p : other, label.includes('Oral') ? other : p); setNew(''); } }}
                disabled={saving || !newVal.trim()} className={`px-3 py-1.5 bg-${color}-600 text-white rounded-lg text-sm hover:bg-${color}-700 disabled:opacity-50`}>Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Settings sub-tab: Employer / Categories ───────────────────────────────────
const SettingsEmployerPanel = ({ adminToken }) => {
  const [employerCategories, setEmployerCategories] = useState(['Employee', 'Contractor']);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/app-settings`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json()).then(data => {
        if (data.employerCategories) setEmployerCategories(data.employerCategories);
        setLoaded(true);
      });
  }, [adminToken]);

  const saveCategories = async (cats) => {
    setSaving(true);
    await fetch(`${API_BASE}/admin/app-settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ employerCategories: cats })
    });
    setSaving(false);
  };

  if (!loaded) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b"><h2 className="font-semibold">Employer Categories</h2></div>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-3">Configure the employer category types. The first category is the "Employee" type; all others are contractor types.</p>
          <div className="space-y-2 mb-4">
            {employerCategories.map((cat, idx) => (
              <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{cat}</span>
                  {idx === 0 && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Employee type</span>}
                </div>
                <button onClick={() => setEmployerCategories(employerCategories.filter((_, i) => i !== idx))}
                  disabled={employerCategories.length <= 1} className="text-red-500 hover:text-red-700 p-1 disabled:opacity-30">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newCategory.trim() && !employerCategories.includes(newCategory.trim())) { setEmployerCategories([...employerCategories, newCategory.trim()]); setNewCategory(''); } }}
              placeholder="New category name" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button onClick={() => { if (newCategory.trim() && !employerCategories.includes(newCategory.trim())) { setEmployerCategories([...employerCategories, newCategory.trim()]); setNewCategory(''); } }}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Add</button>
          </div>
          <button onClick={() => saveCategories(employerCategories)} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Categories'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── SettingsTab: thin wrapper with its own sub-tab bar ────────────────────────
const SettingsTab = ({ adminToken }) => {
  const [sub, setSub] = useState('general');
  const SUB_TABS = [
    { id: 'general',   label: 'General' },
    { id: 'drugpanel', label: 'Drug Panels' },
    { id: 'employer',  label: 'Employers' },
  ];
  return (
    <div>
      <div className="flex gap-1 mb-5 border-b">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${sub === t.id ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'general'   && <SettingsGeneralPanel   adminToken={adminToken} />}
      {sub === 'drugpanel' && <SettingsDrugPanelPanel adminToken={adminToken} />}
      {sub === 'employer'  && <SettingsEmployerPanel  adminToken={adminToken} />}
    </div>
  );
};

const SettingRow = ({ setting, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.ConfigValue);

  const handleSave = () => {
    onUpdate(setting.ConfigKey, value);
    setEditing(false);
  };

  return (
    <div className="p-4 flex items-center gap-4">
      <div className="flex-1">
        <p className="font-medium text-sm">{setting.ConfigKey}</p>
        {setting.Description && <p className="text-xs text-gray-500">{setting.Description}</p>}
      </div>
      <div className="flex-1">
        {editing ? (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-1 border rounded text-sm"
            autoFocus
          />
        ) : (
          <p className="text-sm text-gray-600 truncate">{setting.ConfigValue || '-'}</p>
        )}
      </div>
      <div>
        {editing ? (
          <button onClick={handleSave} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
            <Save className="w-3 h-3 inline" /> Save
          </button>
        ) : (
          <button onClick={() => setEditing(true)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200">
            Edit
          </button>
        )}
      </div>
    </div>
  );
};

const ClassificationTab = ({ adminToken }) => {
  const [patterns, setPatterns] = useState([]);
  const [newPattern, setNewPattern] = useState('');
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadPatterns();
  }, [adminToken]);

  const loadPatterns = () => {
    fetch(`${API_BASE}/admin/classification-patterns`, {
      headers: { 'X-Admin-Token': adminToken }
    })
      .then(r => r.json())
      .then(data => setPatterns(data.patterns || []))
      .finally(() => setLoading(false));
  };

  const savePatterns = async (newPatterns) => {
    await fetch(`${API_BASE}/admin/classification-patterns`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ patterns: newPatterns })
    });
    setPatterns(newPatterns);
  };

  const addPattern = () => {
    if (!newPattern.trim() || patterns.includes(newPattern.toLowerCase())) return;
    savePatterns([...patterns, newPattern.toLowerCase()]);
    setNewPattern('');
  };

  const removePattern = (pattern) => {
    savePatterns(patterns.filter(p => p !== pattern));
  };

  const reclassifyAll = async () => {
    setReclassifying(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/employers/reclassify`, { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
    } catch (err) {
      setMessage('Error reclassifying employers');
    } finally {
      setReclassifying(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="font-semibold mb-2">Employee/Contractor Classification</h2>
        <p className="text-sm text-gray-500 mb-4">
          Company names containing these patterns (case-insensitive) are classified as <strong>"Employee"</strong>. 
          All other companies are classified as <strong>"Contractor"</strong>.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {patterns.map(pattern => (
            <span key={pattern} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {pattern}
              <button onClick={() => removePattern(pattern)} className="ml-1 hover:text-blue-600">&times;</button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="Add pattern (e.g., companyname)"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
            onKeyPress={(e) => e.key === 'Enter' && addPattern()}
          />
          <button onClick={addPattern} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Add Pattern
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">Reclassify Existing Employers</h3>
        <p className="text-sm text-amber-700 mb-4">
          Run this to re-apply classification rules to all existing employers based on the patterns above.
        </p>
        <button 
          onClick={reclassifyAll} 
          disabled={reclassifying}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 inline mr-2 ${reclassifying ? 'animate-spin' : ''}`} />
          {reclassifying ? 'Reclassifying...' : 'Reclassify All Employers'}
        </button>
        {message && <p className="mt-3 text-sm text-amber-800">{message}</p>}
      </div>
    </div>
  );
};

const AuditTab = ({ adminToken }) => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [adminToken, page]);

  const loadLogs = () => {
    setLoading(true);
    fetch(`${API_BASE}/admin/audit-logs?limit=${limit}&offset=${page * limit}`, {
      headers: { 'X-Admin-Token': adminToken }
    })
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-semibold">Audit Logs ({total} total)</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setPage(p => Math.max(0, p - 1))} 
            disabled={page === 0}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1">Page {page + 1}</span>
          <button 
            onClick={() => setPage(p => p + 1)} 
            disabled={(page + 1) * limit >= total}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Record</th>
                <th className="text-left px-4 py-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map(log => (
                <tr key={log.AuditID} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {(log.Timestamp || log.CreatedAt) ? format(new Date(log.Timestamp || log.CreatedAt), 'dd/MM HH:mm') : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      log.Action === 'CREATE' ? 'bg-green-100 text-green-700' :
                      log.Action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                      log.Action === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                    }`}>
                      {log.Action}
                    </span>
                  </td>
                  <td className="px-4 py-2">{log.RecordType}</td>
                  <td className="px-4 py-2">{log.RecordID}</td>
                  <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{log.Description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const LEVEL_STYLES = {
  FATAL: 'bg-purple-100 text-purple-800 border-purple-200',
  ERROR: 'bg-red-100 text-red-700 border-red-200',
  WARN:  'bg-amber-100 text-amber-700 border-amber-200',
  INFO:  'bg-blue-100 text-blue-700 border-blue-200',
  UNKNOWN: 'bg-gray-100 text-gray-600 border-gray-200',
};

const LogEntry = ({ log, index }) => {
  const [open, setOpen] = useState(false);
  const ts = log.timestamp || log.ts;
  const level = log.level || 'UNKNOWN';
  const hasExtra = log.stack || log.body || log.frame || log.error || log.raw;

  const copyToClipboard = () => navigator.clipboard?.writeText(JSON.stringify(log, null, 2));

  return (
    <div className={`border-l-4 ${LEVEL_STYLES[level]?.split(' ')[2] || 'border-gray-200'} bg-white mb-1 rounded-r`}>
      <div
        className={`px-3 py-2 flex items-start gap-2 cursor-pointer hover:bg-gray-50 ${open ? 'bg-gray-50' : ''}`}
        onClick={() => hasExtra && setOpen(o => !o)}
      >
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-bold ${LEVEL_STYLES[level] || LEVEL_STYLES.UNKNOWN}`}>
          {level}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{log.message || log.raw}</p>
          {log.error && <p className="text-xs text-red-600 truncate">{log.error}</p>}
          {log.frame && <p className="text-xs text-gray-400 font-mono truncate">↳ {log.frame}</p>}
          <div className="flex flex-wrap gap-x-3 mt-0.5">
            {log.method && <span className="text-xs text-gray-400">{log.method} {log.url}</span>}
            {log.reqId && <span className="text-xs text-gray-400 font-mono">#{log.reqId}</span>}
            {log.reportId && <span className="text-xs text-gray-400">report: {log.reportId}</span>}
            {log.source === 'browser' && <span className="text-xs text-purple-500">browser</span>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {ts ? format(new Date(ts), 'HH:mm:ss') : '—'}
          </span>
          {hasExtra && <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>}
          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(); }}
            className="text-gray-300 hover:text-gray-500 text-xs px-1" title="Copy JSON">⎘</button>
        </div>
      </div>

      {open && hasExtra && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50 border-t">
          {log.body && (
            <div>
              <p className="text-xs font-medium text-gray-500 mt-2 mb-1">Request Body</p>
              <pre className="text-xs bg-white border rounded p-2 overflow-x-auto text-gray-700">
                {JSON.stringify(log.body, null, 2)}
              </pre>
            </div>
          )}
          {log.stack && (
            <div>
              <p className="text-xs font-medium text-gray-500 mt-2 mb-1">Stack Trace</p>
              <pre className="text-xs bg-white border rounded p-2 overflow-x-auto text-gray-500 max-h-48">
                {log.stack}
              </pre>
            </div>
          )}
          {log.raw && (
            <pre className="text-xs bg-white border rounded p-2 overflow-x-auto text-gray-500">{log.raw}</pre>
          )}
        </div>
      )}
    </div>
  );
};

const ErrorsTab = ({ adminToken }) => {
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logType, setLogType] = useState('error');
  const [levelFilter, setLevelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/admin/log-dates`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json()).then(setAvailableDates).catch(() => {});
  }, [adminToken]);

  useEffect(() => { loadLogs(); }, [adminToken, date, logType, levelFilter]);

  const loadLogs = () => {
    setLoading(true);
    const params = new URLSearchParams({ date, type: logType });
    if (levelFilter) params.set('level', levelFilter);
    fetch(`${API_BASE}/admin/error-logs?${params}`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json())
      .then(data => { setLogs(data.logs || []); setCounts(data.counts || {}); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  };

  const filtered = search
    ? logs.filter(l => JSON.stringify(l).toLowerCase().includes(search.toLowerCase()))
    : logs;

  const countBadge = (level, style) => {
    const n = counts[level];
    if (!n) return null;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${style}`}>{level} {n}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <select value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm">
            {availableDates.length > 0
              ? availableDates.map(d => <option key={d} value={d}>{d}</option>)
              : <option value={date}>{date}</option>}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Log type</label>
          <div className="flex gap-1">
            {[['error','Errors'],['app','App'],['access','Access']].map(([v,l]) => (
              <button key={v} onClick={() => setLogType(v)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${logType===v ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Level</label>
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="">All</option>
            {['FATAL','ERROR','WARN','INFO','DEBUG'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by any field..."
            className="w-full px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <button onClick={loadLogs} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
          ↺ Refresh
        </button>
      </div>

      {/* Summary badges */}
      {Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {countBadge('FATAL', 'bg-purple-100 text-purple-800')}
          {countBadge('ERROR', 'bg-red-100 text-red-700')}
          {countBadge('WARN',  'bg-amber-100 text-amber-700')}
          {countBadge('INFO',  'bg-blue-100 text-blue-700')}
          <span className="text-xs text-gray-400 self-center">
            {filtered.length !== total ? `${filtered.length} shown / ` : ''}{total} total
          </span>
        </div>
      )}

      {/* Log list */}
      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No log entries found</div>
        ) : (
          <div className="p-3 max-h-[600px] overflow-y-auto space-y-1">
            {filtered.map((log, i) => <LogEntry key={i} log={log} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Archive Tab ──────────────────────────────────────────────────────────────
const ArchiveTab = ({ adminToken }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const [view, setView] = useState('overview'); // overview | run | browse | persons | clinicians | settings
  const [counts, setCounts] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [archSettings, setArchSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    const [c, j, s] = await Promise.all([
      fetch(`${API_BASE}/admin/archive/data`, { headers: h }).then(r => r.json()),
      fetch(`${API_BASE}/admin/archive/jobs`, { headers: h }).then(r => r.json()),
      fetch(`${API_BASE}/admin/archive/settings`, { headers: h }).then(r => r.json()),
    ]);
    setCounts(c);
    setJobs(Array.isArray(j) ? j : []);
    setArchSettings(s);
  }, [adminToken]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const saveSettings = async () => {
    setSettingsSaving(true);
    await fetch(`${API_BASE}/admin/archive/settings`, { method: 'PUT', headers: h, body: JSON.stringify(archSettings) });
    setSettingsSaving(false);
    alert('Settings saved');
  };

  if (view === 'browse') return <ArchiveBrowser adminToken={adminToken} onBack={() => { setView('overview'); loadOverview(); }} />;
  if (view === 'run') return <RunArchiveModal adminToken={adminToken} onClose={() => { setView('overview'); loadOverview(); }} />;
  if (view === 'persons') return <ArchivePersonsModal adminToken={adminToken} onBack={() => { setView('overview'); loadOverview(); }} />;
  if (view === 'clinicians') return <ArchiveCliniciansModal adminToken={adminToken} onBack={() => { setView('overview'); loadOverview(); }} />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Tests', key: 'tests', icon: FlaskConical, color: 'blue' },
          { label: 'Training', key: 'training', icon: BookOpen, color: 'green' },
          { label: 'Events', key: 'events', icon: ClipboardList, color: 'purple' },
          { label: 'Patients', key: 'persons', icon: Users, color: 'orange' },
          { label: 'Clinicians', key: 'clinicians', icon: Users, color: 'rose' },
        ].map(({ label, key, icon: Icon, color }) => (
          <div key={key} className="bg-white rounded-xl border p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 text-${color}-500`} />
            <p className="text-2xl font-bold text-gray-800">{counts?.[key] ?? '—'}</p>
            <p className="text-xs text-gray-500">{label} archived</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setView('run')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
          <Archive className="w-4 h-4" /> Run Archive Job
        </button>
        <button onClick={() => setView('browse')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Search className="w-4 h-4" /> Browse Archived Data
        </button>
        <button onClick={() => setView('persons')}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          <Users className="w-4 h-4" /> Archive Patients
        </button>
        <button onClick={() => setView('clinicians')}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700">
          <Users className="w-4 h-4" /> Archive Clinicians
        </button>
      </div>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b font-semibold text-gray-800">Recent Archive Jobs</div>
          <div className="divide-y">
            {jobs.slice(0, 5).map(j => (
              <div key={j.JobID} className="px-4 py-3 text-sm flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-800">Cutoff: {j.CutoffDate}</p>
                  <p className="text-gray-500 text-xs">{j.ArchivedAt?.slice(0, 16).replace('T', ' ')} — {j.Note || 'No note'}</p>
                </div>
                <div className="text-xs text-right text-gray-500 space-y-0.5">
                  <div>{j.TestsArchived} tests · {j.TrainingArchived} training · {j.EventsArchived} events</div>
                  <div>{j.PersonsArchived} patients · {j.CliniciansArchived} clinicians</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-archive settings */}
      {archSettings && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Auto-Archive Settings</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={!!archSettings.autoArchiveEnabled}
              onChange={e => setArchSettings(s => ({ ...s, autoArchiveEnabled: e.target.checked }))}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-gray-700">Enable automatic archive</span>
          </label>
          {archSettings.autoArchiveEnabled && (
            <div className="grid grid-cols-2 gap-4 pl-7">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Run at hour (0–23)</label>
                <input type="number" min="0" max="23" value={archSettings.autoArchiveCronHour}
                  onChange={e => setArchSettings(s => ({ ...s, autoArchiveCronHour: parseInt(e.target.value) }))}
                  className="w-full px-3 py-1.5 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Archive records older than (months)</label>
                <input type="number" min="1" value={archSettings.autoArchiveCutoffMonths}
                  onChange={e => setArchSettings(s => ({ ...s, autoArchiveCutoffMonths: parseInt(e.target.value) }))}
                  className="w-full px-3 py-1.5 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Also archive patients inactive for (months, 0=off)</label>
                <input type="number" min="0" value={archSettings.autoArchiveIncludePersonsAfterMonths}
                  onChange={e => setArchSettings(s => ({ ...s, autoArchiveIncludePersonsAfterMonths: parseInt(e.target.value) }))}
                  className="w-full px-3 py-1.5 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Also archive clinicians inactive for (months, 0=off)</label>
                <input type="number" min="0" value={archSettings.autoArchiveIncludeCliniciansAfterMonths}
                  onChange={e => setArchSettings(s => ({ ...s, autoArchiveIncludeCliniciansAfterMonths: parseInt(e.target.value) }))}
                  className="w-full px-3 py-1.5 border rounded text-sm" />
              </div>
            </div>
          )}
          <button onClick={saveSettings} disabled={settingsSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> {settingsSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Run Archive Modal ────────────────────────────────────────────────────────
const RunArchiveModal = ({ adminToken, onClose }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const defaultCutoff = new Date();
  defaultCutoff.setFullYear(defaultCutoff.getFullYear() - 2);
  const [step, setStep] = useState('config'); // config | preview | running | done
  const [cutoffDate, setCutoffDate] = useState(defaultCutoff.toISOString().slice(0, 10));
  const [includePersonsAfterMonths, setIncludePersonsAfterMonths] = useState(0);
  const [includeCliniciansAfterMonths, setIncludeCliniciansAfterMonths] = useState(0);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadPreview = async () => {
    setStep('preview');
    const params = new URLSearchParams({ cutoffDate, includePersonsAfterMonths, includeCliniciansAfterMonths });
    const data = await fetch(`${API_BASE}/admin/archive/preview?${params}`, { headers: h }).then(r => r.json());
    setPreview(data);
  };

  const runArchive = async () => {
    setStep('running');
    setError('');
    try {
      const data = await fetch(`${API_BASE}/admin/archive/run`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ cutoffDate, includePersonsAfterMonths, includeCliniciansAfterMonths, note }),
      }).then(r => r.json());
      if (data.error) throw new Error(data.error);
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('preview');
    }
  };

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to overview
      </button>
      <div className="bg-white rounded-xl border max-w-2xl">
        <div className="p-4 border-b flex items-center gap-3">
          <Archive className="w-5 h-5 text-amber-600" />
          <h2 className="font-semibold text-gray-800">Run Archive Job</h2>
        </div>
        <div className="p-5 space-y-4">
          {step === 'config' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Important:</strong> Archiving moves records out of the live database into archive storage. 
                All archived data can be restored individually. This will lock out other users briefly while running.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Archive records with dates before</label>
                <input type="date" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-500 mt-1">Tests, training, checks and patient events before this date will be archived.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Also archive patients inactive for (months)</label>
                <input type="number" min="0" value={includePersonsAfterMonths}
                  onChange={e => setIncludePersonsAfterMonths(parseInt(e.target.value) || 0)}
                  className="px-3 py-2 border rounded-lg text-sm w-32" />
                <p className="text-xs text-gray-500 mt-1">0 = do not archive patients. Patients/clinicians are never archived by default.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Also archive clinicians inactive for (months)</label>
                <input type="number" min="0" value={includeCliniciansAfterMonths}
                  onChange={e => setIncludeCliniciansAfterMonths(parseInt(e.target.value) || 0)}
                  className="px-3 py-2 border rounded-lg text-sm w-32" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Annual archive 2024"
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <button onClick={loadPreview} className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">
                Preview What Will Be Archived →
              </button>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold text-blue-800">Archive preview — records before {cutoffDate}</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { label: 'AOD Tests', v: preview.tests },
                    { label: 'Training records + Checks', v: (preview.training || 0) + (preview.checks || 0) },
                    { label: 'Patient events', v: preview.events },
                    { label: 'Patients (inactivity)', v: preview.persons },
                    { label: 'Clinicians (inactivity)', v: preview.clinicians },
                  ].map(({ label, v }) => (
                    <div key={label} className="flex justify-between border-b border-blue-100 py-1">
                      <span className="text-blue-700">{label}</span>
                      <span className="font-bold text-blue-900">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-blue-700 text-xs pt-1">Total: {(preview.tests + (preview.training||0) + (preview.checks||0) + preview.events + preview.persons + preview.clinicians).toLocaleString()} records will be moved to archive.</p>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setStep('config')} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">← Back</button>
                <button onClick={runArchive} className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">
                  Confirm & Run Archive
                </button>
              </div>
            </>
          )}

          {step === 'running' && (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Archiving in progress — please wait…</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                <p className="font-semibold mb-2">✓ Archive complete — Job #{result.jobId}</p>
                <div className="space-y-1">
                  <p>{result.testsArchived} tests archived</p>
                  <p>{result.trainingArchived} training/check records archived</p>
                  <p>{result.eventsArchived} patient events archived</p>
                  <p>{result.personsArchived} patients archived</p>
                  <p>{result.cliniciansArchived} clinicians archived</p>
                </div>
              </div>
              <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Archive Browser ──────────────────────────────────────────────────────────
const ArchiveBrowser = ({ adminToken, onBack }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const [dataType, setDataType] = useState('tests');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: dataType, page, limit: LIMIT, search });
    const data = await fetch(`${API_BASE}/admin/archive/data?${params}`, { headers: h }).then(r => r.json());
    setRows(data.rows || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [dataType, page, search, adminToken]);

  useEffect(() => { setPage(1); }, [dataType, search]);
  useEffect(() => { load(); }, [load]);

  const restore = async (type, archiveId) => {
    if (!confirm('Restore this record to the live database?')) return;
    setRestoring(archiveId);
    const singularMap = { tests: 'test', training: 'training', events: 'event', persons: 'person', clinicians: 'clinician' };
    await fetch(`${API_BASE}/admin/archive/restore`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ type: singularMap[type], archiveId }),
    });
    setRestoring(null);
    load();
  };

  const typeLabels = { tests: 'Tests', training: 'Training & Checks', events: 'Patient Events', persons: 'Patients', clinicians: 'Clinicians' };

  const renderRow = (row) => {
    const d = row.Parsed || {};
    if (dataType === 'tests') return (
      <div className="px-4 py-3 text-sm grid grid-cols-4 gap-2 items-center">
        <div><p className="font-medium">{d.TestNumber || `Test #${row.OriginalID}`}</p><p className="text-xs text-gray-400">{d.TestDate}</p></div>
        <div className="text-gray-600">{d.OverallAODResult || '—'}</div>
        <div className="text-gray-500 text-xs">Archived: {row.JobArchivedAt?.slice(0, 10)}</div>
        <div className="text-right"><button onClick={() => restore(dataType, row.ArchiveID)} disabled={restoring === row.ArchiveID}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 ml-auto">
          <RotateCcw className="w-3 h-3" /> Restore</button></div>
      </div>
    );
    if (dataType === 'persons') return (
      <div className="px-4 py-3 text-sm grid grid-cols-4 gap-2 items-center">
        <div><p className="font-medium">{d.FullName || `Person #${row.OriginalID}`}</p><p className="text-xs text-gray-400">{d.EmployerName}</p></div>
        <div className="text-gray-500 text-xs">{row.Reason} — {row.ArchivedAt?.slice(0, 10)}</div>
        <div></div>
        <div className="text-right"><button onClick={() => restore(dataType, row.ArchiveID)} disabled={restoring === row.ArchiveID}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 ml-auto">
          <RotateCcw className="w-3 h-3" /> Restore</button></div>
      </div>
    );
    if (dataType === 'clinicians') return (
      <div className="px-4 py-3 text-sm grid grid-cols-4 gap-2 items-center">
        <div><p className="font-medium">{d.Name || `Clinician #${row.OriginalID}`}</p><p className="text-xs text-gray-400">{d.Credentials}</p></div>
        <div className="text-gray-500 text-xs">{row.Reason} — {row.ArchivedAt?.slice(0, 10)}</div>
        <div></div>
        <div className="text-right"><button onClick={() => restore(dataType, row.ArchiveID)} disabled={restoring === row.ArchiveID}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 ml-auto">
          <RotateCcw className="w-3 h-3" /> Restore</button></div>
      </div>
    );
    if (dataType === 'events') return (
      <div className="px-4 py-3 text-sm grid grid-cols-4 gap-2 items-center">
        <div><p className="font-medium">{d.PatientName || d.PersonID && `Patient #${d.PersonID}` || `Event #${row.OriginalID}`}</p><p className="text-xs text-gray-400">{d.EventDate} · {d.WrNwr}</p></div>
        <div className="text-gray-500 text-xs">{d.Workgroup || '—'}</div>
        <div className="text-gray-500 text-xs">Archived: {row.JobArchivedAt?.slice(0, 10)}</div>
        <div className="text-right"><button onClick={() => restore(dataType, row.ArchiveID)} disabled={restoring === row.ArchiveID}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 ml-auto">
          <RotateCcw className="w-3 h-3" /> Restore</button></div>
      </div>
    );
    return (
      <div className="px-4 py-3 text-sm grid grid-cols-4 gap-2 items-center">
        <div><p className="font-medium">{d.RecordType || row.RecordType} #{row.OriginalID}</p><p className="text-xs text-gray-400">{d.CompletionDate || d.CreatedAt?.slice(0,10)}</p></div>
        <div className="text-gray-500 text-xs">{d.PersonID && `Person #${d.PersonID}`}</div>
        <div className="text-gray-500 text-xs">Archived: {row.JobArchivedAt?.slice(0, 10)}</div>
        <div className="text-right"><button onClick={() => restore(dataType, row.ArchiveID)} disabled={restoring === row.ArchiveID}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 ml-auto">
          <RotateCcw className="w-3 h-3" /> Restore</button></div>
      </div>
    );
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to overview
      </button>
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {Object.entries(typeLabels).map(([k, v]) => (
              <button key={k} onClick={() => setDataType(k)}
                className={`px-3 py-1.5 rounded-lg text-sm ${dataType === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="outline-none text-sm w-40" />
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No archived {typeLabels[dataType].toLowerCase()} found</div>
        ) : (
          <div className="divide-y">{rows.map(r => <div key={r.ArchiveID}>{renderRow(r)}</div>)}</div>
        )}
        {total > LIMIT && (
          <div className="p-3 border-t flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {Math.ceil(total / LIMIT)} ({total} total)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Archive Persons Modal ────────────────────────────────────────────────────
const ArchivePersonsModal = ({ adminToken, onBack }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const [mode, setMode] = useState('manual'); // manual | employer | inactivity
  const [employers, setEmployers] = useState([]);
  const [employerId, setEmployerId] = useState('');
  const [inactiveMonths, setInactiveMonths] = useState(6);
  const [persons, setPersons] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/employers', { headers: h }).then(r => r.json()).then(setEmployers).catch(() => {});
  }, []);

  const loadPersons = async () => {
    setLoading(true);
    const params = new URLSearchParams({ mode });
    if (mode === 'employer' && employerId) params.set('employerId', employerId);
    if (mode === 'inactivity') params.set('inactiveMonths', inactiveMonths);
    const data = await fetch(`${API_BASE}/admin/archive/persons-eligible?${params}`, { headers: h }).then(r => r.json());
    setPersons(Array.isArray(data) ? data : []);
    setSelected(new Set());
    setLoading(false);
  };

  const toggleAll = () => {
    if (selected.size === persons.length) setSelected(new Set());
    else setSelected(new Set(persons.map(p => p.PersonID)));
  };

  const archiveSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`Archive ${selected.size} patient(s)? They will be moved to the archive and can be restored.`)) return;
    setSaving(true);
    await fetch(`${API_BASE}/admin/archive/persons`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ personIds: [...selected], reason: `Manual archive (${mode})` }),
    });
    setSaving(false);
    onBack();
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div className="bg-white rounded-xl border max-w-3xl">
        <div className="p-4 border-b font-semibold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" /> Archive Patients
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            {[['manual','Select Manually'],['employer','By Workplace'],['inactivity','By Inactivity']].map(([v,l]) => (
              <button key={v} onClick={() => { setMode(v); setPersons([]); }}
                className={`px-3 py-1.5 rounded-lg text-sm ${mode === v ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'employer' && (
            <select value={employerId} onChange={e => setEmployerId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Select employer…</option>
              {employers.map(e => <option key={e.EmployerID} value={e.EmployerID}>{e.CompanyName}</option>)}
            </select>
          )}
          {mode === 'inactivity' && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">Inactive for at least</label>
              <input type="number" min="1" value={inactiveMonths} onChange={e => setInactiveMonths(e.target.value)}
                className="w-20 px-2 py-1.5 border rounded text-sm" />
              <span className="text-sm text-gray-600">months (no test or event in that period)</span>
            </div>
          )}
          <button onClick={loadPersons} disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Load Patients'}
          </button>
          {persons.length > 0 && (
            <>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center gap-3 border-b text-sm">
                  <input type="checkbox" checked={selected.size === persons.length} onChange={toggleAll} className="w-4 h-4 accent-purple-600" />
                  <span>{selected.size} / {persons.length} selected</span>
                </div>
                <div className="divide-y max-h-64 overflow-y-auto">
                  {persons.map(p => (
                    <label key={p.PersonID} className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={selected.has(p.PersonID)}
                        onChange={() => setSelected(s => { const n = new Set(s); n.has(p.PersonID) ? n.delete(p.PersonID) : n.add(p.PersonID); return n; })}
                        className="w-4 h-4 accent-purple-600" />
                      <div className="flex-1">
                        <span className="font-medium">{p.FullName}</span>
                        {p.EmployerName && <span className="text-gray-400 ml-2 text-xs">({p.EmployerName})</span>}
                      </div>
                      <div className="text-xs text-gray-400 text-right">
                        Last test: {p.LastTest || 'never'}<br/>Last event: {p.LastEvent || 'never'}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={archiveSelected} disabled={saving || !selected.size}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Archiving…' : `Archive ${selected.size} Patient(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Archive Clinicians Modal ─────────────────────────────────────────────────
const ArchiveCliniciansModal = ({ adminToken, onBack }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const [clinicians, setClinicians] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/clinicians?includeInactive=false', { headers: h }).then(r => r.json()).then(data => {
      setClinicians(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggleAll = () => {
    if (selected.size === clinicians.length) setSelected(new Set());
    else setSelected(new Set(clinicians.map(c => c.ClinicianID)));
  };

  const archiveSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`Archive ${selected.size} clinician(s)? They can be restored later.`)) return;
    setSaving(true);
    await fetch(`${API_BASE}/admin/archive/clinicians`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ clinicianIds: [...selected], reason: 'Manual archive' }),
    });
    setSaving(false);
    onBack();
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div className="bg-white rounded-xl border max-w-2xl">
        <div className="p-4 border-b font-semibold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-rose-600" /> Archive Clinicians
        </div>
        <div className="p-5 space-y-4">
          {loading ? <p className="text-gray-400 text-sm">Loading…</p> : clinicians.length === 0 ? (
            <p className="text-gray-500 text-sm">No active clinicians found.</p>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center gap-3 border-b text-sm">
                  <input type="checkbox" checked={selected.size === clinicians.length} onChange={toggleAll} className="w-4 h-4 accent-rose-600" />
                  <span>{selected.size} / {clinicians.length} selected</span>
                </div>
                <div className="divide-y max-h-64 overflow-y-auto">
                  {clinicians.map(c => (
                    <label key={c.ClinicianID} className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={selected.has(c.ClinicianID)}
                        onChange={() => setSelected(s => { const n = new Set(s); n.has(c.ClinicianID) ? n.delete(c.ClinicianID) : n.add(c.ClinicianID); return n; })}
                        className="w-4 h-4 accent-rose-600" />
                      <span className="font-medium">{c.Name}</span>
                      {c.Credentials && <span className="text-xs text-gray-400">({c.Credentials})</span>}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={archiveSelected} disabled={saving || !selected.size}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Archiving…' : `Archive ${selected.size} Clinician(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── DOCUMENTS TAB ────────────────────────────────────────────────────────────

const ALLOWED_DOC_CATEGORIES = ['General', 'Policy', 'Procedure', 'Form', 'Reference', 'Training', 'Other'];

const DocumentsTab = ({ adminToken }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [form, setForm] = useState({ title: '', description: '', category: 'General' });
  const fileRef = React.useRef();

  const load = () => {
    setLoading(true);
    fetch('/api/documents')
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files[0];
    if (!file) return;
    if (!form.title.trim()) { setUploadStatus({ ok: false, msg: 'Title is required' }); return; }
    setUploading(true); setUploadStatus(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title.trim());
    fd.append('description', form.description);
    fd.append('category', form.category);
    try {
      const r = await fetch('/api/documents', { method: 'POST', body: fd });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error || 'Upload failed'); }
      setUploadStatus({ ok: true, msg: `"${form.title}" uploaded.` });
      setForm({ title: '', description: '', category: 'General' });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setUploadStatus({ ok: false, msg: err.message });
    } finally { setUploading(false); }
  };

  const saveEdit = async (id) => {
    await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFields),
    });
    setEditingId(null);
    load();
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    load();
  };

  const fmt = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Upload New Document</h2>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Document title" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {ALLOWED_DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Optional description" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">File <span className="text-red-500">*</span></label>
            <input ref={fileRef} type="file" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
          </div>
          {uploadStatus && (
            <p className={`text-sm ${uploadStatus.ok ? 'text-green-600' : 'text-red-600'}`}>{uploadStatus.msg}</p>
          )}
          <button type="submit" disabled={uploading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </button>
        </form>
      </div>

      {/* Document list */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Uploaded Documents ({docs.length})</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
        ) : docs.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No documents yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {docs.map(doc => (
              <div key={doc.DocumentID} className="p-4">
                {editingId === doc.DocumentID ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editFields.title} onChange={e => setEditFields(f => ({...f, title: e.target.value}))} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="Title" />
                      <select value={editFields.category} onChange={e => setEditFields(f => ({...f, category: e.target.value}))} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                        {ALLOWED_DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <input value={editFields.description} onChange={e => setEditFields(f => ({...f, description: e.target.value}))} className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="Description" />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(doc.DocumentID)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Save</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{doc.Title}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-500">{doc.Category}</span>
                      </div>
                      {doc.Description && <p className="text-sm text-gray-500 mt-0.5">{doc.Description}</p>}
                      <p className="text-xs text-gray-400 mt-1">{doc.FileName} {doc.FileSize > 0 ? `· ${fmt(doc.FileSize)}` : ''}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <a href={`/api/documents/${doc.DocumentID}/file`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                        <Download className="w-3.5 h-3.5" /> View
                      </a>
                      <button onClick={() => { setEditingId(doc.DocumentID); setEditFields({ title: doc.Title, description: doc.Description || '', category: doc.Category }); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDelete(doc.DocumentID, doc.Title)}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── TRIGGER / CONDITION DEFINITIONS ──────────────────────────────────────────
const TRIGGER_OPTIONS = [
  { value: 'new_test',   label: 'New Test Recorded' },
  { value: 'lab_result', label: 'Lab Result Entered' },
];

const CONDITION_OPTIONS = [
  { value: 'non_negative',   label: 'Non-Negative result (any)' },
  { value: 'bac_positive',   label: 'BAC Positive' },
  { value: 'drug_confirmed', label: 'Confirmed Drug Positive' },
  { value: 'pending_lab',    label: 'Sample sent to lab (pending)' },
  { value: 'all',            label: 'All tests (no filter)' },
];

const BLANK_RULE = () => ({
  id: Date.now().toString(),
  enabled: true,
  label: '',
  trigger: 'new_test',
  condition: 'non_negative',
  recipients: [],
  subjectTemplate: 'AOD Test Report — {TestNumber} — {PersonName} — {Result}',
});

const EmailRulesTab = ({ adminToken }) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [newRecip, setNewRecip] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/admin/email-rules`, { headers: { 'X-Admin-Token': adminToken } })
      .then(r => r.json())
      .then(data => { setRules(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminToken]);

  const save = async (nextRules) => {
    setSaving(true); setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/admin/email-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
        body: JSON.stringify(nextRules),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus({ ok: true, msg: 'Rules saved.' });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally { setSaving(false); }
  };

  const update = (id, patch) => {
    const next = rules.map(r => r.id === id ? { ...r, ...patch } : r);
    setRules(next);
  };

  const addRecip = (ruleId) => {
    const email = (newRecip[ruleId] || '').trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    if (rule.recipients.includes(email)) return;
    update(ruleId, { recipients: [...rule.recipients, email] });
    setNewRecip(p => ({ ...p, [ruleId]: '' }));
  };

  const removeRecip = (ruleId, email) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    update(ruleId, { recipients: rule.recipients.filter(e => e !== email) });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Email Notification Rules</h2>
            <p className="text-sm text-gray-500 mt-1">Automatically email a formatted PDF-style test report when certain conditions are met. SMTP must be configured and enabled in Settings → Email.</p>
          </div>
          <button onClick={() => setRules(r => [...r, BLANK_RULE()])}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
            <Plus className="w-4 h-4" /> Add Rule
          </button>
        </div>
      </div>

      {rules.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          <Mail className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No rules yet</p>
          <p className="text-sm mt-1">Click "Add Rule" to create your first notification.</p>
        </div>
      )}

      {rules.map((rule, idx) => (
        <div key={rule.id} className={`bg-white rounded-xl shadow-sm border ${rule.enabled ? 'border-blue-200' : 'border-gray-200 opacity-60'}`}>
          {/* Rule header */}
          <div className="flex items-center justify-between gap-3 p-4 border-b">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rule.enabled}
                  onChange={e => update(rule.id, { enabled: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
              <input value={rule.label}
                onChange={e => update(rule.id, { label: e.target.value })}
                placeholder={`Rule ${idx + 1} — give it a name`}
                className="text-sm font-medium border-b border-transparent focus:border-blue-400 focus:outline-none px-1 py-0.5 w-64" />
            </div>
            <button onClick={() => { const next = rules.filter(r => r.id !== rule.id); setRules(next); }}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Rule body */}
          <div className="p-4 space-y-4">
            {/* Trigger + Condition */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Trigger</label>
                <select value={rule.trigger} onChange={e => update(rule.id, { trigger: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                <select value={rule.condition} onChange={e => update(rule.id, { condition: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Subject template */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email Subject <span className="font-normal text-gray-400">(use {'{TestNumber}'}, {'{PersonName}'}, {'{Result}'}, {'{Employer}'})</span>
              </label>
              <input value={rule.subjectTemplate}
                onChange={e => update(rule.id, { subjectTemplate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Recipients</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {rule.recipients.map(email => (
                  <span key={email} className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-800">
                    {email}
                    <button onClick={() => removeRecip(rule.id, email)} className="ml-1 text-blue-400 hover:text-red-500">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="email"
                  value={newRecip[rule.id] || ''}
                  onChange={e => setNewRecip(p => ({ ...p, [rule.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecip(rule.id); } }}
                  placeholder="Add recipient email"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <button onClick={() => addRecip(rule.id)}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Save bar */}
      {rules.length > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border p-4">
          {status && (
            <span className={`text-sm ${status.ok ? 'text-green-600' : 'text-red-600'}`}>{status.msg}</span>
          )}
          <div className="ml-auto">
            <button onClick={() => save(rules)} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Rules'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Backup Manager ────────────────────────────────────────────────────────────

const BackupTab = ({ adminToken }) => {
  const [backups, setBackups]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [label, setLabel]         = useState('');
  const [toast, setToast]         = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const headers = { 'Content-Type': 'application/json', 'x-admin-token': adminToken };

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/backups`, { headers });
      if (!r.ok) throw new Error(await r.text());
      setBackups(await r.json());
    } catch (e) { showToast(e.message, false); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createBackup = async () => {
    setCreating(true);
    try {
      const r = await fetch(`${API_BASE}/admin/backups`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ label: label.trim() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || r.statusText); }
      const b = await r.json();
      showToast(`Backup created: ${b.name}`);
      setLabel('');
      load();
    } catch (e) { showToast(e.message, false); }
    finally { setCreating(false); }
  };

  const deleteBackup = async (name) => {
    try {
      const r = await fetch(`${API_BASE}/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE', headers });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || r.statusText); }
      showToast(`Deleted: ${name}`);
      setConfirmDel(null);
      load();
    } catch (e) { showToast(e.message, false); }
  };

  const downloadUrl = (name) => `${API_BASE}/admin/backups/${encodeURIComponent(name)}/download`;

  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Create backup */}
      <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-blue-600" /> Create Database Backup
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Takes a consistent snapshot of the database and compresses it to a <code>.7z</code> archive in the <code>backups/</code> folder.
          A WAL checkpoint is flushed first to ensure all data is captured.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. before-update, end-of-month"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={e => e.key === 'Enter' && !creating && createBackup()}
            />
          </div>
          <button
            onClick={createBackup}
            disabled={creating}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            {creating ? 'Creating…' : 'Create Backup'}
          </button>
        </div>
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-500" /> Stored Backups
            <span className="ml-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{backups.length}</span>
          </h3>
          <button onClick={load} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : backups.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No backups yet. Create one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2">Filename</th>
                <th className="text-left px-5 py-2">Size</th>
                <th className="text-left px-5 py-2">Created</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.name} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">{b.name}</td>
                  <td className="px-5 py-3 text-gray-500">{fmtSize(b.size)}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {b.createdAt ? format(new Date(b.createdAt), 'dd MMM yyyy HH:mm') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <a
                        href={downloadUrl(b.name)}
                        download={b.name}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                      {confirmDel === b.name ? (
                        <>
                          <button
                            onClick={() => deleteBackup(b.name)}
                            className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >Confirm Delete</button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="text-xs px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                          ><X className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(b.name)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Backups are stored at <code>backups/</code> in the application folder and are never modified by updates.
        Download and store copies off-site for disaster recovery.
      </p>
    </div>
  );
};

// ── Logs Viewer Tab ─────────────────────────────────────────────────────────
const LEVEL_COLORS = {
  ERROR:    'text-red-600 bg-red-50',
  FATAL:    'text-red-800 bg-red-100 font-bold',
  WARN:     'text-yellow-700 bg-yellow-50',
  DB_ERROR: 'text-orange-700 bg-orange-50',
  CLIENT:   'text-pink-700 bg-pink-50',
  INFO:     'text-blue-700 bg-blue-50',
  STARTUP:  'text-green-700 bg-green-50',
  AUDIT:    'text-purple-700 bg-purple-50',
  DEBUG:    'text-gray-500 bg-gray-50',
  AUTH:     'text-teal-700 bg-teal-50',
};

const LogsTab = ({ adminToken }) => {
  const h = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
  const [files, setFiles]           = useState([]);
  const [selected, setSelected]     = useState(null);
  const [content, setContent]       = useState(null); // string (txt) or {entries:[]} (log)
  const [loading, setLoading]       = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filter, setFilter]         = useState('');
  const [lines, setLines]           = useState(500);

  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const r = await fetch(`${API_BASE}/admin/logs`, { headers: h });
      const data = await r.json();
      setFiles(data);
    } catch {}
    setLoadingFiles(false);
  };

  const loadFile = async (filename, lineCount = lines) => {
    setSelected(filename);
    setLoading(true);
    setContent(null);
    try {
      const r = await fetch(`${API_BASE}/admin/logs/${filename}?lines=${lineCount}`, { headers: h });
      if (filename.endsWith('.txt')) {
        setContent({ type: 'txt', text: await r.text() });
      } else {
        const data = await r.json();
        setContent({ type: 'json', ...data });
      }
    } catch (e) {
      setContent({ type: 'txt', text: `Error loading file: ${e.message}` });
    }
    setLoading(false);
  };

  const fmt = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(1)} MB`;

  const fileGroups = files.reduce((acc, f) => {
    const isError = f.name.startsWith('error') || f.name.startsWith('errors');
    const key = isError ? 'Errors & Warnings' : 'Routine';
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const filteredEntries = content?.type === 'json'
    ? content.entries.filter(e => !filter || JSON.stringify(e).toLowerCase().includes(filter.toLowerCase()))
    : null;

  const filteredTxt = content?.type === 'txt'
    ? content.text.split('\n').filter(l => !filter || l.toLowerCase().includes(filter.toLowerCase())).join('\n')
    : null;

  return (
    <div className="flex gap-4" style={{ minHeight: 600 }}>
      {/* File list */}
      <div className="w-64 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-gray-700">Log Files</h3>
          <button onClick={loadFiles} className="text-xs text-blue-600 hover:underline">{loadingFiles ? '...' : 'Refresh'}</button>
        </div>
        {Object.entries(fileGroups).map(([group, groupFiles]) => (
          <div key={group} className="mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{group}</p>
            {groupFiles.map(f => (
              <button
                key={f.name}
                onClick={() => loadFile(f.name)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs mb-0.5 flex justify-between items-center ${
                  selected === f.name ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className="truncate mr-1">{f.name}</span>
                <span className="opacity-60 flex-shrink-0">{fmt(f.size)}</span>
              </button>
            ))}
          </div>
        ))}
        {!loadingFiles && files.length === 0 && (
          <p className="text-xs text-gray-400 italic">No log files yet. Logs appear after the server has run.</p>
        )}
      </div>

      {/* Content viewer */}
      <div className="flex-1 min-w-0">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <ScrollText className="w-8 h-8 mr-3 opacity-30" />
            Select a log file to view
          </div>
        )}
        {selected && (
          <>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-700">{selected}</span>
              {content?.totalLines && (
                <span className="text-xs text-gray-400">{content.totalLines} total lines, showing last {content.returned}</span>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  placeholder="Filter..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs w-36"
                />
                <select
                  value={lines}
                  onChange={e => { setLines(Number(e.target.value)); loadFile(selected, Number(e.target.value)); }}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value={100}>Last 100</option>
                  <option value={250}>Last 250</option>
                  <option value={500}>Last 500</option>
                  <option value={1000}>Last 1000</option>
                </select>
                <a
                  href={`${API_BASE}/admin/logs/${selected}?lines=99999`}
                  download={selected}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
              </div>
            </div>

            {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>}

            {/* Plain-text (.txt) viewer */}
            {!loading && content?.type === 'txt' && (
              <pre className="bg-gray-950 text-gray-100 rounded-xl p-4 text-xs font-mono overflow-auto" style={{ maxHeight: 560, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {filteredTxt || '(no matching lines)'}
              </pre>
            )}

            {/* JSON (.log) structured viewer */}
            {!loading && content?.type === 'json' && (
              <div className="overflow-auto rounded-xl border" style={{ maxHeight: 560 }}>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 w-36">Time</th>
                      <th className="text-left px-3 py-2 w-20">Level</th>
                      <th className="text-left px-3 py-2">Message / Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(filteredEntries || []).slice().reverse().map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-400 font-mono whitespace-nowrap">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString('en-AU', { hour12: false }) : e.ts || ''}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${LEVEL_COLORS[e.level] || 'text-gray-600 bg-gray-100'}`}>
                            {e.level || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-gray-800">
                            {e.message || e.raw || JSON.stringify(e)}
                          </div>
                          {(e.error || e.url || e.action || e.description) && (
                            <div className="text-gray-400 mt-0.5">
                              {e.method && e.url && <span className="mr-2">{e.method} {e.url}{e.status ? ` → ${e.status}` : ''}</span>}
                              {e.action && e.recordType && <span className="mr-2">{e.action} {e.recordType}{e.recordId ? ` #${e.recordId}` : ''}</span>}
                              {e.description && <span className="mr-2">{e.description}</span>}
                              {e.error && <span className="text-red-500">{e.error}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredEntries?.length === 0 && (
                      <tr><td colSpan={3} className="text-center py-6 text-gray-400">No entries match the filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Import Data tab ───────────────────────────────────────────────────────────
const ImportCard = ({ adminToken, type, title, hint }) => {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async (dryRun) => {
    if (!file) { setError('Choose a file first'); return; }
    setError(''); setResult(null); setBusy(dryRun ? 'preview' : 'import');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/admin/import/${type}?dryRun=${dryRun}`, {
        method: 'POST', headers: { 'X-Admin-Token': adminToken }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult({ ...data, dryRun });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(''); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Upload className="w-4 h-4 text-blue-600" /> {title}</h3>
      <p className="text-sm text-gray-500 mt-1 mb-3">{hint}</p>
      <input type="file" accept=".xlsx,.xls" onChange={e => { setFile(e.target.files[0]); setResult(null); setError(''); }}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-3" />
      <div className="flex gap-2">
        <button onClick={() => run(true)} disabled={!file || busy}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
          {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview (dry run)
        </button>
        <button onClick={() => run(false)} disabled={!file || busy}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
          {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import
        </button>
      </div>
      {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {result && (
        <div className={`mt-3 p-3 rounded-lg border text-sm ${result.dryRun ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <p className="font-medium mb-1">{result.dryRun ? 'Preview — nothing was written' : 'Import complete'} ({result.sheet})</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-700">
            <span>Rows processed: <b>{result.totalRows}</b></span>
            <span>{result.dryRun ? 'Would insert' : 'Inserted'}: <b className="text-green-700">{result.inserted}</b></span>
            <span>Duplicates skipped: <b>{result.duplicates}</b></span>
            <span>Blank/skipped: <b>{result.skipped}</b></span>
            <span>Errors: <b className={result.errors ? 'text-red-600' : ''}>{result.errors}</b></span>
            <span>New persons: <b>{result.created?.persons ?? 0}</b></span>
          </div>
          {result.backup && <p className="mt-2 text-xs text-gray-500">Safety backup created: {result.backup.name}</p>}
          {result.errorSamples?.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 list-disc pl-4">
              {result.errorSamples.map((e, i) => <li key={i}>row {e.row}: {e.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const ImportTab = ({ adminToken }) => (
  <div className="space-y-4">
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
      Upload the <b>AOD Tracker</b> or <b>Patient Tracker</b> Excel files. Only rows missing from the database
      are added — existing records are detected and skipped, so re-uploading the same file is safe.
      A compressed safety backup is taken automatically before every import. Use <b>Preview</b> to see what
      would change without writing anything.
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <ImportCard adminToken={adminToken} type="aod" title="AOD Tracker"
        hint="Reads the AOD_Base sheet (tests, workers, employers, clinicians)." />
      <ImportCard adminToken={adminToken} type="patient" title="Patient Tracker"
        hint="Reads the Patient Tracker sheet (clinical presentation events)." />
    </div>
  </div>
);

// ── Bulk Edit tab ─────────────────────────────────────────────────────────────
const BULK_ENTITY_LABELS = [
  { id: 'aod', label: 'AOD Tests' },
  { id: 'patient', label: 'Patient Events' },
  { id: 'person', label: 'Workers' },
  { id: 'employer', label: 'Employers' },
];

const BulkEditTab = ({ adminToken }) => {
  const [entity, setEntity] = useState('patient');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ rows: [], total: 0, columns: [], pk: 'EventID' });
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});      // `${id}:${col}` → value
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState('');
  const [bulkCol, setBulkCol] = useState('');
  const [bulkVal, setBulkVal] = useState('');
  const limit = 100;

  const load = async () => {
    setLoading(true); setEdits({}); setSelected(new Set()); setMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/bulk/${entity}?search=${encodeURIComponent(search)}&limit=${limit}&offset=${page * limit}`,
        { headers: { 'X-Admin-Token': adminToken } });
      const d = await res.json();
      setData(d);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entity, page]);

  const cellVal = (row, col) => {
    const k = `${row[data.pk]}:${col}`;
    return k in edits ? edits[k] : (row[col] ?? '');
  };
  const setCell = (row, col, v) => setEdits(e => ({ ...e, [`${row[data.pk]}:${col}`]: v }));

  const changedCount = Object.keys(edits).length;

  const saveEdits = async () => {
    const byId = {};
    for (const k of Object.keys(edits)) {
      const [id, col] = k.split(/:(.*)/s);
      (byId[id] ||= {})[col] = edits[k] === '' ? null : edits[k];
    }
    const updates = Object.entries(byId).map(([id, set]) => ({ id: Number(id), set }));
    if (!updates.length) return;
    setMsg('Backing up & saving…');
    const res = await fetch(`${API_BASE}/admin/bulk/${entity}/update`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ updates }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Saved ${d.updated} row(s). Backup: ${d.backup?.name || '—'}` : `Error: ${d.error}`);
    if (res.ok) load();
  };

  const applyBulk = async () => {
    if (!bulkCol || selected.size === 0) return;
    setMsg('Backing up & applying…');
    const res = await fetch(`${API_BASE}/admin/bulk/${entity}/update`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ ids: [...selected], set: { [bulkCol]: bulkVal === '' ? null : bulkVal } }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Updated ${d.updated} row(s). Backup: ${d.backup?.name || '—'}` : `Error: ${d.error}`);
    if (res.ok) load();
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} row(s)? A backup is taken first, but this cannot be undone from the UI.`)) return;
    setMsg('Backing up & deleting…');
    const res = await fetch(`${API_BASE}/admin/bulk/${entity}/delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Deleted ${d.deleted} row(s). Backup: ${d.backup?.name || '—'}` : `Error: ${d.error}`);
    if (res.ok) load();
  };

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === data.rows.length ? new Set() : new Set(data.rows.map(r => r[data.pk])));

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Edit cells inline then <b>Save changes</b>, or select rows and apply a value to one column across all of them.
        Every bulk change creates an automatic safety backup first.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={entity} onChange={e => { setEntity(e.target.value); setPage(0); }}
          className="px-3 py-2 border rounded-lg text-sm">
          {BULK_ENTITY_LABELS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(0), load())}
            placeholder="Search…" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <button onClick={() => { setPage(0); load(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Search</button>
        <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-2">
        <span className="text-sm text-gray-600 px-1">{selected.size} selected</span>
        <select value={bulkCol} onChange={e => setBulkCol(e.target.value)} className="px-2 py-1.5 border rounded text-sm">
          <option value="">Set column…</option>
          {data.columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={bulkVal} onChange={e => setBulkVal(e.target.value)} placeholder="to value" className="px-2 py-1.5 border rounded text-sm" />
        <button onClick={applyBulk} disabled={!bulkCol || selected.size === 0}
          className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm disabled:opacity-40">Apply to selected</button>
        <button onClick={deleteSelected} disabled={selected.size === 0}
          className="px-3 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-40 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
        <div className="flex-1" />
        <button onClick={saveEdits} disabled={changedCount === 0}
          className="px-4 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-40 flex items-center gap-1"><Save className="w-4 h-4" /> Save changes ({changedCount})</button>
      </div>

      {msg && <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">{msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-2"><input type="checkbox" checked={data.rows.length > 0 && selected.size === data.rows.length} onChange={toggleAll} /></th>
                <th className="px-2 py-2 text-left text-gray-400">{data.pk}</th>
                {data.columns.map(c => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map(row => (
                <tr key={row[data.pk]} className={selected.has(row[data.pk]) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-2 py-1 text-center"><input type="checkbox" checked={selected.has(row[data.pk])} onChange={() => toggle(row[data.pk])} /></td>
                  <td className="px-2 py-1 text-gray-400 font-mono">{row[data.pk]}</td>
                  {data.columns.map(c => {
                    const k = `${row[data.pk]}:${c}`;
                    const dirty = k in edits;
                    return (
                      <td key={c} className="px-1 py-1">
                        <input value={cellVal(row, c)} onChange={e => setCell(row, c, e.target.value)}
                          className={`w-full min-w-[90px] px-2 py-1 border rounded text-sm ${dirty ? 'border-green-400 bg-green-50' : 'border-transparent hover:border-gray-200'}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={data.columns.length + 2} className="text-center py-8 text-gray-400">No rows.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{data.total} total · page {page + 1}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50 flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Prev</button>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= data.total} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50 flex items-center gap-1">Next <ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
