import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Search, Loader2, Filter, Eye } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';

const TestHistory = () => {
  const navigate = useNavigate();
  const { lookups } = useApp();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: format(new Date(Date.now() - 30*24*60*60*1000), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd'),
    testTypeId: '',
    isPending: '',
    isNonNegative: '',
    search: ''
  });
  const [selectedTest, setSelectedTest] = useState(null);

  useEffect(() => { loadTests(); }, []);

  const loadTests = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) {
        params.search = filters.search;
      } else {
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
      }
      if (filters.testTypeId) params.testTypeId = filters.testTypeId;
      if (filters.isPending) params.isPending = filters.isPending;
      if (filters.isNonNegative) params.isNonNegative = filters.isNonNegative;
      
      const data = await api.getTests(params);
      setTests(data);
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewTest = async (testId) => {
    try {
      const test = await api.getTest(testId);
      setSelectedTest(test);
    } catch (err) {
      console.error('Failed to load test:', err);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Test History</h1>
        <p className="text-gray-500">View all AOD tests</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search (Test ID / Name / Badge)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters({...filters, search: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && loadTests()}
                placeholder="e.g. AOD-20260429-001"
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({...filters, dateFrom: e.target.value})} className="px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({...filters, dateTo: e.target.value})} className="px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Test Type</label>
            <select value={filters.testTypeId} onChange={(e) => setFilters({...filters, testTypeId: e.target.value})} className="px-3 py-2 border border-gray-200 rounded-lg">
              <option value="">All Types</option>
              {lookups.testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={filters.isPending} onChange={(e) => setFilters({...filters, isPending: e.target.value})} className="px-3 py-2 border border-gray-200 rounded-lg">
              <option value="">All</option>
              <option value="true">Pending Only</option>
            </select>
          </div>
          <button onClick={loadTests} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Filter className="w-4 h-4 inline mr-1" /> Filter
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
        ) : tests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No tests found for the selected criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Test #</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Worker</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">BAC Result</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Drug Result</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tests.map(test => (
                  <tr key={test.TestID} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/tests/${test.TestID}`)}>
                    <td className="px-4 py-3 font-medium text-blue-600">{test.TestNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{format(new Date(test.TestDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{test.PersonName}</p>
                      <p className="text-xs text-gray-500">{test.EmployerName}</p>
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">{test.TestTypeName}</span></td>
                    <td className="px-4 py-3">
                      {test.FinalBACOutcome ? (
                        <span className={`px-2 py-1 text-xs rounded ${test.FinalBACOutcome === 'Negative' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {test.FinalBACOutcome} {test.BACValue ? `(${test.BACValue})` : ''}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {test.FinalDrugOutcome ? (
                        <span className={`px-2 py-1 text-xs rounded ${
                          test.FinalDrugOutcome === 'Negative' ? 'bg-green-100 text-green-700' : 
                          test.FinalDrugOutcome.includes('Pending') ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {test.FinalDrugOutcome}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-blue-600 text-sm">
                        <Eye className="w-4 h-4 inline" /> View
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTest && <TestDetailModal test={selectedTest} onClose={() => setSelectedTest(null)} />}
    </div>
  );
};

const TestDetailModal = ({ test, onClose }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
        <h2 className="text-lg font-semibold">Test Details - {test.TestNumber}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm text-gray-500">Date</label><p className="font-medium">{format(new Date(test.TestDate), 'dd/MM/yyyy')}</p></div>
          <div><label className="text-sm text-gray-500">Time</label><p className="font-medium">{test.TestTime || '-'}</p></div>
          <div><label className="text-sm text-gray-500">Worker</label><p className="font-medium">{test.PersonName}</p></div>
          <div><label className="text-sm text-gray-500">Employer</label><p className="font-medium">{test.EmployerName}</p></div>
          <div><label className="text-sm text-gray-500">Test Type</label><p className="font-medium">{test.TestTypeName}</p></div>
          <div><label className="text-sm text-gray-500">Clinician</label><p className="font-medium">{test.ClinicianName || '-'}</p></div>
        </div>
        <hr />
        <h3 className="font-medium">Results</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm text-gray-500">BAC</label><p className="font-medium">{test.BACValue ?? '-'} ({test.FinalBACOutcome || '-'})</p></div>
          <div><label className="text-sm text-gray-500">Oral Fluid</label><p className="font-medium">{test.OralResult || '-'}</p></div>
          <div><label className="text-sm text-gray-500">Urine</label><p className="font-medium">{test.UrineResult || '-'}</p></div>
          <div><label className="text-sm text-gray-500">Drug Outcome</label><p className="font-medium">{test.FinalDrugOutcome || '-'}</p></div>
        </div>
        {test.SampleSentToLab === 1 && (
          <>
            <hr />
            <h3 className="font-medium">Lab Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm text-gray-500">Lab Reference</label><p className="font-medium">{test.LabReference || '-'}</p></div>
              <div><label className="text-sm text-gray-500">Lab Result</label><p className="font-medium">{test.LabResult || 'Pending'}</p></div>
              {test.DetectedSubstances && <div className="col-span-2"><label className="text-sm text-gray-500">Detected Substances</label><p className="font-medium">{test.DetectedSubstances}</p></div>}
            </div>
          </>
        )}
        {test.Notes && <><hr /><div><label className="text-sm text-gray-500">Notes</label><p className="text-gray-700">{test.Notes}</p></div></>}
      </div>
    </div>
  </div>
);

export default TestHistory;
