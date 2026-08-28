import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, Plus, Edit2, Trash2, FileText, Image, Download, 
  AlertTriangle, CheckCircle, X, Filter, BarChart3, 
  Calendar, MapPin, Beaker, AlertOctagon, ChevronLeft, ChevronRight,
  Upload, Eye, FileWarning
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

const API_BASE = '/api';
const ADMIN_TOKEN = () => sessionStorage.getItem('adminToken');

const SDSManager = () => {
  // Data states
  const [chemicals, setChemicals] = useState([]);
  const [locations, setLocations] = useState([]);
  const [dgClasses, setDGClasses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDGClass, setFilterDGClass] = useState('');
  const [showOverdue, setShowOverdue] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'report'

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingChemical, setEditingChemical] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState(null); // 'sds' | 'photo'
  const [uploadChemicalId, setUploadChemicalId] = useState(null);

  // Form state
  const [formData, setFormData] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterLocation) params.append('location', filterLocation);
      if (filterStatus) params.append('status', filterStatus);
      if (filterDGClass) params.append('dgClass', filterDGClass);
      if (search) params.append('search', search);
      if (showOverdue) params.append('overdue', 'true');

      const [chemRes, locRes, dgRes, sumRes] = await Promise.all([
        fetch(`${API_BASE}/chemicals?${params}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/chemicals/filters/locations`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/chemicals/filters/dgclasses`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/chemicals/reports/summary`).then(r => r.ok ? r.json() : null)
      ]);

      setChemicals(Array.isArray(chemRes) ? chemRes : []);
      setLocations(Array.isArray(locRes) ? locRes : []);
      setDGClasses(Array.isArray(dgRes) ? dgRes : []);
      setSummary(sumRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterLocation, filterStatus, filterDGClass, search, showOverdue]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenModal = (chemical = null) => {
    if (chemical) {
      setEditingChemical(chemical);
      setFormData({ ...chemical });
    } else {
      setEditingChemical(null);
      setFormData({
        Code: '',
        ProductName: '',
        Location: '',
        Quantity: 0,
        ContainerSize: '',
        TotalQuantity: '',
        UnitSize: '',
        ContainerType: '',
        Manufacturer: '',
        DGClass: '',
        UNNumber: '',
        GHSClassification: '',
        SignalWord: '',
        StorageRequirements: '',
        Status: 'Active',
        Notes: '',
        SDSIssueDate: '',
        SDSReviewDue: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingChemical(null);
    setFormData({});
  };

  const handleSave = async () => {
    try {
      const url = editingChemical 
        ? `${API_BASE}/chemicals/${editingChemical.ChemicalID}`
        : `${API_BASE}/chemicals`;
      const method = editingChemical ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Token': ADMIN_TOKEN() || ''
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error(await res.text());
      
      handleCloseModal();
      fetchData();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this chemical?')) return;
    try {
      const res = await fetch(`${API_BASE}/chemicals/${id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': ADMIN_TOKEN() || '' }
      });
      if (!res.ok) throw new Error('Delete failed');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenUpload = (id, type) => {
    setUploadChemicalId(id);
    setUploadType(type);
    setShowUploadModal(true);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = e.target.elements.file.files[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/chemicals/${uploadChemicalId}/${uploadType}`, {
        method: 'POST',
        headers: { 'X-Admin-Token': ADMIN_TOKEN() || '' },
        body: form
      });
      if (!res.ok) throw new Error('Upload failed');
      setShowUploadModal(false);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const isOverdue = (date) => date && isPast(parseISO(date));

  // Report View
  if (viewMode === 'report') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Beaker className="w-6 h-6" />
            SDS Reports
          </h1>
          <button onClick={() => setViewMode('list')} className="btn-secondary flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to List
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-blue-600">{summary.total}</div>
              <div className="text-gray-600">Total Chemicals</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-green-600">
                {summary.byStatus?.find(s => s.Status === 'Active')?.count || 0}
              </div>
              <div className="text-gray-600">Active</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-red-600">{summary.overdue}</div>
              <div className="text-gray-600">Overdue Reviews</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-3xl font-bold text-orange-600">{locations.length}</div>
              <div className="text-gray-600">Storage Locations</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> By Location
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr><th className="text-left p-2">Location</th><th className="text-right p-2">Count</th></tr>
              </thead>
              <tbody>
                {summary?.byLocation?.map(row => (
                  <tr key={row.Location} className="border-b">
                    <td className="p-2">{row.Location || 'Unspecified'}</td>
                    <td className="p-2 text-right">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4" /> By DG Class
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr><th className="text-left p-2">DG Class</th><th className="text-right p-2">Count</th></tr>
              </thead>
              <tbody>
                {summary?.byDGClass?.map(row => (
                  <tr key={row.DGClass} className="border-b">
                    <td className="p-2">{row.DGClass || 'Unspecified'}</td>
                    <td className="p-2 text-right">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Beaker className="w-6 h-6" />
          SDS Chemical Register
          {summary?.overdue > 0 && (
            <span className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded-full">
              {summary.overdue} overdue
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('report')} className="btn-secondary flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Reports
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Chemical
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code, name, manufacturer, UN number..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select 
              value={filterLocation} 
              onChange={(e) => setFilterLocation(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="">All</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DG Class</label>
            <select 
              value={filterDGClass} 
              onChange={(e) => setFilterDGClass(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="">All</option>
              {dgClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Discontinued">Discontinued</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showOverdue}
              onChange={(e) => setShowOverdue(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Overdue only</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : chemicals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No chemicals found. Add your first chemical to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Location</th>
                <th className="text-left p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">DG Class</th>
                <th className="text-left p-3 font-medium">Signal</th>
                <th className="text-left p-3 font-medium">SDS Review</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Files</th>
                <th className="text-center p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chemicals.map(chem => (
                <tr key={chem.ChemicalID} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{chem.Code}</td>
                  <td className="p-3">
                    <div className="font-medium">{chem.ProductName}</div>
                    {chem.Manufacturer && (
                      <div className="text-gray-500 text-xs">{chem.Manufacturer}</div>
                    )}
                  </td>
                  <td className="p-3">{chem.Location}</td>
                  <td className="p-3">
                    {chem.Quantity} × {chem.ContainerSize}
                  </td>
                  <td className="p-3">
                    {chem.DGClass && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                        <AlertOctagon className="w-3 h-3" /> {chem.DGClass}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {chem.SignalWord === 'Danger' ? (
                      <span className="text-red-600 font-medium">{chem.SignalWord}</span>
                    ) : chem.SignalWord}
                  </td>
                  <td className="p-3">
                    {chem.SDSReviewDue && (
                      <span className={`text-xs ${isOverdue(chem.SDSReviewDue) ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                        {isOverdue(chem.SDSReviewDue) && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {format(parseISO(chem.SDSReviewDue), 'MMM d, yyyy')}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      chem.Status === 'Active' ? 'bg-green-100 text-green-700' :
                      chem.Status === 'Inactive' ? 'bg-gray-100 text-gray-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {chem.Status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {chem.SDSPath ? (
                        <a href={API_BASE + chem.SDSPath} target="_blank" rel="noreferrer" 
                           className="text-blue-600 hover:text-blue-800">
                          <FileText className="w-4 h-4" />
                        </a>
                      ) : (
                        <button onClick={() => handleOpenUpload(chem.ChemicalID, 'sds')}
                                className="text-gray-400 hover:text-blue-600">
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      {chem.PhotoPath ? (
                        <a href={API_BASE + chem.PhotoPath} target="_blank" rel="noreferrer"
                           className="text-blue-600 hover:text-blue-800">
                          <Image className="w-4 h-4" />
                        </a>
                      ) : (
                        <button onClick={() => handleOpenUpload(chem.ChemicalID, 'photo')}
                                className="text-gray-400 hover:text-blue-600">
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleOpenModal(chem)} className="p-1 hover:bg-gray-200 rounded">
                        <Edit2 className="w-4 h-4 text-gray-600" />
                      </button>
                      <button onClick={() => handleDelete(chem.ChemicalID)} className="p-1 hover:bg-gray-200 rounded">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingChemical ? 'Edit Chemical' : 'Add Chemical'}
              </h2>
              <button onClick={handleCloseModal}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Code *</label>
                  <input 
                    value={formData.Code || ''} 
                    onChange={e => setFormData({...formData, Code: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Product Name *</label>
                  <input 
                    value={formData.ProductName || ''} 
                    onChange={e => setFormData({...formData, ProductName: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <input 
                    value={formData.Location || ''} 
                    onChange={e => setFormData({...formData, Location: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    list="locations"
                  />
                  <datalist id="locations">
                    {locations.map(l => <option key={l} value={l} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity</label>
                  <input 
                    type="number"
                    value={formData.Quantity || ''} 
                    onChange={e => setFormData({...formData, Quantity: parseInt(e.target.value) || 0})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Container Size</label>
                  <input 
                    value={formData.ContainerSize || ''} 
                    onChange={e => setFormData({...formData, ContainerSize: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 500 mL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Total Quantity</label>
                  <input 
                    value={formData.TotalQuantity || ''} 
                    onChange={e => setFormData({...formData, TotalQuantity: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 15 L"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Manufacturer</label>
                  <input 
                    value={formData.Manufacturer || ''} 
                    onChange={e => setFormData({...formData, Manufacturer: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">DG Class</label>
                  <input 
                    value={formData.DGClass || ''} 
                    onChange={e => setFormData({...formData, DGClass: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    list="dgclasses"
                    placeholder="e.g., 3"
                  />
                  <datalist id="dgclasses">
                    {dgClasses.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UN Number</label>
                  <input 
                    value={formData.UNNumber || ''} 
                    onChange={e => setFormData({...formData, UNNumber: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., UN1170"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">GHS Classification</label>
                  <input 
                    value={formData.GHSClassification || ''} 
                    onChange={e => setFormData({...formData, GHSClassification: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Flammable Liquid Cat 2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Signal Word</label>
                  <select 
                    value={formData.SignalWord || ''} 
                    onChange={e => setFormData({...formData, SignalWord: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">-</option>
                    <option value="Danger">Danger</option>
                    <option value="Warning">Warning</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select 
                    value={formData.Status || 'Active'} 
                    onChange={e => setFormData({...formData, Status: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Discontinued">Discontinued</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SDS Issue Date</label>
                  <input 
                    type="date"
                    value={formData.SDSIssueDate || ''} 
                    onChange={e => setFormData({...formData, SDSIssueDate: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SDS Review Due</label>
                  <input 
                    type="date"
                    value={formData.SDSReviewDue || ''} 
                    onChange={e => setFormData({...formData, SDSReviewDue: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-1">Storage Requirements</label>
                  <input 
                    value={formData.StorageRequirements || ''} 
                    onChange={e => setFormData({...formData, StorageRequirements: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea 
                    value={formData.Notes || ''} 
                    onChange={e => setFormData({...formData, Notes: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <button onClick={handleCloseModal} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} className="btn-primary">
                {editingChemical ? 'Save Changes' : 'Create Chemical'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Upload {uploadType === 'sds' ? 'SDS PDF' : 'Photo'}
              </h3>
              <button onClick={() => setShowUploadModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpload}>
              <input 
                type="file" 
                name="file" 
                accept={uploadType === 'sds' ? '.pdf' : 'image/*'}
                className="w-full mb-4"
                required
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SDSManager;
