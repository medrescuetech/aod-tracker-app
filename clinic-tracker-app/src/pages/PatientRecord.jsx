import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, User, FlaskConical, Stethoscope, AlertTriangle, Edit2,
  Calendar, Building2, BadgeCheck, Loader2, ClipboardList, Activity,
  ChevronRight, Download, GitMerge, X, Search, CheckCircle
} from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format, parseISO } from 'date-fns';
import PatientFormModal from '../components/PatientFormModal';
import PatientMergeModal from '../components/PatientMergeModal';

const fmtDate = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' && d.length === 10 ? parseISO(d) : new Date(d), 'dd/MM/yyyy'); }
  catch { return d; }
};

const ResultBadge = ({ value }) => {
  if (!value) return <span className="text-gray-400 text-xs">—</span>;
  const map = {
    'Negative': 'bg-green-100 text-green-700',
    'Non-Negative': 'bg-amber-100 text-amber-700',
    'Confirmed - Consistent': 'bg-red-100 text-red-700',
    'Confirmed - Inconsistent': 'bg-red-100 text-red-700',
    'Non-Negative - Pending Lab': 'bg-orange-100 text-orange-700',
    'Review Required': 'bg-purple-100 text-purple-700',
    'Refused': 'bg-gray-100 text-gray-700',
    'Positive': 'bg-red-100 text-red-700',
    'N/A': 'bg-gray-100 text-gray-500',
  };
  const cls = map[value] || 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{value}</span>;
};

const TABS = ['Overview', 'AOD Tests', 'Clinic Visits', 'Non-Negatives'];

const PatientRecord = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lookups, hideBadgeNumber } = useApp();
  const [person, setPerson] = useState(null);
  const [employers, setEmployers] = useState([]);
  const [tests, setTests] = useState([]);
  const [events, setEvents] = useState([]);
  const [nonNeg, setNonNeg] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const handleExport = () => {
    const esc = (v) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = [
      `PATIENT RECORD — ${person.FullName}`,
      `Exported: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      '',
      '== PATIENT DETAILS ==',
      `Full Name,${esc(person.FullName)}`,
      `Date of Birth,${esc(person.DateOfBirth)}`,
      `Sex,${esc(person.SexName)}`,
      `Employer,${esc(person.EmployerName)}`,
      `Department,${esc(person.Department)}`,
      `Position,${esc(person.Position)}`,
      `Badge Number,${esc(person.BadgeNumber)}`,
      `Employee Number,${esc(person.EmployeeNumber)}`,
      '',
      '== AOD TESTS ==',
      'Test Number,Date,Type,Drug Result,BAC Result,Clinician,Status',
      ...tests.map(t => [t.TestNumber, t.TestDate, t.TestTypeName, t.FinalDrugOutcome, t.AlcoholResult || t.FinalBACOutcome, t.ClinicianName, t.TestStatus].map(esc).join(',')),
      '',
      '== CLINIC VISITS ==',
      'Date,Type,WR/NWR,Injury Type,Body Location,Clinician,Notes',
      ...events.map(e => [e.EventDate, e.EventType, e.WrNwr, e.InjuryType, e.BodyLocation, e.ClinicianName, e.Notes].map(esc).join(',')),
      '',
      '== NON-NEGATIVE RECORDS ==',
      'Test Number,Date,Confirmatory Result,Detected Substances,Status',
      ...nonNeg.map(n => [n.TestNumber, n.TestDate, n.ConfirmatoryResult, n.DetectedSubstances, n.Status].map(esc).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient_${person.FullName.replace(/\s+/g,'_')}_${format(new Date(),'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [personData, testsData, eventsData, nnData, employersData] = await Promise.all([
        api.getPerson(id),
        api.getTests({ personId: id }),
        api.getPatientEvents({ personId: id }),
        api.getNonNegativeRecords(null, null, id),
        api.getEmployers(),
      ]);
      setPerson(personData);
      setTests(testsData);
      setEvents(eventsData);
      setNonNeg(nnData);
      setEmployers(employersData);
    } catch (err) {
      console.error('Failed to load patient record:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="text-center py-16 text-gray-500">
        <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">Patient not found</p>
        <button onClick={() => navigate('/workers')} className="mt-4 text-blue-600 hover:underline text-sm">
          Back to Patients
        </button>
      </div>
    );
  }

  const tabCounts = {
    'AOD Tests': tests.length,
    'Clinic Visits': events.length,
    'Non-Negatives': nonNeg.length,
  };

  return (
    <div>
      {/* Back nav */}
      <button
        onClick={() => navigate('/workers')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Patients
      </button>

      {/* Patient header */}
      <div className="bg-white rounded-xl shadow-sm border p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xl">
              {person.FullName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{person.FullName}</h1>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                {person.DateOfBirth && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> DOB: {fmtDate(person.DateOfBirth)}
                  </span>
                )}
                {person.EmployerName && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {person.EmployerName}
                  </span>
                )}
                {!hideBadgeNumber && (person.BadgeNumber || person.EmployeeNumber) && (
                  <span className="flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" /> {person.BadgeNumber || person.EmployeeNumber}
                  </span>
                )}
                {person.WorkerTypeName && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{person.WorkerTypeName}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              title="Export patient record as CSV"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={() => setShowMergeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              title="Merge with another patient"
            >
              <GitMerge className="w-3.5 h-3.5" /> Merge
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-gray-100">
          <StatCard icon={FlaskConical} label="AOD Tests" value={person.TestCount || 0} color="blue" />
          <StatCard icon={AlertTriangle} label="Non-Negatives" value={person.NonNegativeCount || 0} color="amber" />
          <StatCard icon={Stethoscope} label="Clinic Visits" value={person.ClinicVisitCount || 0} color="purple" />
          <StatCard icon={Calendar} label="Last Test" value={fmtDate(person.LastTestDate)} small color="blue" />
          <StatCard icon={Activity} label="Last Clinic" value={fmtDate(person.LastClinicDate)} small color="purple" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tabCounts[tab] !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && <OverviewTab person={person} tests={tests} events={events} nonNeg={nonNeg} navigate={navigate} />}
      {activeTab === 'AOD Tests' && <AODTestsTab tests={tests} navigate={navigate} />}
      {activeTab === 'Clinic Visits' && <ClinicVisitsTab events={events} />}
      {activeTab === 'Non-Negatives' && <NonNegTab nonNeg={nonNeg} navigate={navigate} />}

      {showEditModal && (
        <PatientFormModal
          patient={person}
          employers={employers}
          lookups={lookups}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); loadAll(); }}
        />
      )}
      {showMergeModal && (
        <PatientMergeModal
          targetPatient={person}
          onClose={() => setShowMergeModal(false)}
          onMerged={() => { setShowMergeModal(false); loadAll(); }}
        />
      )}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color, small }) => {
  const colors = { blue: 'text-blue-500 bg-blue-50', amber: 'text-amber-500 bg-amber-50', purple: 'text-purple-500 bg-purple-50' };
  return (
    <div className="flex items-center gap-2.5">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <Icon className={`w-4 h-4 ${colors[color].split(' ')[0]}`} />
      </div>
      <div>
        <p className={`font-bold ${small ? 'text-sm' : 'text-lg'} text-gray-900`}>{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
};

const OverviewTab = ({ person, tests, events, nonNeg, navigate }) => {
  const recentTests = tests.slice(0, 3);
  const recentEvents = events.slice(0, 3);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Patient Details */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" /> Patient Details
        </h3>
        <dl className="space-y-2.5 text-sm">
          {[
            ['Full Name', person.FullName],
            ['Date of Birth', fmtDate(person.DateOfBirth)],
            ['Sex', person.SexName],
            ['Employer', person.EmployerName],
            ['Department', person.Department],
            ['Position', person.Position],
            ...(!hideBadgeNumber ? [['Badge Number', person.BadgeNumber], ['Employee Number', person.EmployeeNumber]] : []),
            ['Email', person.Email],
            ['Phone', person.Phone],
          ].map(([label, val]) => val ? (
            <div key={label} className="flex gap-2">
              <dt className="w-36 text-gray-500 shrink-0">{label}</dt>
              <dd className="font-medium text-gray-900">{val}</dd>
            </div>
          ) : null)}
        </dl>
      </div>

      {/* Recent AOD Tests */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-400" /> Recent AOD Tests
          </h3>
          {tests.length > 3 && (
            <button onClick={() => {}} className="text-xs text-blue-600 hover:underline">See all {tests.length}</button>
          )}
        </div>
        {recentTests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No tests recorded</p>
        ) : (
          <div className="space-y-2">
            {recentTests.map(t => (
              <div key={t.TestID} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.TestNumber || `Test #${t.TestID}`}</p>
                  <p className="text-xs text-gray-500">{fmtDate(t.TestDate)} · {t.TestTypeName || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ResultBadge value={t.FinalDrugOutcome} />
                  <Link to={`/tests/${t.TestID}`} className="p-1 text-gray-400 hover:text-blue-600">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Clinic Visits */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-purple-400" /> Recent Clinic Visits
          </h3>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No clinic visits recorded</p>
        ) : (
          <div className="space-y-2">
            {recentEvents.map(e => (
              <div key={e.EventID} className="p-2.5 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{e.EventType || e.WrNwr || '—'}</p>
                  <p className="text-xs text-gray-500">{fmtDate(e.EventDate)}</p>
                </div>
                {e.Description && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.Description}</p>}
                {e.ClinicianName && <p className="text-xs text-gray-400 mt-0.5">Clinician: {e.ClinicianName}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Non-Negatives */}
      {nonNeg.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Non-Negative Cases
          </h3>
          <div className="space-y-2">
            {nonNeg.map(nn => (
              <div key={nn.NNID} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{nn.TestNumber}</p>
                  <p className="text-xs text-gray-500">{fmtDate(nn.TestDate)} · {nn.DetectedSubstances || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    nn.Status === 'Closed' ? 'bg-gray-100 text-gray-600' :
                    nn.Status === 'Open' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>{nn.Status}</span>
                  <Link to="/non-negative" className="p-1 text-gray-400 hover:text-amber-600">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AODTestsTab = ({ tests, navigate }) => (
  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
    {tests.length === 0 ? (
      <div className="p-12 text-center text-gray-400">
        <FlaskConical className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>No AOD tests recorded for this patient</p>
        <p className="text-sm mt-1">Tests appear here once linked via the Donor name on Record Test</p>
      </div>
    ) : (
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Test #</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Oral</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Drug Result</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">BAC Result</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Clinician</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-600"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tests.map(t => (
            <tr key={t.TestID} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-blue-600">{t.TestNumber || `#${t.TestID}`}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(t.TestDate)}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{t.TestTypeName || '—'}</td>
              <td className="px-4 py-3"><ResultBadge value={t.OralResult} /></td>
              <td className="px-4 py-3"><ResultBadge value={t.FinalDrugOutcome} /></td>
              <td className="px-4 py-3"><ResultBadge value={t.FinalBACOutcome} /></td>
              <td className="px-4 py-3 text-sm text-gray-500">{t.ClinicianName || '—'}</td>
              <td className="px-4 py-3 text-right">
                <Link to={`/tests/${t.TestID}`} className="p-1 text-gray-400 hover:text-blue-600">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const ClinicVisitsTab = ({ events }) => (
  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
    {events.length === 0 ? (
      <div className="p-12 text-center text-gray-400">
        <Stethoscope className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>No clinic visits recorded for this patient</p>
        <p className="text-sm mt-1">Visits appear here once the patient is linked in Patient Tracker</p>
      </div>
    ) : (
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">WR/NWR</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Description</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Outcome</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Clinician</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map(e => (
            <tr key={e.EventID} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(e.EventDate)}{e.EventTime ? ` ${e.EventTime.slice(0,5)}` : ''}</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.EventType || '—'}</td>
              <td className="px-4 py-3 text-sm">
                {e.WrNwr && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    e.WrNwr?.startsWith('WR') ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                  }`}>{e.WrNwr}</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{e.Description || '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{e.Outcome || '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{e.ClinicianName || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const NonNegTab = ({ nonNeg, navigate }) => (
  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
    {nonNeg.length === 0 ? (
      <div className="p-12 text-center text-gray-400">
        <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>No non-negative cases for this patient</p>
      </div>
    ) : (
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Test #</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Substances</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Confirmatory</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-600"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {nonNeg.map(nn => (
            <tr key={nn.NNID} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-blue-600">{nn.TestNumber}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(nn.TestDate)}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{nn.DetectedSubstances || '—'}</td>
              <td className="px-4 py-3"><ResultBadge value={nn.ConfirmatoryResult} /></td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  nn.Status === 'Closed' ? 'bg-gray-100 text-gray-600' :
                  nn.Status === 'Open' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}>{nn.Status}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link to="/non-negative" className="p-1 text-gray-400 hover:text-amber-600">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);



export default PatientRecord;
