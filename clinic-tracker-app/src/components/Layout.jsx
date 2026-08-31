import React, { useState, useEffect } from 'react';
import { Tooltip } from './Tooltip';
import { HELP } from '../utils/helpText';
import { NavLink, useLocation } from 'react-router-dom';
import UserProfile from './UserProfile';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  BarChart3, 
  Settings,
  FlaskConical,
  AlertTriangle,
  Calendar,
  History,
  Stethoscope,
  Shield,
  GraduationCap,
  ClipboardCheck,
  TestTube2,
  Menu,
  X,
  Search,
  FolderOpen,
  Beaker,
  ClipboardList,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

const navGroups = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', tip: HELP.nav.dashboard },
    ]
  },
  {
    id: 'patient',
    label: 'Patient',
    items: [
      { to: '/patients', icon: Stethoscope, label: 'Patient Tracker', tip: HELP.nav.patients },
      { to: '/patient-search', icon: Search, label: 'Search', tip: 'Search patients across AOD & clinical records' },
      { to: '/workers', icon: Users, label: 'Patients', tip: HELP.nav.workers },
    ]
  },
  {
    id: 'aod',
    label: 'AOD',
    items: [
      { to: '/new-test', icon: FlaskConical, label: 'Record Test', tip: HELP.nav.newTest },
      { to: '/tests', icon: History, label: 'AOD History', tip: HELP.nav.tests },
      { to: '/non-negative', icon: AlertTriangle, label: 'Non-Negative', tip: HELP.nav.nonNegative },
      { to: '/scheduling', icon: Calendar, label: 'Scheduling', tip: HELP.nav.scheduling },
    ]
  },
  {
    id: 'site',
    label: 'Site',
    items: [
      { to: '/employers', icon: Building2, label: 'Employers', tip: HELP.nav.employers },
      { to: '/training', icon: GraduationCap, label: 'Training', tip: HELP.nav.training },
      { to: '/checks', icon: ClipboardCheck, label: 'Checks', tip: HELP.nav.checks },
      { to: '/testing', icon: TestTube2, label: 'Testing Mgmt', tip: HELP.nav.testing },
      { to: '/documents', icon: FolderOpen, label: 'Documents', tip: 'Site documents, policies and reference materials' },
      { to: '/sds', icon: Beaker, label: 'SDS Manager', tip: 'Chemical register and Safety Data Sheets' },
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { to: '/quarterly', icon: ClipboardList, label: 'Quarterly Report', tip: 'Generate the quarterly AOD contractor report' },
      { to: '/reports', icon: BarChart3, label: 'Reports', tip: HELP.nav.reports },
    ]
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings', tip: HELP.nav.settings },
      { to: '/admin', icon: Shield, label: 'Admin', tip: HELP.nav.admin },
    ]
  },
];

function getActiveGroupId(pathname) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) {
        return group.id;
      }
    }
  }
  return null;
}

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const [openGroups, setOpenGroups] = useState(() => {
    const id = getActiveGroupId(location.pathname);
    return new Set(id ? [id] : []);
  });

  useEffect(() => {
    const id = getActiveGroupId(location.pathname);
    if (id) {
      setOpenGroups(prev => new Set([...prev, id]));
    }
  }, [location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleGroup = (id) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-800 text-white z-40 flex items-center justify-between px-4 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-lg font-bold">Clinic Tracker</h1>
        </div>
      </div>

      {/* Sidebar Overlay (mobile only) */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-800 text-white flex flex-col transform transition-transform duration-200 ease-in-out lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-slate-700 flex items-center justify-between lg:block">
          <div>
            <h1 className="text-xl font-bold">Clinic Tracker</h1>
            <p className="text-slate-400 text-sm hidden lg:block">Site Health Management</p>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-slate-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {navGroups.map((group) => (
              <li key={group.id} className="mb-1">
                {group.items.length === 1 ? (() => {
                  const { to, icon: Icon, label, tip } = group.items[0];
                  return (
                    <Tooltip text={tip} position="right" width="max-w-sm">
                      <NavLink
                        to={to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700'
                          }`
                        }
                      >
                        <Icon size={20} />
                        <span className="text-sm">{label}</span>
                      </NavLink>
                    </Tooltip>
                  );
                })() : (
                  <>
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <span className="text-sm font-medium">{group.label}</span>
                      {openGroups.has(group.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {openGroups.has(group.id) && (
                      <ul className="mt-1 ml-4 space-y-1">
                        {group.items.map(({ to, icon: Icon, label, tip }) => (
                          <li key={to}>
                            <Tooltip text={tip} position="right" width="max-w-sm">
                              <NavLink
                                to={to}
                                onClick={() => setSidebarOpen(false)}
                                className={({ isActive }) =>
                                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    isActive
                                      ? 'bg-blue-600 text-white'
                                      : 'text-slate-300 hover:bg-slate-700'
                                  }`
                                }
                              >
                                <Icon size={18} />
                                <span className="text-sm">{label}</span>
                              </NavLink>
                            </Tooltip>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-16">
        {/* Top Header with User Profile */}
        <div className="hidden lg:flex items-center justify-end px-6 py-3 bg-white border-b border-gray-200">
          <UserProfile />
        </div>
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
