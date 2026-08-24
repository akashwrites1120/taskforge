import { useStats } from '../hooks/useStats';
import { Link } from 'react-router-dom';
import {
  Activity,
  CircleCheck,
  Clock,
  RefreshCw,
  CircleX,
  TriangleAlert,
  ArrowRight,
} from 'lucide-react';
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
  { key: 'pending', label: 'Pending', icon: Clock, accent: 'bg-stone-300' },
  { key: 'processing', label: 'Processing', icon: Activity, accent: 'bg-blue-500' },
  { key: 'retrying', label: 'Retrying', icon: RefreshCw, accent: 'bg-amber-500' },
  { key: 'succeeded', label: 'Succeeded', icon: CircleCheck, accent: 'bg-emerald-500' },
  { key: 'dead_letter', label: 'Dead Letter', icon: CircleX, accent: 'bg-red-500' },
] as const;

export function QueueOverview() {
  const { data, isLoading, isError } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-400 gap-2.5 text-sm">
        <Activity size={18} className="animate-pulse" /> Loading stats…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600 gap-2.5 text-sm animate-fade-in">
        <TriangleAlert size={16} /> Failed to load stats — is the backend running?
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
        {CARDS.map(({ key, label, icon: Icon, accent }, i) => {
          const count = data.status_counts[key] ?? 0;
          const isDeadLetter = key === 'dead_letter';
          const card = (
            <div
              className={`card group relative p-4 flex flex-col gap-3 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 animate-fade-up ${
                isDeadLetter && count > 0 ? 'border-red-200' : ''
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className={`absolute left-0 top-4 bottom-4 w-[2.5px] rounded-full ${accent}`} />
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                <Icon size={14} />
                {label}
              </div>
              <div
                className={`text-3xl font-semibold tracking-tight tabular-nums ${
                  isDeadLetter && count > 0 ? 'text-red-600' : 'text-stone-900'
                }`}
              >
                {count.toLocaleString()}
              </div>
              {isDeadLetter && count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                  Action needed
                  <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform duration-200" />
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
        <div
          className="card p-5 animate-fade-up"
          style={{ animationDelay: '350ms' }}
        >
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400 mb-3">Queue Lag</h3>
          <QueueLagBadge ageSeconds={data.oldest_pending_age_seconds} />
          <p className="mt-3 text-xs leading-relaxed text-stone-400">
            Age of oldest pending/retrying job past due
          </p>
        </div>

        <div
          className="lg:col-span-2 card p-5 animate-fade-up"
          style={{ animationDelay: '420ms' }}
        >
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400 mb-3">
            Throughput — last hour
          </h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={throughputData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: '#a8a29e', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#a8a29e', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: '#d6d3d1', strokeWidth: 1 }}
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e7e5e4',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 4px 16px rgba(28,25,23,0.08)',
                }}
                labelStyle={{ color: '#78716c' }}
                itemStyle={{ padding: 0 }}
              />
              <Area type="monotone" dataKey="succeeded" name="Succeeded" stroke="#059669" fill="url(#gSuccess)" strokeWidth={1.75} />
              <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="url(#gFailed)" strokeWidth={1.75} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-status breakdown */}
      <div className="card p-5 animate-fade-up" style={{ animationDelay: '490ms' }}>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400 mb-4">Status Breakdown</h3>
        <div className="space-y-2.5">
          {Object.entries(data.status_counts).map(([status, count], i) => (
            <div
              key={status}
              className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 animate-fade-in"
              style={{ animationDelay: `${520 + i * 50}ms` }}
            >
              <span className="text-sm text-stone-500 capitalize">{status.replace('_', ' ')}</span>
              <span className="font-mono text-sm text-stone-900 font-medium tabular-nums">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
