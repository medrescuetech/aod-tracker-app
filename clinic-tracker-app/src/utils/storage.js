const STORAGE_KEYS = {
  TESTS: 'aod_tests',
  DONORS: 'aod_donors',
  TESTERS: 'aod_testers',
  SETTINGS: 'aod_settings'
};

export const storage = {
  get: (key) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },
  
  getTests: () => storage.get(STORAGE_KEYS.TESTS) || [],
  setTests: (tests) => storage.set(STORAGE_KEYS.TESTS, tests),
  
  getDonors: () => storage.get(STORAGE_KEYS.DONORS) || [],
  setDonors: (donors) => storage.set(STORAGE_KEYS.DONORS, donors),
  
  getTesters: () => storage.get(STORAGE_KEYS.TESTERS) || [],
  setTesters: (testers) => storage.set(STORAGE_KEYS.TESTERS, testers),
  
  getSettings: () => storage.get(STORAGE_KEYS.SETTINGS) || {
    companyName: 'Company Name',
    labName: 'Testing Laboratory'
  },
  setSettings: (settings) => storage.set(STORAGE_KEYS.SETTINGS, settings)
};

export const TEST_TYPES = [
  { value: 'random', label: 'Random' },
  { value: 'for-cause', label: 'For Cause' },
  { value: 'post-incident', label: 'Post Incident' },
  { value: 'pre-employment', label: 'Pre-Employment' },
  { value: 'return-to-duty', label: 'Return to Duty' },
  { value: 'follow-up', label: 'Follow-Up' },
  { value: 'blanket', label: 'Blanket' }
];

export const TEST_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'yellow' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'sent-to-lab', label: 'Sent to Lab', color: 'blue' },
  { value: 'lab-confirmed', label: 'Lab Confirmed', color: 'purple' },
  { value: 'no-show', label: 'No Show', color: 'red' },
  { value: 'refused', label: 'Refused', color: 'red' }
];

export const RESULT_TYPES = [
  { value: 'negative', label: 'Negative' },
  { value: 'non-negative', label: 'Non-Negative' },
  { value: 'invalid', label: 'Invalid' }
];

export const SUBSTANCE_TYPES = [
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'drugs', label: 'Drugs (Urine)' },
  { value: 'oral-fluid', label: 'Drugs (Oral Fluid)' },
  { value: 'both', label: 'Alcohol & Drugs' }
];

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const generateTestNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `AOD-${year}${month}${day}-${random}`;
};
