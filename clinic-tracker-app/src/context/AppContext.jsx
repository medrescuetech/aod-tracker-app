import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

let _adminSettingsCache = null;
let _adminSettingsCacheTime = 0;
const ADMIN_SETTINGS_TTL = 30_000; // 30 seconds

export const AppProvider = ({ children }) => {
  const [lookups, setLookups] = useState({
    sexes: [],
    workerTypes: [],
    testTypes: [],
    resultClassifications: [],
    config: []
  });
  const [employerCategories, setEmployerCategories] = useState(['Employee', 'Contractor']);
  const [currentUser, setCurrentUser] = useState(null);
  const [ptConfig, setPtConfig] = useState(null);
  const [hideBadgeNumber, setHideBadgeNumber] = useState(false);
  const [oralPanel, setOralPanel] = useState(['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO']);
  const [urinePanel, setUrinePanel] = useState(['THC', 'AMP', 'MET', 'COC', 'OPI', 'OXY', 'BZO']);

  // Load lookups and settings on mount
  useEffect(() => {
    loadLookups();
    loadAdminSettings();
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const data = await api.getLookups();
      setLookups(data);
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
  }, []);

  const loadAdminSettings = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && _adminSettingsCache && (now - _adminSettingsCacheTime) < ADMIN_SETTINGS_TTL) {
      const settings = _adminSettingsCache;
      if (settings?.employerCategories) setEmployerCategories(settings.employerCategories);
      if (settings?.patientTrackerConfig) setPtConfig(settings.patientTrackerConfig);
      if (settings?.hideBadgeNumber !== undefined) setHideBadgeNumber(!!settings.hideBadgeNumber);
      if (Array.isArray(settings?.oralPanel) && settings.oralPanel.length) setOralPanel(settings.oralPanel);
      if (Array.isArray(settings?.urinePanel) && settings.urinePanel.length) setUrinePanel(settings.urinePanel);
      return;
    }
    try {
      const settings = await api.getAdminSettings();
      _adminSettingsCache = settings;
      _adminSettingsCacheTime = Date.now();
      if (settings?.employerCategories) {
        setEmployerCategories(settings.employerCategories);
      }
      if (settings?.patientTrackerConfig) {
        setPtConfig(settings.patientTrackerConfig);
      }
      if (settings?.hideBadgeNumber !== undefined) {
        setHideBadgeNumber(!!settings.hideBadgeNumber);
      }
      if (Array.isArray(settings?.oralPanel) && settings.oralPanel.length) {
        setOralPanel(settings.oralPanel);
      }
      if (Array.isArray(settings?.urinePanel) && settings.urinePanel.length) {
        setUrinePanel(settings.urinePanel);
      }
    } catch (err) {
      console.log('Using default employer categories');
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setCurrentUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setCurrentUser(null);
  }, []);

  const getConfig = (key) => {
    const item = lookups.config.find(c => c.ConfigKey === key);
    return item?.ConfigValue;
  };

  const getEmployeeLabel = () => employerCategories[0] || 'Employee';
  const getContractorLabel = () => employerCategories[1] || 'Contractor';

  const value = {
    lookups,
    loadLookups,
    loadAdminSettings,
    getConfig,
    employerCategories,
    getEmployeeLabel,
    getContractorLabel,
    currentUser,
    ptConfig,
    setPtConfigDirect: setPtConfig,
    hideBadgeNumber,
    oralPanel,
    urinePanel,
    login,
    logout
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
