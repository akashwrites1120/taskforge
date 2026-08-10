import { useNavigate, useSearchParams } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import { StatusPill } from './StatusPill';
import { Pagination } from './Pagination';
import { JobFilters, readFiltersFromParams, writeFiltersToParams, type Filters } from './JobFilters';
import { RefreshCw, AlertTriangle } from 'lucide-react';

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
    <div className="space-y-4">
      <JobFilters filters={filters} onChange={setFilters} />

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-sm font-medium text-slate-300">
            {data ? `${data.total.toLocaleString()} jobs` : 'Jobs'}
          </span>
          {isFetching && (
            <RefreshCw size={14} className="text-slate-500 animate-spin" />
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-40 text-slate-500">
            <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
          </div>
        ) : isError ? (
          <div className="flex justify-center items-center h-40 text-red-400 gap-2">
            <AlertTriangle size={18} /> Failed to load jobs
          </div>
        ) : !data || data.jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
            <span className="text-4xl">📭</span>
            <span className="text-sm">No jobs match these filters</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Attempts</th>
                  <th className="px-4 py-2.5">Run At</th>
                  <th className="px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.jobs.map((job) => (
                  <tr
                    key={job.ID}
                    onClick={() => navigate(`/jobs/${job.ID}`)}
                    className="cursor-pointer hover:bg-slate-800/60 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {job.ID.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{job.JobType}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={job.Status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {job.AttemptCount}/{job.MaxAttempts}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmt(job.RunAt)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmt(job.UpdatedAt)}</td>
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
