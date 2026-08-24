import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import { useBulkAction } from '../hooks/useBulkAction';

import { Pagination } from './Pagination';
import { ConfirmModal } from './ConfirmModal';
import { RefreshCw, TriangleAlert, CheckCircle2, CheckSquare, Square, Trash2, RotateCcw } from 'lucide-react';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const LIMIT = 25;

export function DeadLetterTable() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<'requeue' | 'discard' | null>(null);

  const { data, isLoading, isError, isFetching } = useJobs({
    status: ['dead_letter'],
    limit: LIMIT,
    offset,
  });

  const bulkRequeue = useBulkAction('requeue');
  const bulkDiscard = useBulkAction('discard');

  const jobs = data?.jobs ?? [];

  function toggleAll() {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map((j) => j.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function executeBulk(action: 'requeue' | 'discard') {
    const ids = [...selected];
    const fn = action === 'requeue' ? bulkRequeue : bulkDiscard;
    await fn.mutateAsync(ids);
    setSelected(new Set());
    setConfirmAction(null);
  }

  const isBusy = bulkRequeue.isPending || bulkDiscard.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-400 gap-2.5 text-sm">
        <RefreshCw size={16} className="animate-spin" /> Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600 gap-2.5 text-sm animate-fade-in">
        <TriangleAlert size={16} /> Failed to load dead-letter jobs
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm animate-scale-in">
          <span className="text-emerald-700 font-medium tabular-nums">{selected.size} selected</span>
          <button
            onClick={() => setConfirmAction('requeue')}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-all duration-200"
          >
            <RotateCcw size={13} /> Requeue {selected.size}
          </button>
          <button
            onClick={() => setConfirmAction('discard')}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium disabled:opacity-50 transition-all duration-200"
          >
            <Trash2 size={13} /> Discard {selected.size}
          </button>
          <span className="ml-auto text-xs text-stone-400 tabular-nums">
            {isFetching && <RefreshCw size={12} className="inline animate-spin mr-1" />}
            {data?.total ?? 0} total dead-lettered
          </span>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card p-16 text-center space-y-3 animate-fade-up">
          <div className="flex justify-center">
            <CheckCircle2 size={40} strokeWidth={1.25} className="text-emerald-500" />
          </div>
          <p className="text-stone-800 font-medium">No dead-lettered jobs</p>
          <p className="text-sm text-stone-400">Queue is healthy — nothing needs operator attention.</p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider font-medium text-stone-400 border-b border-stone-200/90">
                  <th className="px-4 py-3 w-10">
                    <button
                      onClick={toggleAll}
                      aria-label="Select all"
                      className="text-stone-400 hover:text-stone-700 transition-colors duration-150"
                    >
                      {selected.size === jobs.length ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Last Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`group cursor-pointer transition-colors duration-150 animate-fade-in ${
                      selected.has(job.id)
                        ? 'bg-emerald-50/60'
                        : 'hover:bg-stone-50'
                    }`}
                    style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}
                  >
                    <td
                      className="px-4 py-3.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(job.id);
                      }}
                    >
                      {selected.has(job.id) ? (
                        <CheckSquare size={16} className="text-emerald-600" />
                      ) : (
                        <Square size={16} className="text-stone-300 group-hover:text-stone-500 transition-colors duration-150" />
                      )}
                    </td>
                    <td
                      className="px-4 py-3.5 font-mono text-xs text-stone-500 group-hover:text-emerald-600 transition-colors duration-150"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      {job.id.slice(0, 8)}…
                    </td>
                    <td
                      className="px-4 py-3.5 text-stone-800 font-medium"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      {job.job_type}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-stone-500 tabular-nums">
                      {job.attempt_count}/{job.max_attempts}
                    </td>
                    <td className="px-4 py-3.5 text-stone-400 text-xs">{fmt(job.updated_at)}</td>
                    <td className="px-4 py-3.5 text-xs text-red-600/90 max-w-xs truncate">
                      {job.result != null ? String(job.result) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && (
            <Pagination
              total={data.total}
              limit={LIMIT}
              offset={offset}
              onChange={(o) => {
                setOffset(o);
                setSelected(new Set());
              }}
            />
          )}
        </div>
      )}

      {/* Confirm bulk modals */}
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction === 'requeue' ? `Requeue ${selected.size} Jobs` : `Discard ${selected.size} Jobs`
          }
          message={
            confirmAction === 'requeue'
              ? `Re-queue ${selected.size} dead-lettered jobs back to pending with attempt count reset to 0?`
              : `Permanently delete ${selected.size} dead-lettered jobs? This cannot be undone.`
          }
          confirmLabel={confirmAction === 'requeue' ? 'Requeue All' : 'Discard All'}
          loading={isBusy}
          danger={confirmAction === 'discard'}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => executeBulk(confirmAction)}
        />
      )}
    </div>
  );
}
