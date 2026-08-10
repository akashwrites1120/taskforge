import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, List, XCircle, ExternalLink } from 'lucide-react';

import { QueueOverview } from './components/QueueOverview';
import { JobList } from './components/JobList';
import { JobDetail } from './components/JobDetail';
import { DeadLetterTable } from './components/DeadLetterTable';

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 2000 },
  },
});

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Jobs', icon: List, end: false },
  { to: '/dead-letter', label: 'Dead Letter', icon: XCircle, end: false },
];

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
              TF
            </div>
            <span className="font-semibold text-slate-100 text-sm tracking-tight">
              TaskForge
            </span>
            <span className="text-slate-600 text-sm">/ Operator Dashboard</span>
          </div>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-slate-800 text-slate-100 font-medium'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          <a
            href="https://github.com/akashwrites1120/taskforge"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="sm:hidden flex border-b border-slate-800 bg-slate-950">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-all ${
                isActive ? 'text-indigo-400' : 'text-slate-600'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <h1 className="text-xl font-bold text-slate-100 mb-6">Queue Overview</h1>
                <QueueOverview />
              </Layout>
            }
          />
          <Route
            path="/jobs"
            element={
              <Layout>
                <h1 className="text-xl font-bold text-slate-100 mb-6">Jobs</h1>
                <JobList />
              </Layout>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <Layout>
                <h1 className="text-xl font-bold text-slate-100 mb-6">Job Detail</h1>
                <JobDetail />
              </Layout>
            }
          />
          <Route
            path="/dead-letter"
            element={
              <Layout>
                <h1 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
                  <XCircle size={20} className="text-red-400" />
                  Dead-Letter Queue
                </h1>
                <DeadLetterTable />
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
