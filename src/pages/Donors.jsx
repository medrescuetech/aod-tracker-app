import React, { useState } from 'react';
import { Users, UserPlus, Search, Edit2, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';

const Donors = () => {
  const { donors, saveDonors, addDonor } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDonor, setEditingDonor] = useState(null);

  const filteredDonors = donors.filter(d => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      d.name.toLowerCase().includes(search) ||
      (d.employeeId || '').toLowerCase().includes(search) ||
      (d.department || '').toLowerCase().includes(search)
    );
  });

  const handleDelete = (donor) => {
    if (confirm(`Delete donor "${donor.name}"? This cannot be undone.`)) {
      const updated = donors.filter(d => d.id !== donor.id);
      saveDonors(updated);
    }
  };

  const handleEdit = (donor) => {
    setEditingDonor(donor);
    setShowModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Donors</h1>
          <p className="text-gray-500">{donors.length} registered donors</p>
        </div>
        <button
          onClick={() => {
            setEditingDonor(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Donor
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, employee ID, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Donors Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredDonors.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>{donors.length === 0 ? 'No donors registered yet' : 'No donors match your search'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Employee ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Department</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Added</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDonors.map(donor => (
                <tr key={donor.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{donor.name}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{donor.employeeId || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{donor.department || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    {format(new Date(donor.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(donor)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(donor)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors ml-2"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <DonorModal
          donor={editingDonor}
          onClose={() => {
            setShowModal(false);
            setEditingDonor(null);
          }}
        />
      )}
    </div>
  );
};

const DonorModal = ({ donor, onClose }) => {
  const { addDonor, donors, saveDonors } = useApp();
  const [name, setName] = useState(donor?.name || '');
  const [employeeId, setEmployeeId] = useState(donor?.employeeId || '');
  const [department, setDepartment] = useState(donor?.department || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (donor) {
      // Editing
      const updated = donors.map(d => 
        d.id === donor.id 
          ? { ...d, name: name.trim(), employeeId: employeeId.trim(), department: department.trim() }
          : d
      );
      saveDonors(updated);
    } else {
      // Adding
      addDonor({
        name: name.trim(),
        employeeId: employeeId.trim(),
        department: department.trim()
      });
    }
    
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {donor ? 'Edit Donor' : 'Add Donor'}
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
              Department
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              {donor ? 'Save Changes' : 'Add Donor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Donors;
