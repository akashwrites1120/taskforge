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
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-zinc-950 shadow-[0_0_24px_rgba(16,185,129,0.25)]">
              <Anvil size={17} strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <span className="block font-semibold text-zinc-100 text-sm tracking-tight">
                TaskForge
              </span>
              <span className="block text-[11px] text-zinc-500 tracking-wide uppercase">
                Operator Dashboard
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-900/60 p-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-zinc-100 text-zinc-950 font-medium shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
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
            className="text-zinc-600 hover:text-zinc-300 transition-colors duration-200"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="sm:hidden flex border-b border-zinc-800/80 bg-zinc-950 animate-fade-in">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors duration-200 ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-zinc-600 hover:text-zinc-400'
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

      <footer className="border-t border-zinc-800/60 py-4">
        <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-zinc-600">
          TaskForge — Postgres-backed job queue with dead-letter recovery
        </p>
      </footer>
    </div>
  );
}

function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-6">{children}</h1>
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
