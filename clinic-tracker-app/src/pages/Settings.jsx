import React, { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Database, Users, UserPlus, Loader2, X, Shield, Edit2, Trash2, GraduationCap, Plus, ChevronDown, Stethoscope, Check, GitMerge, Mail, CheckCircle, AlertCircle, Eye, EyeOff, Download, Upload, Pill, Bell } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { CsvImportModal } from './Employers';

const TRAINING_PACKAGES = ['HLT', 'PUA', 'RII', 'N/A'];

const Settings = () => {
  const { user, lookups, ptConfig: ctxPtConfig, loadAdminSettings, setPtConfigDirect } = useApp();
  const [activeTab, setActiveTab] = useState('general');

  // General tab state
  const [users, setUsers]                         = useState([]);
  const [roles, setRoles]                         = useState([]);
  const [loading, setLoading]                     = useState(true);
  const [showUserModal, setShowUserModal]         = useState(false);
  const [editingUser, setEditingUser]             = useState(null);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [userFilter, setUserFilter]               = useState('all'); // 'all' | 'clinicians' | 'non-clinicians'
  const [showClinicianImportModal, setShowClinicianImportModal] = useState(false);
  const [showTrainingUnitImportModal, setShowTrainingUnitImportModal] = useState(false);

  // Training tab state
  const [trainingUnits, setTrainingUnits]   = useState([]);
  const [trainers, setTrainers]             = useState([]);
  const [cpdTypes, setCpdTypes]             = useState([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [unitModal, setUnitModal]           = useState(null); // null | 'add' | item
  const [trainerModal, setTrainerModal]     = useState(null);
  const [cpdTypeModal, setCpdTypeModal]     = useState(null);
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

  // Test types state
  const [testTypes, setTestTypes]         = useState([]);
  const [testTypeModal, setTestTypeModal] = useState(null);
  const [showInactiveTypes, setShowInactiveTypes] = useState(false);

  // Patient lists tab state
  const [referralOptions, setReferralOptions]   = useState([]);
  const [patientLoading, setPatientLoading]     = useState(false);
  const [referralModal, setReferralModal]       = useState(null);

  // Patient Tracker config state
  const DEFAULT_PT_CFG = {
    showClassification: false, enableCamp: true,
    classifications: ['First Aid', 'Assessment Only', 'WR Review', 'NWR Review'],
    fatMtcClasses: ['FAT', 'MTC', 'LTI', 'Review'],
    injuryTypes: ['Laceration/Cut', 'Bruise/Contusion', 'Sprain/Strain', 'Fracture', 'Burn', 'Eye Injury', 'Insect Bite/Sting', 'Skin Irritation/Rash', 'Heat Related', 'Respiratory', 'Illness', 'Mental Health', 'Other'],
    bodyLocations: ['Head', 'Face', 'Eye', 'Ear', 'Neck', 'Shoulder', 'Upper Arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Finger', 'Chest', 'Back - Upper', 'Back - Lower', 'Abdomen', 'Hip', 'Thigh', 'Knee', 'Lower Leg', 'Ankle', 'Foot', 'Toe', 'Multiple', 'Other'],
    rtwPlans: ['Immediate RTW', 'Modified Duties', 'No RTW'],
  };
  const [ptCfg, setPtCfg] = useState(null);
  const [ptSaving, setPtSaving] = useState(false);
  const [ptNewItem, setPtNewItem] = useState({ classifications: '', fatMtcClasses: '', injuryTypes: '', bodyLocations: '', rtwPlans: '' });

  // Email / SMTP tab state
  const SMTP_DEFAULTS = { host: '', port: '587', secure: false, user: '', pass: '', fromName: '', fromAddress: '', enabled: false, rejectUnauthorized: true };
  const SMTP_PROVIDERS = [
    {
      id: 'gmail',
      label: 'Gmail',
      logo: 'G',
      logoColor: 'text-red-500 bg-red-50',
      host: 'smtp.gmail.com', port: '587', secure: false,
      note: 'Gmail requires an App Password — your regular password will not work.',
      steps: [
        'Go to myaccount.google.com → Security → 2-Step Verification (must be ON).',
        'Then: Security → App Passwords → select "Mail" + "Other" → Generate.',
        'Paste the 16-character app password in the Password field below.',
        'Use your full Gmail address as the Username.',
      ],
      link: 'https://myaccount.google.com/apppasswords',
      linkLabel: 'Open App Passwords',
    },
    {
      id: 'office365',
      label: 'Office 365',
      logo: 'O',
      logoColor: 'text-blue-600 bg-blue-50',
      host: 'smtp.office365.com', port: '587', secure: false,
      note: 'Office 365 SMTP AUTH must be enabled for the mailbox. App Passwords work if MFA is on.',
      steps: [
        'In Microsoft 365 Admin: Users → Active users → select user → Mail → Manage email apps → enable "Authenticated SMTP".',
        'If MFA is enabled: mysignins.microsoft.com → Security info → Add method → App password.',
        'Use your full Office 365 email as Username and the app password below.',
      ],
      link: 'https://mysignins.microsoft.com/security-info',
      linkLabel: 'Open Security Info',
    },
    {
      id: 'outlook',
      label: 'Outlook.com',
      logo: 'O',
      logoColor: 'text-sky-600 bg-sky-50',
      host: 'smtp-mail.outlook.com', port: '587', secure: false,
      note: 'Outlook.com supports App Passwords when two-step verification is enabled.',
      steps: [
        'Go to account.microsoft.com → Security → Advanced security options → App passwords.',
        'Create a new app password and paste it in the Password field below.',
        'Use your full @outlook.com / @hotmail.com address as Username.',
      ],
      link: 'https://account.microsoft.com/security',
      linkLabel: 'Open Account Security',
    },
    {
      id: 'custom',
      label: 'Custom / Other',
      logo: '✉',
      logoColor: 'text-gray-600 bg-gray-100',
      host: '', port: '587', secure: false,
      note: 'Enter your mail server details manually below.',
      steps: [
        'Contact your IT team or hosting provider for SMTP host, port, and credentials.',
        'Common settings: host = mail.yourdomain.com, port 587 with STARTTLS.',
      ],
      link: null,
    },
  ];
  const [smtp, setSmtp]               = useState(SMTP_DEFAULTS);
  const [smtpProvider, setSmtpProvider] = useState('custom');
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving]   = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpStatus, setSmtpStatus]   = useState(null); // null | { ok, msg }
  const [smtpTestTo, setSmtpTestTo]   = useState('');
  const [showPass, setShowPass]       = useState(false);

  // Integrations tab state
  const INTEGRATION_DEFAULTS = { medicationsApiUrl: '', medicationsApiKey: '', medicationsApiEnabled: false };
  const [integrations, setIntegrations] = useState(INTEGRATION_DEFAULTS);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsSaving, setIntegrationsSaving] = useState(false);
  const [integrationsStatus, setIntegrationsStatus] = useState(null);

  // Backups tab state
  const BACKUP_DEFAULTS = { enabled: true, time: '03:00', retentionDays: 30 };
  const [backups, setBackups] = useState(BACKUP_DEFAULTS);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsSaving, setBackupsSaving] = useState(false);
  const [backupsStatus, setBackupsStatus] = useState(null);

  // Security tab state
  const SECURITY_DEFAULTS = { sessionTimeout: 480, passwordMinLength: 8 };
  const [security, setSecurity] = useState(SECURITY_DEFAULTS);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityStatus, setSecurityStatus] = useState(null);

  // Notifications tab state
  const NOTIFICATION_DEFAULTS = { defaultEmail: '', notifyNonNegative: false };
  const [notifications, setNotifications] = useState(NOTIFICATION_DEFAULTS);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsStatus, setNotificationsStatus] = useState(null);

  // System tab state
  const SYSTEM_DEFAULTS = { companyName: 'SCJV', employeeLabel: 'Employees', labName: 'Testing Laboratory', bacPositive: 0.05, bacNonneg: 0.02 };
  const [system, setSystem] = useState(SYSTEM_DEFAULTS);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);

  // Load static data once on mount
  useEffect(() => { loadStaticData(); }, []);
  // Re-fetch users whenever inactive filter changes
  useEffect(() => { loadUsers(); }, [showInactiveUsers]);
  useEffect(() => { if (activeTab === 'training') loadTraining(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'patient') loadPatientLists(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'email') loadSmtp(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'integrations') loadIntegrations(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'backups') loadBackups(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'security') loadSecurity(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'notifications') loadNotifications(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'system') loadSystem(); }, [activeTab]);

  const loadSmtp = async () => {
    setSmtpLoading(true);
    try {
      const cfg = await api.getSmtpSettings();
      setSmtp({ ...SMTP_DEFAULTS, ...cfg });
      const matched = SMTP_PROVIDERS.find(p => p.host && p.host === cfg.host);
      setSmtpProvider(matched ? matched.id : 'custom');
    }
    catch { /* ignore */ }
    finally { setSmtpLoading(false); }
  };

  const selectProvider = (p) => {
    setSmtpProvider(p.id);
    setSmtpStatus(null);
    if (p.host) setSmtp(s => ({ ...s, host: p.host, port: p.port, secure: p.secure }));
  };

  const saveSmtp = async () => {
    setSmtpSaving(true); setSmtpStatus(null);
    try {
      await api.saveSmtpSettings(smtp);
      setSmtpStatus({ ok: true, msg: 'Settings saved.' });
    } catch (err) { setSmtpStatus({ ok: false, msg: err.message }); }
    finally { setSmtpSaving(false); }
  };

  const testSmtp = async () => {
    setSmtpTesting(true); setSmtpStatus(null);
    try {
      const result = await api.testSmtp({ ...smtp, sendTo: smtpTestTo || undefined });
      setSmtpStatus({ ok: true, msg: result.message });
    } catch (err) { setSmtpStatus({ ok: false, msg: err.message }); }
    finally { setSmtpTesting(false); }
  };

  const loadIntegrations = async () => {
    setIntegrationsLoading(true);
    try {
      const rows = await api.getSystemConfig();
      const map = (rows || []).reduce((acc, r) => { acc[r.ConfigKey] = r.ConfigValue; return acc; }, {});
      setIntegrations({
        medicationsApiUrl: map.MEDICATIONS_API_URL || '',
        medicationsApiKey: map.MEDICATIONS_API_KEY || '',
        medicationsApiEnabled: (map.MEDICATIONS_API_ENABLED || 'false').toLowerCase() === 'true',
      });
    } catch (err) { console.error(err); }
    finally { setIntegrationsLoading(false); }
  };

  const saveIntegrations = async () => {
    setIntegrationsSaving(true); setIntegrationsStatus(null);
    try {
      await Promise.all([
        api.updateSystemConfig('MEDICATIONS_API_URL', integrations.medicationsApiUrl.trim()),
        api.updateSystemConfig('MEDICATIONS_API_KEY', integrations.medicationsApiKey.trim()),
        api.updateSystemConfig('MEDICATIONS_API_ENABLED', integrations.medicationsApiEnabled ? 'true' : 'false'),
      ]);
      setIntegrationsStatus({ ok: true, msg: 'Integration settings saved.' });
    } catch (err) {
      setIntegrationsStatus({ ok: false, msg: err.message });
    } finally {
      setIntegrationsSaving(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const cfg = await api.getBackupConfig();
      setBackups({ ...BACKUP_DEFAULTS, ...cfg });
    } catch (err) { console.error(err); }
    finally { setBackupsLoading(false); }
  };

  const saveBackups = async () => {
    setBackupsSaving(true); setBackupsStatus(null);
    try {
      const days = parseInt(backups.retentionDays, 10);
      if (isNaN(days) || days < 1) throw new Error('Retention days must be at least 1');
      await api.saveBackupConfig({
        enabled: backups.enabled,
        time: backups.time,
        retentionDays: days,
      });
      setBackupsStatus({ ok: true, msg: 'Backup schedule saved. The server manager will pick this up on its next start.' });
    } catch (err) {
      setBackupsStatus({ ok: false, msg: err.message });
    } finally { setBackupsSaving(false); }
  };

  const loadSecurity = async () => {
    setSecurityLoading(true);
    try {
      const rows = await api.getSystemConfig();
      const map = (rows || []).reduce((acc, r) => { acc[r.ConfigKey] = r.ConfigValue; return acc; }, {});
      setSecurity({
        sessionTimeout: parseInt(map.SESSION_TIMEOUT || 480, 10),
        passwordMinLength: parseInt(map.PASSWORD_MIN_LENGTH || 8, 10),
      });
    } catch (err) { console.error(err); }
    finally { setSecurityLoading(false); }
  };

  const saveSecurity = async () => {
    setSecuritySaving(true); setSecurityStatus(null);
    try {
      const session = parseInt(security.sessionTimeout, 10);
      const minLen = parseInt(security.passwordMinLength, 10);
      if (isNaN(session) || session < 15) throw new Error('Session timeout must be at least 15 minutes');
      if (isNaN(minLen) || minLen < 4) throw new Error('Password minimum length must be at least 4');
      await Promise.all([
        api.updateSystemConfig('SESSION_TIMEOUT', String(session)),
        api.updateSystemConfig('PASSWORD_MIN_LENGTH', String(minLen)),
      ]);
      setSecurityStatus({ ok: true, msg: 'Security settings saved.' });
    } catch (err) {
      setSecurityStatus({ ok: false, msg: err.message });
    } finally { setSecuritySaving(false); }
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const rows = await api.getSystemConfig();
      const map = (rows || []).reduce((acc, r) => { acc[r.ConfigKey] = r.ConfigValue; return acc; }, {});
      setNotifications({
        defaultEmail: map.DEFAULT_NOTIFICATION_EMAIL || '',
        notifyNonNegative: (map.NOTIFY_NON_NEGATIVE || 'false').toLowerCase() === 'true',
      });
    } catch (err) { console.error(err); }
    finally { setNotificationsLoading(false); }
  };

  const saveNotifications = async () => {
    setNotificationsSaving(true); setNotificationsStatus(null);
    try {
      await Promise.all([
        api.updateSystemConfig('DEFAULT_NOTIFICATION_EMAIL', notifications.defaultEmail.trim()),
        api.updateSystemConfig('NOTIFY_NON_NEGATIVE', notifications.notifyNonNegative ? 'true' : 'false'),
      ]);
      setNotificationsStatus({ ok: true, msg: 'Notification settings saved.' });
    } catch (err) {
      setNotificationsStatus({ ok: false, msg: err.message });
    } finally { setNotificationsSaving(false); }
  };

  const loadSystem = async () => {
    setSystemLoading(true);
    try {
      const rows = await api.getSystemConfig();
      const map = (rows || []).reduce((acc, r) => { acc[r.ConfigKey] = r.ConfigValue; return acc; }, {});
      setSystem({
        companyName: map.COMPANY_NAME || 'SCJV',
        employeeLabel: map.EMPLOYEE_LABEL || 'Employees',
        labName: map.LAB_NAME || 'Testing Laboratory',
        bacPositive: parseFloat(map.BAC_POSITIVE_THRESHOLD || '0.05'),
        bacNonneg: parseFloat(map.BAC_NONNEG_THRESHOLD || '0.02'),
      });
    } catch (err) { console.error(err); }
    finally { setSystemLoading(false); }
  };

  const saveSystem = async () => {
    setSystemSaving(true); setSystemStatus(null);
    try {
      const pos = parseFloat(system.bacPositive);
      const nonneg = parseFloat(system.bacNonneg);
      if (isNaN(pos) || pos < 0) throw new Error('BAC positive threshold is invalid');
      if (isNaN(nonneg) || nonneg < 0) throw new Error('BAC non-negative threshold is invalid');
      await Promise.all([
        api.updateSystemConfig('COMPANY_NAME', system.companyName.trim()),
        api.updateSystemConfig('EMPLOYEE_LABEL', system.employeeLabel.trim()),
        api.updateSystemConfig('LAB_NAME', system.labName.trim()),
        api.updateSystemConfig('BAC_POSITIVE_THRESHOLD', String(pos)),
        api.updateSystemConfig('BAC_NONNEG_THRESHOLD', String(nonneg)),
      ]);
      setSystemStatus({ ok: true, msg: 'System settings saved.' });
    } catch (err) {
      setSystemStatus({ ok: false, msg: err.message });
    } finally { setSystemSaving(false); }
  };

  const loadStaticData = async () => {
    try {
      const [rolesData, ttData] = await Promise.all([
        api.getUserRoles(),
        api.getTestTypes(),
      ]);
      setRoles(rolesData);
      setTestTypes(ttData);
    } catch (err) { console.error(err); }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = showInactiveUsers ? { includeInactive: 'true' } : {};
      const usersData = await api.getUsers(params);
      setUsers(usersData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadGeneral = () => { loadStaticData(); loadUsers(); };

  const loadTraining = async () => {
    setTrainingLoading(true);
    try {
      const [units, trainerList, cpd] = await Promise.all([
        api.getTrainingUnits(),
        api.getTrainers(),
        api.getCPDTypes(),
      ]);
      setTrainingUnits(units);
      setTrainers(trainerList);
      setCpdTypes(cpd);
    } catch (err) { console.error(err); }
    finally { setTrainingLoading(false); }
  };

  const handleDeactivateUser = async (u) => {
    const label = u.FullName || u.Username;
    if (!confirm(`Deactivate "${label}"? They will be hidden from all dropdowns.`)) return;
    try { await api.deleteUser(u.UserID); loadGeneral(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleReactivateUser = async (u) => {
    try { await api.updateUser(u.UserID, { isActive: true }); loadGeneral(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleDeleteTestType = async (t) => {
    if (!confirm(`Deactivate test type "${t.Name}"? It will no longer appear in test dropdowns.`)) return;
    try { await api.deleteTestType(t.TestTypeID); loadGeneral(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleDeleteUnit = async (u) => {
    if (!confirm(`Delete unit "${u.Name}"?`)) return;
    try { await api.deleteTrainingUnit(u.TrainingUnitID); loadTraining(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleDeleteTrainer = async (t) => {
    if (!confirm(`Delete trainer "${t.Name}"?`)) return;
    try { await api.deleteTrainer(t.TrainerID); loadTraining(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleDeleteCPDType = async (t) => {
    if (!confirm(`Delete CPD type "${t.Name}"?`)) return;
    try { await api.deleteCPDType(t.CPDTypeID); loadTraining(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm('This will merge duplicate CPD Types (case-insensitive).\n\nFor example:\n- "Educational Activity" and "Educational activity" will become one entry\n\nContinue?')) return;
    try {
      const result = await api.cleanupDuplicateCPDTypes();
      alert(result.message);
      loadTraining();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  // Sync ptCfg from context once loaded
  useEffect(() => {
    if (ctxPtConfig && !ptCfg) setPtCfg({ ...DEFAULT_PT_CFG, ...ctxPtConfig });
  }, [ctxPtConfig]);

  const getPtCfg = () => ptCfg || DEFAULT_PT_CFG;

  const savePtCfg = async (updated) => {
    setPtSaving(true);
    try {
      await api.savePtConfig(updated);
      setPtCfg(updated);
      if (setPtConfigDirect) setPtConfigDirect(updated);
    } catch (err) { alert('Failed to save: ' + err.message); }
    finally { setPtSaving(false); }
  };

  const ptToggle = (key) => savePtCfg({ ...getPtCfg(), [key]: !getPtCfg()[key] });

  const ptAddItem = (listKey) => {
    const val = (ptNewItem[listKey] || '').trim();
    if (!val) return;
    const cur = getPtCfg();
    if ((cur[listKey] || []).includes(val)) return;
    savePtCfg({ ...cur, [listKey]: [...(cur[listKey] || []), val] });
    setPtNewItem(n => ({ ...n, [listKey]: '' }));
  };

  const ptRemoveItem = (listKey, item) => {
    const cur = getPtCfg();
    savePtCfg({ ...cur, [listKey]: (cur[listKey] || []).filter(v => v !== item) });
  };

  const loadPatientLists = useCallback(async () => {
    setPatientLoading(true);
    try { setReferralOptions(await api.getReferralOptions()); }
    catch (err) { console.error(err); }
    finally { setPatientLoading(false); }
  }, []);

  const handleDeleteReferral = async (opt) => {
    if (!confirm(`Delete referral option "${opt.Name}"?`)) return;
    try { await api.deleteReferralOption(opt.OptionID); loadPatientLists(); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const TABS = [
    { id: 'general',      label: 'General',        icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'patient',      label: 'Patient Lists',   icon: <Stethoscope className="w-4 h-4" /> },
    { id: 'training',     label: 'Training Lists',  icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations',    icon: <Pill className="w-4 h-4" /> },
    { id: 'backups',      label: 'Backups',         icon: <Database className="w-4 h-4" /> },
    { id: 'security',     label: 'Security',        icon: <Shield className="w-4 h-4" /> },
    { id: 'notifications',label: 'Notifications',   icon: <Bell className="w-4 h-4" /> },
    { id: 'system',       label: 'System',          icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'email',        label: 'Email / SMTP',    icon: <Mail className="w-4 h-4" /> },
  ];

  if (loading && activeTab === 'general') {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  const visibleUnits = showInactiveUnits ? trainingUnits : trainingUnits.filter(u => u.IsActive !== 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">System configuration and list management</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              activeTab === t.id ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {activeTab === 'general' && (
        <>
          {/* System Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" /> System Information
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{lookups.testTypes.length}</p>
                <p className="text-sm text-gray-500">Test Types</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{users.filter(u => u.IsClinician).length}</p>
                <p className="text-sm text-gray-500">Clinicians</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                <p className="text-sm text-gray-500">Users</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-lg font-bold text-blue-700">{user?.RoleName || user?.role}</p>
                <p className="text-sm text-blue-600">Your Role</p>
              </div>
            </div>
          </div>

          {/* Users & Clinicians */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" /> Users &amp; Clinicians
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter pills */}
                {['all','clinicians','non-clinicians'].map(f => (
                  <button key={f} onClick={() => setUserFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      userFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {f === 'all' ? 'All' : f === 'clinicians' ? 'Clinicians only' : 'Non-clinicians'}
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer ml-1">
                  <input type="checkbox" checked={showInactiveUsers}
                    onChange={e => setShowInactiveUsers(e.target.checked)} className="rounded border-gray-300" />
                  Show inactive
                </label>
                <a href="/api/clinicians/export/csv" download
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </a>
                <button onClick={() => setShowClinicianImportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </button>
                <button onClick={() => { setEditingUser(null); setShowUserModal(true); }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                  <UserPlus className="w-4 h-4" /> Add User
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Username</th>
                    <th className="text-left px-3 py-2">Unique ID</th>
                    <th className="text-left px-3 py-2">Role</th>
                    <th className="text-left px-3 py-2">Clinician</th>
                    <th className="text-left px-3 py-2">Credentials</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users
                    .filter(u => {
                      if (userFilter === 'clinicians') return !!u.IsClinician;
                      if (userFilter === 'non-clinicians') return !u.IsClinician;
                      return true;
                    })
                    .map(u => (
                      <tr key={u.UserID} className={`hover:bg-gray-50 ${!u.IsActive ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">
                            {u.DisplayName || (u.FirstName && u.LastName
                              ? `${u.FirstName.charAt(0)} ${u.LastName}`
                              : u.FullName)}
                          </div>
                          {u.Email && <div className="text-xs text-gray-400">{u.Email}</div>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{u.Username}</td>
                        <td className="px-3 py-2 text-gray-600">{u.UniqueID || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            (u.Role||'').includes('admin') ? 'bg-red-100 text-red-700' :
                            (u.Role||'').includes('super') ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{u.RoleName || '—'}</span>
                        </td>
                        <td className="px-3 py-2">
                          {u.IsClinician
                            ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Yes</span>
                            : <span className="text-gray-300 text-xs">No</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{u.Credentials || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${u.IsActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {u.IsActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            {u.IsActive ? (
                              <>
                                <button onClick={() => { setEditingUser(u); setShowUserModal(true); }}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {u.Username !== 'admin' && (
                                  <button onClick={() => handleDeactivateUser(u)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Deactivate">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => handleReactivateUser(u)}
                                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {users.filter(u => userFilter === 'clinicians' ? !!u.IsClinician : userFilter === 'non-clinicians' ? !u.IsClinician : true).length === 0 && (
                    <tr><td colSpan={8} className="text-center py-6 text-gray-400 text-sm">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Types */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" /> Test Types
                <span className="text-sm font-normal text-gray-400">({testTypes.filter(t => showInactiveTypes || t.IsActive !== 0).length})</span>
              </h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={showInactiveTypes}
                    onChange={e => setShowInactiveTypes(e.target.checked)} className="rounded border-gray-300" />
                  Show inactive
                </label>
                <button onClick={() => setTestTypeModal('add')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                  <Plus className="w-4 h-4" /> Add Type
                </button>
              </div>
            </div>
            <div className="divide-y border rounded-lg overflow-hidden">
              {testTypes.filter(t => showInactiveTypes || t.IsActive !== 0).map(t => (
                <div key={t.TestTypeID} className={`flex items-center justify-between px-3 py-2.5 ${t.IsActive === 0 ? 'bg-gray-50 opacity-60' : 'bg-white hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.Name}</p>
                    <p className="text-xs text-gray-400">Code: {t.Code}{t.Description ? ` · ${t.Description}` : ''}</p>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    {t.IsActive === 0 && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Inactive</span>}
                    <button onClick={() => setTestTypeModal(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {t.IsActive !== 0 && (
                      <button onClick={() => handleDeleteTestType(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {testTypes.filter(t => showInactiveTypes || t.IsActive !== 0).length === 0 && (
                <p className="py-6 text-center text-gray-400 text-sm">No test types found</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Patient Lists Tab ── */}
      {activeTab === 'patient' && (
        patientLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            {/* Referral Options */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5" /> Referral Options
                  <span className="text-sm font-normal text-gray-400">({referralOptions.length})</span>
                </h2>
                <button onClick={() => setReferralModal('add')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                  <Plus className="w-4 h-4" /> Add Option
                </button>
              </div>
              <div className="divide-y border rounded-lg overflow-hidden">
                {referralOptions.map((opt, idx) => (
                  <div key={opt.OptionID} className="flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                      <p className="text-sm font-medium text-gray-900">{opt.Name}</p>
                      {opt.Name === 'ED' && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">ED</span>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setReferralModal(opt)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteReferral(opt)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {referralOptions.length === 0 && <p className="py-6 text-center text-gray-400 text-sm">No referral options</p>}
              </div>
              <p className="text-xs text-gray-400 mt-2">These options appear in the Referral dropdown on the Patient Tracker.</p>
            </div>

            {/* Patient Tracker Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" /> Patient Tracker Configuration
                {ptSaving && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
              </h2>

              {/* Toggles */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Options</p>
                {[
                  { key: 'showClassification', label: 'Show Classification field (FAT / MTC / LTI)', desc: 'Adds Classification and FAT/MTC/LTI dropdowns to the event form' },
                  { key: 'enableCamp', label: 'Enable Camp & Camp Review options', desc: 'Shows Camp and Camp Review in the WR/NWR dropdown' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <button
                      onClick={() => ptToggle(key)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${
                        getPtCfg()[key] ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        getPtCfg()[key] ? 'translate-x-5' : ''
                      }`} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Editable lists */}
              {[
                { key: 'classifications', label: 'Classification options', hint: 'Used for the Classification dropdown (e.g. First Aid, Assessment Only)' },
                { key: 'fatMtcClasses', label: 'FAT / MTC / LTI options', hint: 'Used for the outcome classification dropdown' },
                { key: 'injuryTypes', label: 'Injury Types', hint: 'Appears in the Injury Type dropdown on the event form' },
                { key: 'bodyLocations', label: 'Body Locations', hint: 'Appears in the Body Location dropdown on the event form' },
                { key: 'rtwPlans', label: 'RTW Plan options', hint: 'Appears in the RTW Plan dropdown on the event form (e.g. Immediate RTW, Modified Duties, No RTW)' },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <p className="text-sm font-medium text-gray-700 mb-0.5">{label}</p>
                  <p className="text-xs text-gray-400 mb-2">{hint}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(getPtCfg()[key] || []).map(item => (
                      <span key={item} className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {item}
                        <button onClick={() => ptRemoveItem(key, item)} className="text-gray-400 hover:text-red-500 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ptNewItem[key] || ''}
                      onChange={e => setPtNewItem(n => ({ ...n, [key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), ptAddItem(key))}
                      placeholder={`Add ${label.toLowerCase()}…`}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => ptAddItem(key)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Email / SMTP Tab ── */}
      {activeTab === 'email' && (
        smtpLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            {/* Enable toggle */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Mail className="w-5 h-5" /> Email Notifications</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Configure the outbound SMTP server used to send notifications from the tracker.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${smtp.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    onClick={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${smtp.enabled ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{smtp.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>

            {/* Provider quick-setup */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Quick Setup</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SMTP_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => selectProvider(p)}
                    className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      smtpProvider === p.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-base ${p.logoColor}`}>{p.logo}</span>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Contextual app-password guide */}
              {(() => {
                const prov = SMTP_PROVIDERS.find(p => p.id === smtpProvider);
                if (!prov) return null;
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                    <p className="text-sm font-medium text-amber-800">{prov.note}</p>
                    <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                      {prov.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    {prov.link && (
                      <a href={prov.link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline hover:text-amber-900">
                        {prov.linkLabel} ↗
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Server settings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Server Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
                    placeholder="e.g. smtp.gmail.com, smtp.office365.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input type="number" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))}
                    placeholder="587"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <p className="text-xs text-gray-400 mt-1">587 = STARTTLS &nbsp;|&nbsp; 465 = SSL &nbsp;|&nbsp; 25 = plain</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={smtp.secure}
                    onChange={e => setSmtp(s => ({ ...s, secure: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  Use implicit SSL/TLS (port 465)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={smtp.rejectUnauthorized !== false}
                    onChange={e => setSmtp(s => ({ ...s, rejectUnauthorized: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  Verify TLS certificate
                </label>
              </div>
            </div>

            {/* Authentication */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Authentication</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username / Email</label>
                  <input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))}
                    placeholder="smtp-user@yourdomain.com"
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {smtpProvider === 'gmail' ? 'App Password (16-character Google app password)' :
                     smtpProvider === 'office365' ? 'Password or App Password (MFA accounts)' :
                     smtpProvider === 'outlook' ? 'App Password (from Microsoft account security)' :
                     'Password / App Password'}
                  </label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={smtp.pass}
                      onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))}
                      placeholder={smtpProvider === 'gmail' ? 'xxxx xxxx xxxx xxxx' : 'Leave blank to keep existing'}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm" />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* From address */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Sender Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                  <input value={smtp.fromName} onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))}
                    placeholder="AOD Tracker"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
                  <input type="email" value={smtp.fromAddress} onChange={e => setSmtp(s => ({ ...s, fromAddress: e.target.value }))}
                    placeholder="noreply@yourdomain.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {/* Test + Save */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Test Connection</h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Send test email to <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="email" value={smtpTestTo} onChange={e => setSmtpTestTo(e.target.value)}
                    placeholder="your@email.com — leave blank to test connection only"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <button onClick={testSmtp} disabled={smtpTesting || !smtp.host}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm whitespace-nowrap">
                  {smtpTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {smtpTestTo ? 'Test & Send' : 'Test Connection'}
                </button>
              </div>
              {smtpStatus && (
                <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                  smtpStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {smtpStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {smtpStatus.msg}
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button onClick={saveSmtp} disabled={smtpSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {smtpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </div>
        )
      )}

      {/* ── Integrations Tab ── */}
      {activeTab === 'integrations' && (
        integrationsLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Pill className="w-5 h-5" /> Medications Integration</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Display recent medications from an external clinical system on the patient viewer.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${integrations.medicationsApiEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    onClick={() => setIntegrations(s => ({ ...s, medicationsApiEnabled: !s.medicationsApiEnabled }))}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${integrations.medicationsApiEnabled ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{integrations.medicationsApiEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">External API Connection</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint URL</label>
                <input value={integrations.medicationsApiUrl}
                  onChange={e => setIntegrations(s => ({ ...s, medicationsApiUrl: e.target.value }))}
                  placeholder="https://meds.example.com/api/medications"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input type="password" value={integrations.medicationsApiKey}
                  onChange={e => setIntegrations(s => ({ ...s, medicationsApiKey: e.target.value }))}
                  placeholder="Leave blank to keep existing"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveIntegrations} disabled={integrationsSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {integrationsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Settings
              </button>
            </div>

            {integrationsStatus && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                integrationsStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {integrationsStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {integrationsStatus.msg}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Backups Tab ── */}
      {activeTab === 'backups' && (
        backupsLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Database className="w-5 h-5" /> Automatic Database Backups</h2>
                  <p className="text-sm text-gray-500 mt-0.5">The server manager will copy the live database each day to the backups folder.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${backups.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    onClick={() => setBackups(s => ({ ...s, enabled: !s.enabled }))}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${backups.enabled ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{backups.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Backup Time</label>
                  <input type="time" value={backups.time}
                    onChange={e => setBackups(s => ({ ...s, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keep Backups For (days)</label>
                  <input type="number" min={1} value={backups.retentionDays}
                    onChange={e => setBackups(s => ({ ...s, retentionDays: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveBackups} disabled={backupsSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {backupsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Backup Schedule
              </button>
            </div>

            {backupsStatus && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                backupsStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {backupsStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {backupsStatus.msg}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Security Tab ── */}
      {activeTab === 'security' && (
        securityLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Shield className="w-5 h-5" /> Authentication</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Control session length and password requirements.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
                  <input type="number" min={15} value={security.sessionTimeout}
                    onChange={e => setSecurity(s => ({ ...s, sessionTimeout: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <p className="text-xs text-gray-400 mt-1">How long before an idle login expires. Default: 480 minutes (8 hours).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Password Length</label>
                  <input type="number" min={4} value={security.passwordMinLength}
                    onChange={e => setSecurity(s => ({ ...s, passwordMinLength: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Applies to new and changed passwords.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveSecurity} disabled={securitySaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {securitySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Security Settings
              </button>
            </div>

            {securityStatus && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                securityStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {securityStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {securityStatus.msg}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Notifications Tab ── */}
      {activeTab === 'notifications' && (
        notificationsLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Bell className="w-5 h-5" /> Non-Negative Alerts</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Send an automatic email whenever an AOD test is recorded as non-negative.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${notifications.notifyNonNegative ? 'bg-blue-600' : 'bg-gray-300'}`}
                    onClick={() => setNotifications(s => ({ ...s, notifyNonNegative: !s.notifyNonNegative }))}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.notifyNonNegative ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{notifications.notifyNonNegative ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Notification Email</label>
                <input type="email" value={notifications.defaultEmail}
                  onChange={e => setNotifications(s => ({ ...s, defaultEmail: e.target.value }))}
                  placeholder="safety@example.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Used when no custom email rule matches.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveNotifications} disabled={notificationsSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {notificationsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Notifications
              </button>
            </div>

            {notificationsStatus && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                notificationsStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {notificationsStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {notificationsStatus.msg}
              </div>
            )}
          </div>
        )
      )}

      {/* ── System Tab ── */}
      {activeTab === 'system' && (
        systemLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Organisation &amp; Defaults</h2>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input value={system.companyName}
                    onChange={e => setSystem(s => ({ ...s, companyName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee Label</label>
                  <input value={system.employeeLabel}
                    onChange={e => setSystem(s => ({ ...s, employeeLabel: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lab Name</label>
                  <input value={system.labName}
                    onChange={e => setSystem(s => ({ ...s, labName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">BAC Thresholds</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Positive Threshold (%)</label>
                  <input type="number" step="0.001" value={system.bacPositive}
                    onChange={e => setSystem(s => ({ ...s, bacPositive: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Non-Negative Threshold (%)</label>
                  <input type="number" step="0.001" value={system.bacNonneg}
                    onChange={e => setSystem(s => ({ ...s, bacNonneg: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveSystem} disabled={systemSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {systemSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save System Settings
              </button>
            </div>

            {systemStatus && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
                systemStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {systemStatus.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {systemStatus.msg}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Training Lists Tab ── */}
      {activeTab === 'training' && (
        trainingLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <>
            {/* Training Units */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" /> Competency Units
                  <span className="text-sm font-normal text-gray-400">({visibleUnits.length})</span>
                </h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={showInactiveUnits}
                      onChange={e => setShowInactiveUnits(e.target.checked)} className="rounded border-gray-300" />
                    Show inactive
                  </label>
                  <a href="/api/training-units/export/csv" download className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <Download className="w-3.5 h-3.5"/> Export
                  </a>
                  <button onClick={() => setShowTrainingUnitImportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <Upload className="w-3.5 h-3.5"/> Import
                  </button>
                  <button onClick={() => setUnitModal('add')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /> Add Unit
                  </button>
                </div>
              </div>
              {TRAINING_PACKAGES.map(pkg => {
                const pkgUnits = visibleUnits.filter(u => u.TrainingPackage === pkg);
                if (!pkgUnits.length) return null;
                return (
                  <div key={pkg} className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1 px-1">{pkg}</p>
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {pkgUnits.map(u => (
                        <div key={u.TrainingUnitID} className={`flex justify-between items-center px-3 py-2 ${u.IsActive === 0 ? 'bg-gray-50 opacity-60' : 'bg-white hover:bg-gray-50'}`}>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{u.Name}</p>
                            {u.Code && <p className="text-xs text-gray-400">{u.Code}</p>}
                          </div>
                          <div className="flex gap-1.5 items-center">
                            {u.IsActive === 0 && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Inactive</span>}
                            <button onClick={() => setUnitModal(u)} className="p-1 text-gray-400 hover:text-blue-600">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteUnit(u)} className="p-1 text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {visibleUnits.length === 0 && <p className="py-6 text-center text-gray-400">No units found</p>}
            </div>

            {/* Trainers */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5" /> Trainers
                  <span className="text-sm font-normal text-gray-400">({trainers.length})</span>
                </h2>
                <button onClick={() => setTrainerModal('add')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                  <Plus className="w-4 h-4" /> Add Trainer
                </button>
              </div>
              <div className="divide-y">
                {trainers.map(t => (
                  <div key={t.TrainerID} className={`py-3 flex justify-between items-center ${t.IsActive === 0 ? 'opacity-50' : ''}`}>
                    <div>
                      <p className="font-medium text-gray-900">{t.Name}</p>
                      <p className="text-sm text-gray-500">
                        {t.Qualifications || 'No qualifications listed'}
                        {t.Email && ` • ${t.Email}`}
                        {t.Phone && ` • ${t.Phone}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setTrainerModal(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteTrainer(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {trainers.length === 0 && <p className="py-6 text-center text-gray-400">No trainers added yet</p>}
              </div>
            </div>

            {/* CPD Types */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5" /> CPD Activity Types
                  <span className="text-sm font-normal text-gray-400">({cpdTypes.length})</span>
                </h2>
                <div className="flex gap-2">
                  <button onClick={handleCleanupDuplicates}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200"
                    title="Clean up duplicate entries">
                    <GitMerge className="w-4 h-4" /> Clean Duplicates
                  </button>
                  <button onClick={() => setCpdTypeModal('add')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /> Add Type
                  </button>
                </div>
              </div>
              <div className="divide-y">
                {cpdTypes.map(t => (
                  <div key={t.CPDTypeID} className="py-2.5 flex justify-between items-center">
                    <p className="text-sm font-medium text-gray-900">{t.Name}</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setCpdTypeModal(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteCPDType(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {cpdTypes.length === 0 && <p className="py-6 text-center text-gray-400">No CPD types added yet</p>}
              </div>
            </div>
          </>
        )
      )}

      {/* Modals */}
      {showClinicianImportModal && (
        <CsvImportModal
          title="Import Clinicians"
          tooltip={[
            'Required: Name',
            'Optional: EmployeeNumber, Credentials, Email',
            'Existing clinicians matched by name (case-insensitive).',
            'DOB is not applicable for clinicians.',
          ]}
          columns={['Name','EmployeeNumber','Credentials','Email']}
          exampleRow={['Jane Smith','C001','RN, FACEM','jane@clinic.com']}
          onImport={api.importCliniciansCsv.bind(api)}
          onClose={() => setShowClinicianImportModal(false)}
          onImported={loadGeneral}
        />
      )}
      {showTrainingUnitImportModal && (
        <CsvImportModal
          title="Import Training Units"
          tooltip={[
            'Required: Name, TrainingPackage (e.g. HLT, PUA, RII, N/A)',
            'Optional: Code, Category',
            'Existing units matched by Name + TrainingPackage.',
            'TrainingPackage must exactly match one of: HLT, PUA, RII, N/A',
          ]}
          columns={['Code','Name','TrainingPackage','Category']}
          exampleRow={['HLTAID011','Provide First Aid','HLT','First Aid']}
          onImport={api.importTrainingUnitsCsv.bind(api)}
          onClose={() => setShowTrainingUnitImportModal(false)}
          onImported={loadTraining}
        />
      )}
      {showUserModal && (
        <UserModal
          user={editingUser}
          roles={roles}
          onClose={() => { setShowUserModal(false); setEditingUser(null); }}
          onSave={() => { loadGeneral(); setShowUserModal(false); setEditingUser(null); }}
        />
      )}
      {unitModal && (
        <TrainingUnitModal unit={unitModal === 'add' ? null : unitModal}
          onClose={() => setUnitModal(null)}
          onSave={() => { loadTraining(); setUnitModal(null); }} />
      )}
      {referralModal && (
        <ReferralOptionModal option={referralModal === 'add' ? null : referralModal}
          onClose={() => setReferralModal(null)}
          onSave={() => { loadPatientLists(); setReferralModal(null); }} />
      )}
      {trainerModal && (
        <TrainerModal trainer={trainerModal === 'add' ? null : trainerModal}
          onClose={() => setTrainerModal(null)}
          onSave={() => { loadTraining(); setTrainerModal(null); }} />
      )}
      {cpdTypeModal && (
        <CPDTypeModal cpdType={cpdTypeModal === 'add' ? null : cpdTypeModal}
          onClose={() => setCpdTypeModal(null)}
          onSave={() => { loadTraining(); setCpdTypeModal(null); }} />
      )}
      {testTypeModal && (
        <TestTypeModal
          testType={testTypeModal}
          onClose={() => setTestTypeModal(null)}
          onSave={() => { setTestTypeModal(null); loadGeneral(); }}
        />
      )}
    </div>
  );
};

const ROLE_COLORS = { admin: 'bg-red-100 text-red-700', supervisor: 'bg-orange-100 text-orange-700', user: 'bg-blue-100 text-blue-700' };

const UserModal = ({ user, roles, onClose, onSave }) => {
  const isEditing = !!user;
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const [form, setForm] = useState({
    firstName:   user?.FirstName   || '',
    lastName:    user?.LastName    || '',
    username:    user?.Username    || '',
    password:    '',
    email:       user?.Email       || '',
    uniqueId:    user?.UniqueID    || '',
    roleId:      user?.RoleID      ? String(user.RoleID) : '',
    isClinician: user ? !!user.IsClinician : false,
    credentials: user?.Credentials || '',
    isActive:    user ? !!user.IsActive : true,
    displayName: user?.DisplayName || '',
  });
  const [saving, setSaving] = useState(false);
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const chk = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEditing && !form.password) { alert('Password is required for new users.'); return; }
    setSaving(true);
    try {
      const payload = {
        firstName:   form.firstName,
        lastName:    form.lastName,
        email:       form.email,
        uniqueId:    form.uniqueId,
        roleId:      form.roleId ? parseInt(form.roleId) : null,
        isClinician: form.isClinician,
        credentials: form.credentials,
        isActive:    form.isActive,
        displayName: form.displayName || null,
      };
      if (form.password) payload.password = form.password;
      if (!isEditing) payload.username = form.username;
      if (isEditing) {
        await api.updateUser(user.UserID, payload);
      } else {
        await api.createUser(payload);
      }
      onSave();
    } catch (err) {
      alert(`Failed to ${isEditing ? 'update' : 'create'} user: ` + err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input type="text" value={form.firstName} onChange={f('firstName')} className={inp} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input type="text" value={form.lastName} onChange={f('lastName')} className={inp} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input type="text" value={form.displayName} onChange={f('displayName')} className={inp}
              placeholder={`Auto: ${form.firstName.charAt(0) || 'J'} ${form.lastName || 'Smith'}`} />
            <p className="text-xs text-gray-400 mt-0.5">Shown on tests and records. Leave blank for auto-generated.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input type="text" value={form.username} onChange={f('username')} className={inp}
                required={!isEditing} disabled={isEditing}
                placeholder={isEditing ? '(cannot change)' : ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isEditing ? 'New Password (leave blank to keep)' : 'Password *'}
              </label>
              <input type="password" value={form.password} onChange={f('password')} className={inp}
                required={!isEditing} placeholder={isEditing ? '••••••••' : ''} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unique ID / Employee #</label>
              <input type="text" value={form.uniqueId} onChange={f('uniqueId')} className={inp} placeholder="e.g. C001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select value={form.roleId} onChange={f('roleId')} className={inp} required>
                <option value="">Select role…</option>
                {roles.map(r => <option key={r.RoleID} value={r.RoleID}>{r.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credentials</label>
              <input type="text" value={form.credentials} onChange={f('credentials')} className={inp} placeholder="e.g. RN, BAT Certified" />
            </div>
          </div>
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isClinician} onChange={chk('isClinician')} className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm font-medium text-gray-700">Clinician / Tester</span>
              <span className="text-xs text-gray-400">(appears in test dropdown)</span>
            </label>
            {isEditing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={chk('isActive')} className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400">
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TrainingUnitModal = ({ unit, onClose, onSave }) => {
  const [form, setForm] = useState({
    code: unit?.Code || '',
    name: unit?.Name || '',
    trainingPackage: unit?.TrainingPackage || '',
    category: unit?.Category || '',
    isActive: unit?.IsActive ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const f = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (unit) await api.updateTrainingUnit(unit.TrainingUnitID, form);
      else await api.createTrainingUnit(form);
      onSave();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{unit ? 'Edit Unit' : 'Add Unit'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Code</label>
            <input type="text" value={form.code} onChange={f('code')} placeholder="e.g. HLTAID011"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Name *</label>
            <input type="text" value={form.name} onChange={f('name')} required
              placeholder="e.g. Provide First Aid"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Training Package *</label>
            <select value={form.trainingPackage} onChange={f('trainingPackage')} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Select...</option>
              {TRAINING_PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={f('category')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">None</option>
              <option value="MEDICAL">MEDICAL</option>
              <option value="RESCUE">RESCUE</option>
            </select>
          </div>
          {unit && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={!!form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked ? 1 : 0 }))}
                className="w-4 h-4 accent-blue-600" />
              Active
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400">
              {saving ? 'Saving...' : unit ? 'Save Changes' : 'Add Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TrainerModal = ({ trainer, onClose, onSave }) => {
  const [form, setForm] = useState({
    name: trainer?.Name || '',
    qualifications: trainer?.Qualifications || '',
    email: trainer?.Email || '',
    phone: trainer?.Phone || '',
    isActive: trainer?.IsActive ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const f = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (trainer) await api.updateTrainer(trainer.TrainerID, form);
      else await api.createTrainer(form);
      onSave();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{trainer ? 'Edit Trainer' : 'Add Trainer'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={form.name} onChange={f('name')} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
            <input type="text" value={form.qualifications} onChange={f('qualifications')}
              placeholder="e.g. RN, CERT IV TAE" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={f('email')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="text" value={form.phone} onChange={f('phone')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          {trainer && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={!!form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked ? 1 : 0 }))}
                className="w-4 h-4 accent-blue-600" />
              Active
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400">
              {saving ? 'Saving...' : trainer ? 'Save Changes' : 'Add Trainer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CPDTypeModal = ({ cpdType, onClose, onSave }) => {
  const [name, setName]     = useState(cpdType?.Name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (cpdType) await api.updateCPDType(cpdType.CPDTypeID, { name, isActive: 1 });
      else await api.createCPDType({ name });
      onSave();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{cpdType ? 'Edit CPD Type' : 'Add CPD Type'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="e.g. Educational activity"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400">
              {saving ? 'Saving...' : cpdType ? 'Save Changes' : 'Add Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TestTypeModal = ({ testType, onClose, onSave }) => {
  const isEdit = !!testType && testType !== 'add';
  const [form, setForm] = useState({
    name: isEdit ? testType.Name : '',
    code: isEdit ? testType.Code : '',
    description: isEdit ? (testType.Description || '') : '',
    isActive: isEdit ? testType.IsActive !== 0 : true,
  });
  const [saving, setSaving] = useState(false);
  const f = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) await api.updateTestType(testType.TestTypeID, { ...form, isActive: form.isActive });
      else await api.createTestType(form);
      onSave();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Test Type' : 'Add Test Type'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={form.name} onChange={f('name')} required autoFocus
              placeholder="e.g. Random"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code * <span className="font-normal text-gray-400">(short identifier)</span></label>
            <input type="text" value={form.code} onChange={f('code')} required
              placeholder="e.g. RND"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm uppercase" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" value={form.description} onChange={f('description')}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 accent-blue-600" />
              Active
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ReferralOptionModal = ({ option, onClose, onSave }) => {
  const isEdit = !!option;
  const [name, setName] = useState(option?.Name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) await api.updateReferralOption(option.OptionID, { name, sortOrder: option.SortOrder ?? 0 });
      else await api.createReferralOption({ name, sortOrder: 0 });
      onSave();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit Referral Option' : 'Add Referral Option'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus
              placeholder="e.g. Physio, ED, Return to work..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Option'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
