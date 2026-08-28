import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Clock, 
  AlertTriangle,
  FlaskConical,
  TrendingUp,
  Calendar,
  Loader2,
  Stethoscope,
  Eye,
  EyeOff,
  ChevronRight,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  CalendarDays
} from 'lucide-react';
import api from '../services/api';
import { format, addDays, subDays, parseISO, isToday, isTomorrow, isSameDay } from 'date-fns';

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [patientEvents, setPatientEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNames, setShowNames] = useState(false);
  
  // Reviews Calendar state
  const [reviewDate, setReviewDate] = useState(addDays(new Date(), 1)); // Default to tomorrow
  const [reviewAppointments, setReviewAppointments] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  
  // AOD Tracker state
  const [aodDate, setAodDate] = useState(new Date()); // Default to today
  const [scheduledTests, setScheduledTests] = useState([]);
  const [completedTests, setCompletedTests] = useState([]);
  const [loadingAOD, setLoadingAOD] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);
  
  useEffect(() => {
    loadReviewsForDate(reviewDate);
  }, [reviewDate]);
  
  useEffect(() => {
    loadAODData(aodDate);
  }, [aodDate]);

  const loadDashboard = async () => {
    try {
      const [dashboard, events] = await Promise.all([
        api.getDashboard(),
        api.getPatientEvents({ date: format(new Date(), 'yyyy-MM-dd') })
      ]);
      setData(dashboard);
      setPatientEvents(events);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const loadReviewsForDate = async (date) => {
    setLoadingReviews(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const appointments = await api.getReviewAppointments({ 
        dateFrom: dateStr, 
        dateTo: dateStr,
        status: 'Scheduled'
      });
      setReviewAppointments(appointments);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoadingReviews(false);
    }
  };
  
  const loadAODData = async (date) => {
    setLoadingAOD(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Get scheduled tests for this date
      const scheduled = await api.getScheduledTests({ date: dateStr });
      setScheduledTests(scheduled.filter(t => t.Status === 'Pending' || t.Status === 'Scheduled'));
      
      // Get completed tests for this date (from recent tests or filter by date)
      const testsResponse = await api.getTests({ dateFrom: dateStr, dateTo: dateStr });
      const completed = Array.isArray(testsResponse) ? testsResponse : (testsResponse.tests || []);
      setCompletedTests(completed);
    } catch (err) {
      console.error('Failed to load AOD data:', err);
    } finally {
      setLoadingAOD(false);
    }
  };
  
  const goToPrevDay = () => setReviewDate(prev => subDays(prev, 1));
  const goToNextDay = () => setReviewDate(prev => addDays(prev, 1));
  const goToTomorrow = () => setReviewDate(addDays(new Date(), 1));
  
  const goToAodPrevDay = () => setAodDate(prev => subDays(prev, 1));
  const goToAodNextDay = () => setAodDate(prev => addDays(prev, 1));
  const goToAodToday = () => setAodDate(new Date());
  
  const getDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMMM d');
  };

  const maskName = (name) => {
    if (showNames || !name) return name;
    return '***';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const today = new Date();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">{format(today, 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Module Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <button
          onClick={() => navigate('/patients')}
          className="flex items-center justify-between p-6 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div className="text-left">
              <p className="text-xl font-bold">Patient Tracker</p>
              <p className="text-purple-200 text-sm">Clinical events & patient visits</p>
              <p className="text-white font-semibold mt-1">{patientEvents.length} events today</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => navigate('/tests')}
          className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <FlaskConical className="w-8 h-8" />
            </div>
            <div className="text-left">
              <p className="text-xl font-bold">AOD Tracker</p>
              <p className="text-blue-200 text-sm">Drug & alcohol testing</p>
              <p className="text-white font-semibold mt-1">{data?.today || 0} tests today</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link to="/new-test" className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-700">New AOD Test</span>
        </Link>
        <Link to="/patients" className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-colors">
          <Stethoscope className="w-5 h-5 text-purple-600" />
          <span className="font-medium text-gray-700">New Patient Consult</span>
        </Link>
        <Link to="/workers" className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-green-300 hover:bg-green-50 transition-colors">
          <Users className="w-5 h-5 text-green-600" />
          <span className="font-medium text-gray-700">Patients</span>
        </Link>
        <Link to="/employers" className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors">
          <Building2 className="w-5 h-5 text-amber-600" />
          <span className="font-medium text-gray-700">Employers</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Link to="/tests" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{data?.weekTotal || 0}</p>
          <p className="text-sm text-gray-500">Tests This Week</p>
        </Link>
        <Link to="/pending" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{data?.pendingResults || 0}</p>
          <p className="text-sm text-gray-500">Pending Results</p>
        </Link>
        <Link to="/non-negative" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{data?.openNonNegatives || 0}</p>
          <p className="text-sm text-gray-500">Open Non-Negatives</p>
        </Link>
        <Link to="/scheduling" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{data?.scheduledToday || 0}</p>
          <p className="text-sm text-gray-500">Scheduled Today</p>
        </Link>
      </div>

      {/* Reviews Calendar Widget */}
      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-teal-600" />
            <h2 className="font-semibold text-gray-900">Reviews Calendar</h2>
          </div>
          <Link to="/patients" className="text-sm text-blue-600 hover:underline">Manage in Patient Tracker</Link>
        </div>
        
        <div className="p-4">
          {/* Day Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={goToPrevDay}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="text-center min-w-[200px]">
                <p className="font-semibold text-gray-900">{getDateLabel(reviewDate)}</p>
                <p className="text-xs text-gray-500">{format(reviewDate, 'MMMM d, yyyy')}</p>
              </div>
              <button 
                onClick={goToNextDay}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <button 
              onClick={goToTomorrow}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Tomorrow
            </button>
          </div>
          
          {/* Appointments List */}
          {loadingReviews ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : reviewAppointments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No reviews scheduled for {isToday(reviewDate) ? 'today' : isTomorrow(reviewDate) ? 'tomorrow' : 'this day'}</p>
              <Link to="/patients" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
                Schedule a review
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {reviewAppointments
                .sort((a, b) => (a.TimeSlot || '').localeCompare(b.TimeSlot || ''))
                .map(appt => (
                <div 
                  key={appt.AppointmentID}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-shrink-0 w-16 text-center">
                    {appt.TimeSlot ? (
                      <span className="font-medium text-gray-900">{appt.TimeSlot}</span>
                    ) : (
                      <span className="text-xs text-gray-500">No time set</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{appt.FullName}</p>
                    <p className="text-sm text-gray-500">{appt.EmployerName || 'No employer'}</p>
                    {appt.Comment && appt.ShowCommentOnDashboard !== 0 && (
                      <p className="text-sm text-amber-700 mt-1 italic">"{appt.Comment}"</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                      {appt.Status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AOD Tracker Widget */}
      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">AOD Tracker</h2>
          </div>
          <Link to="/scheduling" className="text-sm text-blue-600 hover:underline">Manage in Scheduling</Link>
        </div>
        
        <div className="p-4">
          {/* Day Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={goToAodPrevDay}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="text-center min-w-[200px]">
                <p className="font-semibold text-gray-900">{getDateLabel(aodDate)}</p>
                <p className="text-xs text-gray-500">{format(aodDate, 'MMMM d, yyyy')}</p>
              </div>
              <button 
                onClick={goToAodNextDay}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <button 
              onClick={goToAodToday}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Today
            </button>
          </div>
          
          {/* Two Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scheduled Tests */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Scheduled ({scheduledTests.length})
              </h3>
              {loadingAOD ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : scheduledTests.length === 0 ? (
                <div className="text-center py-4 text-gray-400 bg-gray-50 rounded-lg">
                  <p className="text-sm">No tests scheduled</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scheduledTests.map(test => (
                    <div key={test.ScheduledTestID || test.TestID} className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <p className="font-medium text-gray-900 text-sm">{test.FullName || test.PersonName}</p>
                      <p className="text-xs text-gray-500">{test.EmployerName || 'No employer'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">{test.Status}</span>
                        {test.TimeSlot && <span className="text-xs text-gray-400">{test.TimeSlot}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Completed Tests */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-green-500" />
                Completed ({completedTests.length})
              </h3>
              {loadingAOD ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : completedTests.length === 0 ? (
                <div className="text-center py-4 text-gray-400 bg-gray-50 rounded-lg">
                  <p className="text-sm">No tests completed</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {completedTests.map(test => (
                    <div key={test.TestID} className="p-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{maskName(test.FullName)}</p>
                          <p className="text-xs text-gray-500">{test.TestTypeName}</p>
                        </div>
                        <div className="text-right">
                          {test.FinalDrugOutcome && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              test.FinalDrugOutcome === 'Negative' ? 'bg-green-100 text-green-700' : 
                              test.FinalDrugOutcome === 'Pending' ? 'bg-amber-100 text-amber-700' : 
                              'bg-red-100 text-red-700'
                            }`}>{test.FinalDrugOutcome}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{test.TestNumber}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tests Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Recent AOD Tests</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNames(!showNames)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            >
              {showNames ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showNames ? 'Hide Names' : 'Show Names'}
            </button>
            <Link to="/tests" className="text-sm text-blue-600 hover:underline">View All</Link>
          </div>
        </div>
        
        {!data?.recentTests?.length ? (
          <div className="p-8 text-center text-gray-500">
            <FlaskConical className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No tests recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Test #</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Patient</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Drug Result</th>
                  <th className="px-4 py-3 font-medium text-gray-600">BAC Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recentTests.map(test => (
                  <tr key={test.TestID} onClick={() => navigate(`/tests/${test.TestID}`)}
                    className="hover:bg-blue-50 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-blue-600 hover:underline">{test.TestNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{test.TestDate ? format(new Date(test.TestDate), 'dd/MM/yyyy') : '-'}</td>
                    <td className="px-4 py-3 text-gray-900">{maskName(test.FullName)}</td>
                    <td className="px-4 py-3 text-gray-600">{test.TestTypeName}</td>
                    <td className="px-4 py-3">
                      {test.FinalDrugOutcome ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          test.FinalDrugOutcome === 'Negative' ? 'bg-green-100 text-green-700' :
                          test.FinalDrugOutcome === 'Pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{test.FinalDrugOutcome}</span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {test.FinalBACOutcome ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          test.FinalBACOutcome === 'Negative' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>{test.FinalBACOutcome}</span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
