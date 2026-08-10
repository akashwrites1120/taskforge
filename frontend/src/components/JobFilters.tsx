import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or idempotency key…"
          className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Chips row */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <SlidersHorizontal size={13} /> Status:
        </span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              filters.status.includes(s)
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-2">Type:</span>
        {JOB_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              filters.job_type.includes(t)
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={clear}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Date range */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">From</label>
          <input
            type="datetime-local"
            value={filters.start_time}
            onChange={(e) => onChange({ ...filters, start_time: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">To</label>
          <input
            type="datetime-local"
            value={filters.end_time}
            onChange={(e) => onChange({ ...filters, end_time: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>
    </div>
  );
}
