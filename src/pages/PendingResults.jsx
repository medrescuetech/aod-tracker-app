import React, { useState, useEffect } from 'react';
import { Clock, Loader2, FlaskConical, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { format } from 'date-fns';
import LabResultModal from '../components/LabResultModal';

const PendingResults = () => {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState(null);

  useEffect(() => { loadPending(); }, []);

  const loadPending = async () => {
    try {
      const data = await api.getPendingResults();
      setPending(data);
    } catch (err) {
      console.error('Failed to load pending results:', err);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pending Lab Results</h1>
        <p className="text-gray-500">{pending.length} tests awaiting laboratory confirmation</p>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
          <p className="text-gray-600 font-medium">All caught up!</p>
          <p className="text-gray-500 text-sm">No pending lab results at the moment</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="divide-y divide-gray-100">
            {pending.map(p => (
              <div key={p.PendingID} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{p.TestNumber}</p>
                      <p className="text-sm text-gray-500">{p.PersonName} • {p.EmployerName}</p>
                      <p className="text-xs text-gray-400">
                        Test Date: {format(new Date(p.TestDate), 'dd/MM/yyyy')}
                        {p.LabReference && ` • Lab Ref: ${p.LabReference}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
                      {p.OralResult === 'Non-Negative' ? 'Oral Fluid' : 'Urine'}
                    </span>
                    <button
                      onClick={() => setSelectedTest(p)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                    >
                      Enter Lab Result
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTest && (
        <LabResultModal
          testId={selectedTest.TestID || selectedTest.PendingID}
          onClose={() => setSelectedTest(null)}
          onSave={() => { loadPending(); setSelectedTest(null); }}
        />
      )}
    </div>
  );
};

export default PendingResults;
