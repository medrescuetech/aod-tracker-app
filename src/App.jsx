import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';

import Dashboard from './pages/Dashboard';
import NonNegative from './pages/NonNegative';
import NewTest from './pages/NewTest';
import TestHistory from './pages/TestHistory';
import Workers from './pages/Workers';
import Employers from './pages/Employers';
import Scheduling from './pages/Scheduling';
import Reports from './pages/Reports';
import ReportsHub from './pages/ReportsHub';
import Settings from './pages/Settings';
import PatientTracker from './pages/PatientTracker';
import TestDetail from './pages/TestDetail';
import Admin from './pages/Admin';
import TrainingTracker from './pages/TrainingTracker';
import ChecksTracker from './pages/ChecksTracker';
import TestingManagement from './pages/TestingManagement';
import ESOReport from './pages/ESOReport';
import PatientRecord from './pages/PatientRecord';
import PatientSearch from './pages/PatientSearch';
import Documents from './pages/Documents';
import SDSManager from './pages/SDSManager';
import QuarterlyReport from './pages/QuarterlyReport';

// Apply saved font size preference on load
const applyFontSizePreference = () => {
  const pref = localStorage.getItem('fontSizePreference') || 'large';
  if (pref === 'large') {
    document.documentElement.classList.add('font-large');
  } else {
    document.documentElement.classList.remove('font-large');
  }
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients" element={<PatientTracker />} />
            <Route path="/new-test" element={<NewTest />} />
            <Route path="/tests" element={<TestHistory />} />
            <Route path="/tests/:id" element={<TestDetail />} />
            <Route path="/non-negative" element={<NonNegative />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/employers" element={<Employers />} />
            <Route path="/reports" element={<ReportsHub />} />
            <Route path="/reports/legacy" element={<Reports />} />
            <Route path="/training" element={<TrainingTracker />} />
            <Route path="/checks" element={<ChecksTracker />} />
            <Route path="/testing" element={<TestingManagement />} />
            <Route path="/training/eso-report" element={<ESOReport />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/sds" element={<SDSManager />} />
            <Route path="/quarterly" element={<QuarterlyReport />} />
            <Route path="/patient/:id" element={<PatientRecord />} />
            <Route path="/patient-search" element={<PatientSearch />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
};

function App() {
  useEffect(() => {
    applyFontSizePreference();
  }, []);

  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export default App;
