import { useState, useEffect } from 'react';
import { Search, X, CalendarRange } from 'lucide-react';
import type { JobStatus } from '../types';

const STATUSES: JobStatus[] = ['pending', 'processing', 'retrying', 'succeeded', 'dead_letter'];
const JOB_TYPES = ['send_email', 'process_payment', 'export_data'];

export interface Filters {
  status: string[];
  job_type: string[];
  search: string;
  start_time: string;
  end_time: string;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function readFiltersFromParams(params: URLSearchParams): Filters {
  return {
    status: params.getAll('status'),
    job_type: params.getAll('job_type'),
    search: params.get('search') ?? '',
    start_time: params.get('start_time') ?? '',
    end_time: params.get('end_time') ?? '',
  };
}

export function writeFiltersToParams(filters: Filters): URLSearchParams {
  const p = new URLSearchParams();
  filters.status.forEach((s) => p.append('status', s));
  filters.job_type.forEach((t) => p.append('job_type', t));
  if (filters.search) p.set('search', filters.search);
  if (filters.start_time) p.set('start_time', filters.start_time);
  if (filters.end_time) p.set('end_time', filters.end_time);
  return p;
}

export function JobFilters({ filters, onChange }: Props) {
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    const t = setTimeout(() => {
      onChange({ ...filters, search });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  function toggleStatus(s: string) {
    const next = filters.status.includes(s)
      ? filters.status.filter((x) => x !== s)
      : [...filters.status, s];
    onChange({ ...filters, status: next });
  }

  function toggleType(t: string) {
    const next = filters.job_type.includes(t)
      ? filters.job_type.filter((x) => x !== t)
      : [...filters.job_type, t];
    onChange({ ...filters, job_type: next });
  }

  function clear() {
    setSearch('');
    onChange({ status: [], job_type: [], search: '', start_time: '', end_time: '' });
  }

  const hasFilters =
    filters.status.length > 0 || filters.job_type.length > 0 || filters.search || filters.start_time || filters.end_time;

  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
      active
        ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
    }`;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative group">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-400 transition-colors duration-200" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or idempotency key…"
          className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 transition-all duration-200"
        />
      </div>

      {/* Chips row */}
      <div className="flex flex-wrap gap-2 items-center">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => toggleStatus(s)} className={chipCls(filters.status.includes(s))}>
            {s.replace('_', ' ')}
          </button>
        ))}
        <span className="w-px h-4 bg-zinc-800 mx-1" />
        {JOB_TYPES.map((t) => (
          <button key={t} onClick={() => toggleType(t)} className={chipCls(filters.job_type.includes(t))}>
            {t}
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={clear}
            className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors duration-200 animate-fade-in"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-end gap-3">
        <span className="flex items-center gap-1.5 text-xs text-zinc-600 pb-2">
          <CalendarRange size={13} /> Range
        </span>
        {(
          [
            ['From', 'start_time'],
            ['To', 'end_time'],
          ] as const
        ).map(([label, field]) => (
          <div key={field}>
            <label className="text-[11px] uppercase tracking-wide text-zinc-600 block mb-1">{label}</label>
            <input
              type="datetime-local"
              value={filters[field]}
              onChange={(e) => onChange({ ...filters, [field]: e.target.value })}
              className="bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-300 px-3 py-2 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 transition-all duration-200 [color-scheme:dark]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
