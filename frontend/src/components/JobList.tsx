import { useNavigate, useSearchParams } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import { StatusPill } from './StatusPill';
import { Pagination } from './Pagination';
import { JobFilters, readFiltersFromParams, writeFiltersToParams, type Filters } from './JobFilters';
import { RefreshCw, TriangleAlert, Inbox, ChevronRight } from 'lucide-react';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const LIMIT = 25;

export function JobList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = readFiltersFromParams(searchParams);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  function setFilters(f: Filters) {
    const p = writeFiltersToParams(f);
    p.set('offset', '0');
    setSearchParams(p);
  }

  const { data, isLoading, isError, isFetching } = useJobs({
    ...filters,
    limit: LIMIT,
    offset,
  });

  return (
    <div className="space-y-5">
      <JobFilters filters={filters} onChange={setFilters} />

      <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: '80ms' }}>
        {/* Table header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200/90">
          <span className="text-sm font-medium text-stone-600 tabular-nums">
            {data ? `${data.total.toLocaleString()} jobs` : 'Jobs'}
          </span>
          {isFetching && (
            <RefreshCw size={14} className="text-emerald-600/70 animate-spin" />
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-44 text-stone-400 gap-2.5 text-sm">
            <RefreshCw size={16} className="animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <div className="flex justify-center items-center h-44 text-red-600 gap-2.5 text-sm animate-fade-in">
            <TriangleAlert size={16} /> Failed to load jobs
          </div>
        ) : !data || data.jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-44 text-stone-400 gap-3 animate-fade-in">
            <Inbox size={28} strokeWidth={1.5} />
            <span className="text-sm">No jobs match these filters</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider font-medium text-stone-400 border-b border-stone-200/90">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Run At</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="group cursor-pointer hover:bg-stone-50 transition-colors duration-150 animate-fade-in"
                    style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-stone-500 group-hover:text-emerald-600 transition-colors duration-150">
                      {job.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3.5 text-stone-800 font-medium">{job.job_type}</td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={job.status} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-stone-500 tabular-nums">
                      {job.attempt_count}/{job.max_attempts}
                    </td>
                    <td className="px-4 py-3.5 text-stone-400 text-xs">{fmt(job.run_at)}</td>
                    <td className="px-4 py-3.5 text-stone-400 text-xs">{fmt(job.updated_at)}</td>
                    <td className="px-2 py-3.5">
                      <ChevronRight
                        size={15}
                        className="text-stone-300 group-hover:text-stone-500 group-hover:translate-x-0.5 transition-all duration-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination
            total={data.total}
            limit={LIMIT}
            offset={offset}
            onChange={(o) => {
              const p = writeFiltersToParams(filters);
              p.set('offset', String(o));
              setSearchParams(p);
            }}
          />
        )}
      </div>
    </div>
  );
}
