import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Search, CheckCircle, XCircle, AlertTriangle, FileUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';
import { RESULT_TYPES, SUBSTANCE_TYPES } from '../utils/storage';

const PendingTests = () => {
  const { tests, updateTest, donors } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTest, setSelectedTest] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const pendingTests = tests
    .filter(t => t.status === 'pending')
    .filter(t => {
      if (!searchTerm) return true;
      const donor = donors.find(d => d.id === t.donorId);
      const searchLower = searchTerm.toLowerCase();
      return (
        t.testNumber.toLowerCase().includes(searchLower) ||
        (donor?.name || '').toLowerCase().includes(searchLower) ||
        (donor?.employeeId || '').toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const handleRecordResult = (test) => {
    setSelectedTest(test);
    setShowResultModal(true);
  };

  const handleMarkNoShow = (test) => {
    if (confirm('Mark this test as No Show?')) {
      updateTest(test.id, { 
        status: 'no-show',
        completedAt: new Date().toISOString()
      });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pending Tests</h1>
        <p className="text-gray-500">{pendingTests.length} tests awaiting completion</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by test number, name, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tests List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {pendingTests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm">No pending tests at the moment</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingTests.map(test => {
              const donor = donors.find(d => d.id === test.donorId);
              return (
                <div key={test.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Clock className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {test.testNumber}
                        </p>
                        <p className="text-sm text-gray-500">
                          {donor?.name || 'Unknown Donor'} 
                          {donor?.employeeId && ` • ID: ${donor.employeeId}`}
                        </p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                            {test.testType.replace('-', ' ')}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">
                            {SUBSTANCE_TYPES.find(s => s.value === test.substanceType)?.label || test.substanceType}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRecordResult(test)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Record Result
                      </button>
                      <button
                        onClick={() => handleMarkNoShow(test)}
                        className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        No Show
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Result Modal */}
      {showResultModal && selectedTest && (
        <ResultModal
          test={selectedTest}
          onClose={() => {
            setShowResultModal(false);
            setSelectedTest(null);
          }}
        />
      )}
    </div>
  );
};

const ResultModal = ({ test, onClose }) => {
  const { updateTest, donors } = useApp();
  const [result, setResult] = useState('negative');
  const [alcoholReading, setAlcoholReading] = useState('');
  const [notes, setNotes] = useState('');
  const [sendToLab, setSendToLab] = useState(false);
  const [labReference, setLabReference] = useState('');

  const donor = donors.find(d => d.id === test.donorId);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const updates = {
      result,
      alcoholReading: alcoholReading || null,
      notes,
      completedAt: new Date().toISOString(),
      status: sendToLab ? 'sent-to-lab' : 'completed'
    };

    if (sendToLab) {
      updates.labReference = labReference;
      updates.sentToLabAt = new Date().toISOString();
    }

    updateTest(test.id, updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Record Test Result</h2>
          <p className="text-sm text-gray-500">
            {test.testNumber} • {donor?.name || 'Unknown'}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Result */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Result</label>
            <div className="grid grid-cols-3 gap-2">
              {RESULT_TYPES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    setResult(r.value);
                    if (r.value === 'non-negative') {
                      setSendToLab(true);
                    }
                  }}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    result === r.value
                      ? r.value === 'negative' 
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : r.value === 'non-negative'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alcohol Reading */}
          {(test.substanceType === 'alcohol' || test.substanceType === 'both') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alcohol Reading (BAC)
              </label>
              <input
                type="text"
                value={alcoholReading}
                onChange={(e) => setAlcoholReading(e.target.value)}
                placeholder="e.g., 0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Send to Lab */}
          {result === 'non-negative' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800">Non-Negative Result</p>
                  <p className="text-sm text-amber-700 mb-3">
                    This sample should be sent to a laboratory for confirmation testing.
                  </p>
                  <label className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={sendToLab}
                      onChange={(e) => setSendToLab(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-amber-800">Send to laboratory</span>
                  </label>
                  {sendToLab && (
                    <input
                      type="text"
                      value={labReference}
                      onChange={(e) => setLabReference(e.target.value)}
                      placeholder="Lab reference number (optional)"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Any additional notes about this test..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Result
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PendingTests;
