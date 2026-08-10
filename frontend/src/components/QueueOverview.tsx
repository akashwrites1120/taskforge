import { useStats } from '../hooks/useStats';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle, Clock, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { QueueLagBadge } from './QueueLagBadge';

const CARDS = [
  { key: 'pending',     label: 'Pending',     icon: Clock,       color: 'text-slate-300', border: 'border-slate-600' },
  { key: 'processing',  label: 'Processing',  icon: Activity,    color: 'text-blue-400',  border: 'border-blue-800'  },
  { key: 'retrying',   label: 'Retrying',    icon: RefreshCw,   color: 'text-amber-400', border: 'border-amber-800' },
  { key: 'succeeded',  label: 'Succeeded',   icon: CheckCircle, color: 'text-green-400', border: 'border-green-800' },
  { key: 'dead_letter',label: 'Dead Letter', icon: XCircle,     color: 'text-red-400',   border: 'border-red-800'   },
] as const;

export function QueueOverview() {
  const { data, isLoading, isError } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Activity size={24} className="animate-pulse mr-2" /> Loading stats…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertTriangle size={20} /> Failed to load stats — is the backend running?
      </div>
    );
  }

  const throughputData = [
    { name: '1h ago', succeeded: 0, failed: 0 },
    { name: 'Now', succeeded: data.throughput_succeeded, failed: data.throughput_failed },
  ];

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {CARDS.map(({ key, label, icon: Icon, color, border }) => {
          const count = data.status_counts[key] ?? 0;
          const isDeadLetter = key === 'dead_letter';
          const card = (
            <div
              className={`relative bg-slate-900 border ${border} rounded-xl p-4 flex flex-col gap-2 transition-all hover:bg-slate-800/70 ${
                isDeadLetter ? 'ring-1 ring-red-800/60' : ''
              }`}
            >
              <div className={`flex items-center gap-2 text-sm font-medium ${color}`}>
                <Icon size={16} />
                {label}
              </div>
              <div className={`text-3xl font-bold tracking-tight ${color}`}>
                {count.toLocaleString()}
              </div>
              {isDeadLetter && count > 0 && (
                <span className="absolute top-3 right-3 text-xs text-red-400 font-medium">
                  Action needed →
                </span>
              )}
            </div>
          );
          return isDeadLetter ? (
            <Link key={key} to="/dead-letter" className="contents">
              {card}
            </Link>
          ) : (
            <div key={key}>{card}</div>
          );
        })}
      </div>

      {/* Queue Lag + Throughput Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Queue Lag</h3>
          <QueueLagBadge ageSeconds={data.oldest_pending_age_seconds} />
          <p className="mt-2 text-xs text-slate-500">
            Age of oldest pending/retrying job past due
          </p>
        </div>

        <div className="lg:col-span-2 bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Throughput — last hour
          </h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={throughputData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area type="monotone" dataKey="succeeded" name="Succeeded" stroke="#22c55e" fill="url(#gSuccess)" strokeWidth={2} />
              <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="url(#gFailed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-job-type breakdown */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-400 mb-4">Status Breakdown</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(data.status_counts).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <span className="text-slate-400 capitalize">{status.replace('_', ' ')}</span>
              <span className="font-mono text-slate-200 font-semibold">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
