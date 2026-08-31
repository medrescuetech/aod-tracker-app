const API_BASE = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('aod_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('aod_token', token);
    } else {
      localStorage.removeItem('aod_token');
    }
  }

  getToken() {
    return this.token || localStorage.getItem('aod_token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.getToken()) {
      headers['Authorization'] = `Bearer ${this.getToken()}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (response.status === 401) {
      throw new Error(data.error || 'Unauthorised');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Lookups
  async getLookups() {
    return this.request('/lookups');
  }

  async createEmployer(data) {
    return this.request('/employers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmployer(id, data) {
    return this.request(`/employers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Persons
  async getPersons(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/persons${query ? `?${query}` : ''}`);
  }

  async createPerson(data) {
    return this.request('/persons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPerson(id) {
    return this.request(`/persons/${id}`);
  }

  async getPersonMedications(id) {
    return this.request(`/persons/${id}/medications`);
  }

  async updatePerson(id, data) {
    return this.request(`/persons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePerson(id) {
    return this.request(`/persons/${id}`, { method: 'DELETE' });
  }

  async importPersons(rows) {
    return this.request('/persons/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  }

  async importPersonsSimple(rows) {
    return this.request('/persons/import/simple', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  }

  async importEmployersCsv(rows) { return this.request('/employers/import/csv', { method: 'POST', body: JSON.stringify({ rows }) }); }
  async importCliniciansCsv(rows) { return this.request('/clinicians/import/csv', { method: 'POST', body: JSON.stringify({ rows }) }); }
  async importTrainingUnitsCsv(rows) { return this.request('/training-units/import/csv', { method: 'POST', body: JSON.stringify({ rows }) }); }
  async patientSearch(q) { return this.request(`/patient-search?q=${encodeURIComponent(q)}`); }

  async checkPersonDuplicate({ fullName, dob, employerId, excludeId } = {}) {
    const params = new URLSearchParams();
    if (fullName)   params.set('fullName', fullName);
    if (dob)        params.set('dob', dob);
    if (employerId) params.set('employerId', employerId);
    if (excludeId)  params.set('excludeId', excludeId);
    return this.request(`/persons/check-duplicate?${params.toString()}`);
  }

  async getMergePreview(aId, bId) {
    return this.request(`/persons/${aId}/merge-preview?withPersonId=${bId}`);
  }

  async mergePersons(keepId, dropPersonId) {
    return this.request(`/persons/${keepId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ sourcePersonId: dropPersonId }),
    });
  }

  // Clinicians
  async getClinicians(includeInactive = false) {
    return this.request(`/clinicians${includeInactive ? '?includeInactive=true' : ''}`);
  }

  async getClinician(id) {
    return this.request(`/clinicians/${id}`);
  }

  async createClinician(data) {
    return this.request('/clinicians', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClinician(id, data) {
    return this.request(`/clinicians/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteClinician(id) {
    return this.request(`/clinicians/${id}`, {
      method: 'DELETE',
    });
  }

  // Tests
  async getTests(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/tests${query ? `?${query}` : ''}`);
  }

  async getTest(id) {
    return this.request(`/tests/${id}`);
  }

  async createTest(data) {
    return this.request('/tests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTest(id, data) {
    return this.request(`/tests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Pending Results
  async getPendingResults() {
    return this.request('/pending');
  }

  // Non-Negative Records
  async getNonNegativeRecords(status, search, personId) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (personId) params.set('personId', personId);
    const qs = params.toString();
    return this.request(`/nonnegative${qs ? '?' + qs : ''}`);
  }

  async getNonNegativeRecord(id) {
    return this.request(`/nonnegative/${id}`);
  }

  async updateNonNegativeRecord(id, data) {
    return this.request(`/nonnegative/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateNonNegativeLabResult(id, data) {
    return this.request(`/nonnegative/${id}/lab`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getNonNegativeHistory(id) {
    return this.request(`/nonnegative/${id}/history`);
  }

  async addNonNegativeNote(id, noteText) {
    return this.request(`/nonnegative/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ noteText }),
    });
  }

  async getNonNegativeNotes(id) {
    return this.request(`/nonnegative/${id}/notes`);
  }

  async closeNonNegativeCase(testId) {
    return this.request(`/nonnegative/${testId}/close`, { method: 'POST' });
  }

  async updateNonNegativeStatus(testId, data) {
    return this.request(`/nonnegative/${testId}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAdminSettings() {
    return this.request('/admin/app-settings');
  }

  async updateAdminSettings(data) {
    return this.request('/admin/app-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSystemConfig() {
    return this.request('/admin/settings');
  }

  async updateSystemConfig(key, value) {
    return this.request(`/admin/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async getBackupConfig() {
    return this.request('/admin/backup-config');
  }

  async saveBackupConfig(config) {
    return this.request('/admin/backup-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async savePtConfig(ptConfig) {
    return this.request('/admin/app-settings', {
      method: 'PUT',
      body: JSON.stringify({ patientTrackerConfig: ptConfig }),
    });
  }

  // Scheduling
  async createRandomSelection(data) {
    return this.request('/schedule/random', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getScheduledTests(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/schedule${query ? `?${query}` : ''}`);
  }

  async createScheduledTest(data) {
    return this.request('/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduledTest(id, data) {
    return this.request(`/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteScheduledTest(id) {
    return this.request(`/schedule/${id}`, {
      method: 'DELETE',
    });
  }

  // Random Lists (PDF Import)
  async importRandomListPDF(file, listDate, shift, employerId = null, testTypeId = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('listDate', listDate);
    formData.append('shift', shift);
    if (employerId) formData.append('employerId', employerId);
    if (testTypeId) formData.append('testTypeId', testTypeId);

    const url = `${API_BASE}/random-lists/import`;
    const headers = {};
    if (this.getToken()) {
      headers['Authorization'] = `Bearer ${this.getToken()}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Import failed');
    }
    return data;
  }

  async getRandomLists(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/random-lists${query ? `?${query}` : ''}`);
  }

  async getRandomListEntriesForDate(date) {
    return this.request(`/random-lists/for-date/${date}`);
  }

  async getRandomListEntries(listId) {
    return this.request(`/random-lists/${listId}/entries`);
  }

  async updateRandomListEntry(entryId, data) {
    return this.request(`/random-lists/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async editRandomListEntry(entryId, data) {
    return this.request(`/random-lists/entries/${entryId}/edit`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRandomListEntry(entryId) {
    return this.request(`/random-lists/entries/${entryId}`, {
      method: 'DELETE',
    });
  }

  // Reports
  async getDNAReport(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/dna?${params}`);
  }

  async getPendingReport(employerIds = []) {
    const params = new URLSearchParams();
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/pending?${params}`);
  }

  async getVariationReport(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/variation?${params}`);
  }

  async getCustomQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') params.append(k, v); });
    return this.request(`/reports/custom-query?${params}`);
  }

  async downloadCustomQueryExcel(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') params.append(k, v); });
    return this.downloadFile(`/reports/custom-query.xlsx?${params}`);
  }

  async getAnalyticsReport(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/analytics?${params}`);
  }

  async downloadAnalyticsExcel(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.downloadFile(`/reports/analytics.xlsx?${params}`);
  }

  async getWeeklyReport(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/weekly?${params}`);
  }

  async getQuarterlyReport(year, quarter, employerIds = []) {
    const params = new URLSearchParams({ year, quarter });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.request(`/reports/quarterly?${params}`);
  }

  async downloadWeeklyReportExcel(startDate, endDate, employerIds = []) {
    const params = new URLSearchParams({ startDate, endDate });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.downloadFile(`/reports/weekly.xlsx?${params}`);
  }

  async downloadQuarterlyReportExcel(year, quarter, employerIds = []) {
    const params = new URLSearchParams({ year, quarter });
    if (employerIds.length > 0) params.append('employers', employerIds.join(','));
    return this.downloadFile(`/reports/quarterly.xlsx?${params}`);
  }

  async downloadQuarterlyTemplateExcel(year, quarter, category) {
    const params = new URLSearchParams({ year, quarter, category });
    return this.downloadFile(`/reports/quarterly.template.xlsx?${params}`);
  }

  async getEmployers(category = null) {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/employers${params}`);
  }

  async createEmployer(data) {
    return this.request('/employers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmployer(id, data) {
    return this.request(`/employers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Employer merge and aliases
  async mergeEmployers(targetEmployerId, sourceEmployerIds, addAlias = true) {
    return this.request('/employers/merge', {
      method: 'POST',
      body: JSON.stringify({ targetEmployerId, sourceEmployerIds, addAlias }),
    });
  }

  async getMergedEmployers() {
    return this.request('/employers/merged');
  }

  async unmergeEmployer(employerId) {
    return this.request(`/employers/${employerId}/unmerge`, {
      method: 'POST',
    });
  }

  async getEmployerAliases(employerId) {
    return this.request(`/employers/${employerId}/aliases`);
  }

  async addEmployerAlias(employerId, aliasName) {
    return this.request(`/employers/${employerId}/aliases`, {
      method: 'POST',
      body: JSON.stringify({ aliasName }),
    });
  }

  async removeEmployerAlias(employerId, aliasId) {
    return this.request(`/employers/${employerId}/aliases/${aliasId}`, {
      method: 'DELETE',
    });
  }

  async getDashboard() {
    return this.request('/reports/dashboard');
  }

  // Auth config
  async getAuthConfig() { return this.request('/auth/config'); }

  // Users
  async getUsers(params = {}) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
    const qs = Object.keys(clean).length ? '?' + new URLSearchParams(clean) : '';
    return this.request('/users' + qs);
  }

  async getUser(id) {
    return this.request(`/users/${id}`);
  }

  async getUserRoles() {
    return this.request('/users/roles');
  }

  async createUser(data) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // User self-management
  async getMyProfile() {
    return this.request('/users/me');
  }

  async updateMyProfile(data) {
    return this.request('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Record lab result for pending test (by PendingID)
  async recordLabResult(pendingId, data) {
    return this.request(`/pending/${pendingId}/lab-result`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Record lab result directly by TestID (from TestDetail page)
  async recordTestLabResult(testId, data) {
    return this.request(`/tests/${testId}/lab-result`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Training Units
  async getTrainingUnits() { return this.request('/training-units'); }
  async createTrainingUnit(data) { return this.request('/training-units', { method: 'POST', body: JSON.stringify(data) }); }
  async updateTrainingUnit(id, data) { return this.request(`/training-units/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteTrainingUnit(id) { return this.request(`/training-units/${id}`, { method: 'DELETE' }); }

  // Trainers
  async getTrainers() { return this.request('/trainers'); }
  async createTrainer(data) { return this.request('/trainers', { method: 'POST', body: JSON.stringify(data) }); }
  async updateTrainer(id, data) { return this.request(`/trainers/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteTrainer(id) { return this.request(`/trainers/${id}`, { method: 'DELETE' }); }

  // CPD Types
  async getCPDTypes() { return this.request('/cpd-types'); }
  async createCPDType(data) { return this.request('/cpd-types', { method: 'POST', body: JSON.stringify(data) }); }
  async updateCPDType(id, data) { return this.request(`/cpd-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteCPDType(id) { return this.request(`/cpd-types/${id}`, { method: 'DELETE' }); }
  async cleanupDuplicateCPDTypes() { return this.request('/cpd-types/cleanup-duplicates', { method: 'POST' }); }

  // Audit Log
  async getAuditLog(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/audit${query ? `?${query}` : ''}`);
  }

  // Patient Events
  async getPatientEvents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/patient-events${query ? `?${query}` : ''}`);
  }

  async createPatientEvent(data) {
    return this.request('/patient-events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePatientEvent(id, data) {
    return this.request(`/patient-events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePatientEvent(id) {
    return this.request(`/patient-events/${id}`, { method: 'DELETE' });
  }

  // Test Types
  async getTestTypes() { return this.request('/test-types'); }
  async createTestType(data) { return this.request('/test-types', { method: 'POST', body: JSON.stringify(data) }); }
  async updateTestType(id, data) { return this.request(`/test-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteTestType(id) { return this.request(`/test-types/${id}`, { method: 'DELETE' }); }

  // Referral Options
  async getReferralOptions() { return this.request('/referral-options'); }
  async createReferralOption(data) { return this.request('/referral-options', { method: 'POST', body: JSON.stringify(data) }); }
  async updateReferralOption(id, data) { return this.request(`/referral-options/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteReferralOption(id) { return this.request(`/referral-options/${id}`, { method: 'DELETE' }); }

  // Compliance Checks
  async getChecks() { return this.request('/checks'); }
  async createCheck(data) { return this.request('/checks', { method: 'POST', body: JSON.stringify(data) }); }
  async updateCheck(id, data) { return this.request(`/checks/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteCheck(id) { return this.request(`/checks/${id}`, { method: 'DELETE' }); }
  async getCheckCompletions(id) { return this.request(`/checks/${id}/completions`); }
  async addCheckCompletion(id, data) { return this.request(`/checks/${id}/completions`, { method: 'POST', body: JSON.stringify(data) }); }
  async deleteCheckCompletion(checkId, completionId) { return this.request(`/checks/${checkId}/completions/${completionId}`, { method: 'DELETE' }); }

  // ── Person search + lookup helpers ──────────────────────────────────────────
  async searchPersons(q) { return this.request(`/persons?search=${encodeURIComponent(q)}&activeOnly=true`); }
  async getTestTypes()   { const d = await this.request('/lookups'); return d.testTypes || []; }
  async getWorkerTypes() { const d = await this.request('/lookups'); return d.workerTypes || []; }

  // ── DNA / Attendance ────────────────────────────────────────────────────────
  async getAttendanceRecords(params = {}) { return this.request('/attendance?' + new URLSearchParams(params)); }
  async createAttendanceRecord(data) { return this.request('/attendance', { method: 'POST', body: JSON.stringify(data) }); }
  async updateAttendanceRecord(id, data) { return this.request(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteAttendanceRecord(id) { return this.request(`/attendance/${id}`, { method: 'DELETE' }); }

  // ── Manual scheduled test ────────────────────────────────────────────────────
  async createScheduledTest(data) { return this.request('/schedule', { method: 'POST', body: JSON.stringify(data) }); }
  async deleteScheduledTest(id) { return this.request(`/schedule/${id}`, { method: 'DELETE' }); }
  async getScheduleMatch(params) { return this.request('/schedule/match?' + new URLSearchParams(params)); }

  // ── Person linked history ──────────────────────────────────────────────────
  async getPersonHistory(id) { return this.request(`/persons/${id}/history`); }

  // ── App config (public, no auth) ──────────────────────────────────────────
  async getAppConfig() { return this.request('/app-config'); }

  // ── Training duplicate cleanup ─────────────────────────────────────────────
  async getTrainingDuplicates() { return this.request('/training/duplicates'); }
  async cleanupTrainingDuplicates() { return this.request('/training/cleanup-duplicates', { method: 'POST' }); }

  // ── Person CSV ────────────────────────────────────────────────────────────────
  downloadPersonsCsv() { window.open(`${API_BASE}/persons/export/csv`, '_blank'); }
  async importPersonsCsv(file) {
    const form = new FormData(); form.append('file', file);
    const response = await fetch(`${API_BASE}/persons/import/csv`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.getToken()}` }, body: form,
    });
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'Import failed'); }
    return response.json();
  }

  // ── Random list generation ────────────────────────────────────────────────────
  async generateRandomList(data) { return this.request('/random-lists/generate', { method: 'POST', body: JSON.stringify(data) }); }
  async generateRandomListFromCsv(file, meta) {
    const form = new FormData();
    form.append('file', file);
    Object.entries(meta).forEach(([k, v]) => form.append(k, v));
    const response = await fetch(`${API_BASE}/random-lists/from-csv`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.getToken()}` }, body: form,
    });
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'Failed'); }
    return response.json();
  }
  openRandomListExcelExport(listId) { window.open(`${API_BASE}/random-lists/${listId}/export/excel`, '_blank'); }
  openRandomListPdfExport(listId)   { window.open(`${API_BASE}/random-lists/${listId}/export/pdf`,   '_blank'); }
  async addRandomListToPending(listId) { return this.request(`/random-lists/${listId}/add-to-pending`, { method: 'POST' }); }

  async getWeeklyEventReport(startDate, endDate) {
    return this.request(`/reports/weekly-events?startDate=${startDate}&endDate=${endDate}`);
  }

  // File download helper
  async downloadFile(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData?.error || errorData?.message || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition') || '';
    const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
    const filename = match?.[1] || 'report.xlsx';

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async downloadFileAsBlob(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData?.error || errorData?.message || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return await response.blob();
  }

  // ============================================
  // FILE ATTACHMENTS
  // ============================================

  // Upload files to a test record
  // category: 'Initial Test Record', 'Lab Results', 'Chain of Custody', 'Other'
  async uploadTestAttachments(testId, files, category, description = '') {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('category', category);
    if (description) formData.append('description', description);

    const response = await fetch(`${API_BASE}/tests/${testId}/attachments`, {
      method: 'POST',
      body: formData, // Don't set Content-Type - browser will set it with boundary
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return response.json();
  }

  // List attachments for a test
  async getTestAttachments(testId, category = null) {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/tests/${testId}/attachments${params}`);
  }

  // Get attachment summary (count by category)
  async getTestAttachmentSummary(testId) {
    return this.request(`/tests/${testId}/attachments/summary`);
  }

  // Get download URL for an attachment
  getAttachmentDownloadUrl(attachmentId) {
    return `${API_BASE}/attachments/${attachmentId}/download`;
  }

  // Delete an attachment
  async deleteAttachment(attachmentId) {
    return this.request(`/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // COMPREHENSIVE REPORTS
  // ============================================

  // Generate any report by ID
  async generateReport(reportId, params) {
    return this.request(`/reports/generate/${reportId}`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Export report to Excel — triggers a browser download
  async exportReportExcel(reportId, params) {
    const response = await fetch(`${API_BASE}/reports/export/excel/${reportId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.getToken()}` },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await response.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${reportId}-${params.startDate || 'export'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }

  // Open a print-ready HTML page for PDF — returns the URL to open
  getPdfUrl(reportId, params) {
    const q = new URLSearchParams({
      startDate:   params.startDate || '',
      endDate:     params.endDate   || '',
      employerIds: (params.employerIds || []).join(','),
    });
    return `${API_BASE}/reports/export/pdf/${reportId}`;
  }

  // Open PDF in a new tab — window.open MUST be called before any await to avoid popup blocker
  async openReportPdf(reportId, params) {
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-ups are blocked. Please allow pop-ups for this site and try again.'); return; }
    win.document.write('<html><body style="font-family:Arial;padding:20px"><p>Generating report…</p></body></html>');
    try {
      const response = await fetch(`${API_BASE}/reports/export/pdf/${reportId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.getToken()}` },
        body: JSON.stringify(params),
      });
      if (!response.ok) { win.close(); throw new Error('PDF generation failed'); }
      const html = await response.text();
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      win.close();
      throw err;
    }
  }

  // Custom report builder
  async runCustomReport(config) {
    return this.request('/reports/custom', { method: 'POST', body: JSON.stringify(config) });
  }

  // Drill-down into raw records behind an aggregate
  async drilldown(params) {
    return this.request('/reports/drilldown', { method: 'POST', body: JSON.stringify(params) });
  }

  // Report templates (saved configurations)
  async getReportTemplates() { return this.request('/report-templates'); }
  async saveReportTemplate(data) { return this.request('/report-templates', { method: 'POST', body: JSON.stringify(data) }); }
  async updateReportTemplate(id, data) { return this.request(`/report-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteReportTemplate(id) { return this.request(`/report-templates/${id}`, { method: 'DELETE' }); }

  // ── Reviews Calendar (Review Appointments) ─────────────────────────────────
  async getReviewAppointments(params = {}) {
    return this.request('/review-appointments?' + new URLSearchParams(params));
  }
  async getReviewAppointment(id) {
    return this.request(`/review-appointments/${id}`);
  }
  async createReviewAppointment(data) {
    return this.request('/review-appointments', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateReviewAppointment(id, data) {
    return this.request(`/review-appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteReviewAppointment(id) {
    return this.request(`/review-appointments/${id}`, { method: 'DELETE' });
  }
  async getUpcomingReviewAppointments(days = 7, date = null) {
    const params = new URLSearchParams({ days: String(days) });
    if (date) params.append('date', date);
    return this.request('/review-appointments/upcoming?' + params);
  }

  // ── SMTP settings ──────────────────────────────────────────────────────────
  async getSmtpSettings() { return this.request('/admin/smtp'); }
  async saveSmtpSettings(cfg) { return this.request('/admin/smtp', { method: 'PUT', body: JSON.stringify(cfg) }); }
  async testSmtp(cfg) { return this.request('/admin/smtp/test', { method: 'POST', body: JSON.stringify(cfg) }); }

  // ── Document library ────────────────────────────────────────────────────────
  async getDocuments(category) {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/documents${q}`);
  }
  async getDocumentCategories() { return this.request('/documents/categories'); }
  async uploadDocument(formData) {
    const res = await fetch(`${API_BASE}/documents`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  }
  async updateDocument(id, data) { return this.request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteDocument(id) { return this.request(`/documents/${id}`, { method: 'DELETE' }); }
  documentFileUrl(id)     { return `${API_BASE}/documents/${id}/file`; }
  documentDownloadUrl(id) { return `${API_BASE}/documents/${id}/download`; }

  // ── Email notification rules ────────────────────────────────────────────────
  async getEmailRules() { return this.request('/admin/email-rules'); }
  async saveEmailRules(rules) { return this.request('/admin/email-rules', { method: 'PUT', body: JSON.stringify(rules) }); }
  async sendTestEmail(testId, to, subject) { return this.request(`/tests/${testId}/send-email`, { method: 'POST', body: JSON.stringify({ to, subject }) }); }

  // ── Compliance Checks ────────────────────────────────────────────────────────
  async getChecks() { return this.request('/checks'); }
  async createCheck(data) { return this.request('/checks', { method: 'POST', body: JSON.stringify(data) }); }
  async updateCheck(id, data) { return this.request(`/checks/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteCheck(id) { return this.request(`/checks/${id}`, { method: 'DELETE' }); }
  async getCheckCompletions(id) { return this.request(`/checks/${id}/completions`); }
  async addCheckCompletion(id, data) { return this.request(`/checks/${id}/completions`, { method: 'POST', body: JSON.stringify(data) }); }
  async deleteCheckCompletion(id, cid) { return this.request(`/checks/${id}/completions/${cid}`, { method: 'DELETE' }); }
}

export const api = new ApiService();
export default api;
