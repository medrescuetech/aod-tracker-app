import React, { useState } from 'react';
import { UserCog, UserPlus, Edit2, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';

const Testers = () => {
  const { testers, saveTesters, addTester, currentTester } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingTester, setEditingTester] = useState(null);

  const handleDelete = (tester) => {
    if (tester.id === currentTester?.id) {
      alert('Cannot delete the currently logged in tester');
      return;
    }
    if (confirm(`Delete tester "${tester.name}"?`)) {
      const updated = testers.filter(t => t.id !== tester.id);
      saveTesters(updated);
    }
  };

  const handleEdit = (tester) => {
    setEditingTester(tester);
    setShowModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Testers</h1>
          <p className="text-gray-500">Manage your testing team</p>
        </div>
        <button
          onClick={() => {
            setEditingTester(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Tester
        </button>
      </div>

      {/* Testers Grid */}
      {testers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <UserCog className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500 mb-4">No testers configured yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Your First Tester
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testers.map(tester => (
            <div
              key={tester.id}
              className={`bg-white rounded-xl shadow-sm border p-4 ${
                currentTester?.id === tester.id 
                  ? 'border-blue-500 ring-2 ring-blue-100' 
                  : 'border-gray-100'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {tester.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{tester.name}</p>
                    {tester.employeeId && (
                      <p className="text-sm text-gray-500">ID: {tester.employeeId}</p>
                    )}
                  </div>
                </div>
                {currentTester?.id === tester.id && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                    Active
                  </span>
                )}
              </div>
              
              {tester.certificationNumber && (
                <p className="text-sm text-gray-600 mb-2">
                  Cert: {tester.certificationNumber}
                </p>
              )}
              
              <p className="text-xs text-gray-400 mb-3">
                Added {format(new Date(tester.createdAt), 'MMM d, yyyy')}
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(tester)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-3 h-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(tester)}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <TesterModal
          tester={editingTester}
          onClose={() => {
            setShowModal(false);
            setEditingTester(null);
          }}
        />
      )}
    </div>
  );
};

const TesterModal = ({ tester, onClose }) => {
  const { addTester, testers, saveTesters } = useApp();
  const [name, setName] = useState(tester?.name || '');
  const [employeeId, setEmployeeId] = useState(tester?.employeeId || '');
  const [certificationNumber, setCertificationNumber] = useState(tester?.certificationNumber || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (tester) {
      const updated = testers.map(t => 
        t.id === tester.id 
          ? { ...t, name: name.trim(), employeeId: employeeId.trim(), certificationNumber: certificationNumber.trim() }
          : t
      );
      saveTesters(updated);
    } else {
      addTester({
        name: name.trim(),
        employeeId: employeeId.trim(),
        certificationNumber: certificationNumber.trim()
      });
    }
    
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {tester ? 'Edit Tester' : 'Add Tester'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Employee ID
            </label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Certification Number
            </label>
            <input
              type="text"
              value={certificationNumber}
              onChange={(e) => setCertificationNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., BAT-12345"
            />
          </div>
          
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
              {tester ? 'Save Changes' : 'Add Tester'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Testers;
