import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, List, XCircle, ExternalLink, Anvil } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center text-white">
              <Anvil size={16} strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <span className="block font-semibold text-stone-900 text-sm tracking-tight">
                TaskForge
              </span>
              <span className="block text-[11px] text-stone-400 tracking-wide uppercase">
                Operator Dashboard
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1 rounded-full border border-stone-200/90 bg-stone-100 p-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-stone-900 text-white font-medium shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
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
            aria-label="GitHub repository"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-500 hover:border-stone-300 hover:text-stone-900 transition-all duration-200"
          >
            <ExternalLink size={13} />
            GitHub
          </a>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="sm:hidden flex border-b border-stone-200/80 bg-white animate-fade-in">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors duration-200 ${
                isActive
                  ? 'text-stone-900 font-medium'
                  : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Main content */}
      <main key={location.pathname} className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-fade-up">
        {children}
      </main>

      <footer className="border-t border-stone-200/70 py-4">
        <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-stone-400">
          TaskForge — Postgres-backed job queue with dead-letter recovery
        </p>
      </footer>
    </div>
  );
}

function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-stone-900 mb-6">{children}</h1>
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
                <PageTitle>Queue Overview</PageTitle>
                <QueueOverview />
              </Layout>
            }
          />
          <Route
            path="/jobs"
            element={
              <Layout>
                <PageTitle>Jobs</PageTitle>
                <JobList />
              </Layout>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <Layout>
                <PageTitle>Job Detail</PageTitle>
                <JobDetail />
              </Layout>
            }
          />
          <Route
            path="/dead-letter"
            element={
              <Layout>
                <PageTitle>Dead-Letter Queue</PageTitle>
                <DeadLetterTable />
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
