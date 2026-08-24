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
  { key: 'pending', label: 'Pending', icon: Clock, cls: 'text-zinc-300', accent: 'bg-zinc-500' },
  { key: 'processing', label: 'Processing', icon: Activity, cls: 'text-sky-300', accent: 'bg-sky-400' },
  { key: 'retrying', label: 'Retrying', icon: RefreshCw, cls: 'text-amber-300', accent: 'bg-amber-400' },
  { key: 'succeeded', label: 'Succeeded', icon: CircleCheck, cls: 'text-emerald-300', accent: 'bg-emerald-400' },
  { key: 'dead_letter', label: 'Dead Letter', icon: CircleX, cls: 'text-red-300', accent: 'bg-red-400' },
] as const;

export function QueueOverview() {
  const { data, isLoading, isError } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 gap-2.5 text-sm">
        <Activity size={18} className="animate-pulse" /> Loading stats…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2.5 text-sm animate-fade-in">
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
        {CARDS.map(({ key, label, icon: Icon, cls, accent }, i) => {
          const count = data.status_counts[key] ?? 0;
          const isDeadLetter = key === 'dead_letter';
          const card = (
            <div
              className={`card group relative p-4 flex flex-col gap-3 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/80 animate-fade-up ${
                isDeadLetter && count > 0 ? 'border-red-500/30' : ''
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className={`absolute left-0 top-4 bottom-4 w-[2.5px] rounded-full ${accent} opacity-60`} />
              <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${cls}`}>
                {isDeadLetter && count > 0 ? (
                  <Icon size={14} className="animate-glow-pulse" />
                ) : (
                  <Icon size={14} />
                )}
                {label}
              </div>
              <div className={`text-3xl font-semibold tracking-tight tabular-nums ${cls}`}>
                {count.toLocaleString()}
              </div>
              {isDeadLetter && count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-400/90 font-medium">
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
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Queue Lag</h3>
          <QueueLagBadge ageSeconds={data.oldest_pending_age_seconds} />
          <p className="mt-3 text-xs leading-relaxed text-zinc-600">
            Age of oldest pending/retrying job past due
          </p>
        </div>

        <div
          className="lg:col-span-2 card p-5 animate-fade-up"
          style={{ animationDelay: '420ms' }}
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
            Throughput — last hour
          </h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={throughputData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: '#3f3f46', strokeWidth: 1 }}
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ padding: 0 }}
              />
              <Area type="monotone" dataKey="succeeded" name="Succeeded" stroke="#34d399" fill="url(#gSuccess)" strokeWidth={1.75} />
              <Area type="monotone" dataKey="failed" name="Failed" stroke="#f87171" fill="url(#gFailed)" strokeWidth={1.75} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-status breakdown */}
      <div className="card p-5 animate-fade-up" style={{ animationDelay: '490ms' }}>
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">Status Breakdown</h3>
        <div className="space-y-2.5">
          {Object.entries(data.status_counts).map(([status, count], i) => (
            <div
              key={status}
              className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0 animate-fade-in"
              style={{ animationDelay: `${520 + i * 50}ms` }}
            >
              <span className="text-sm text-zinc-400 capitalize">{status.replace('_', ' ')}</span>
              <span className="font-mono text-sm text-zinc-100 font-medium tabular-nums">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
