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
      <div className="flex items-center justify-center h-64 text-zinc-500 gap-2.5 text-sm">
        <RefreshCw size={16} className="animate-spin" /> Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2.5 text-sm animate-fade-in">
        <TriangleAlert size={16} /> Failed to load dead-letter jobs
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3 text-sm animate-scale-in">
          <span className="text-emerald-300 font-medium tabular-nums">{selected.size} selected</span>
          <button
            onClick={() => setConfirmAction('requeue')}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg text-xs font-medium disabled:opacity-50 transition-all duration-200"
          >
            <RotateCcw size={13} /> Requeue {selected.size}
          </button>
          <button
            onClick={() => setConfirmAction('discard')}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium disabled:opacity-50 transition-all duration-200"
          >
            <Trash2 size={13} /> Discard {selected.size}
          </button>
          <span className="ml-auto text-xs text-zinc-500 tabular-nums">
            {isFetching && <RefreshCw size={12} className="inline animate-spin mr-1" />}
            {data?.total ?? 0} total dead-lettered
          </span>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card p-16 text-center space-y-3 animate-fade-up">
          <div className="flex justify-center">
            <CheckCircle2 size={40} strokeWidth={1.25} className="text-emerald-400" />
          </div>
          <p className="text-zinc-200 font-medium">No dead-lettered jobs</p>
          <p className="text-sm text-zinc-500">Queue is healthy — nothing needs operator attention.</p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider font-medium text-zinc-500 border-b border-zinc-800/80">
                  <th className="px-4 py-3 w-10">
                    <button
                      onClick={toggleAll}
                      aria-label="Select all"
                      className="text-zinc-500 hover:text-zinc-200 transition-colors duration-150"
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
              <tbody className="divide-y divide-zinc-800/60">
                {jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`group cursor-pointer transition-colors duration-150 animate-fade-in ${
                      selected.has(job.id)
                        ? 'bg-emerald-500/5'
                        : 'hover:bg-zinc-800/40'
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
                        <CheckSquare size={16} className="text-emerald-400" />
                      ) : (
                        <Square size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors duration-150" />
                      )}
                    </td>
                    <td
                      className="px-4 py-3.5 font-mono text-xs text-zinc-400 group-hover:text-emerald-300 transition-colors duration-150"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      {job.id.slice(0, 8)}…
                    </td>
                    <td
                      className="px-4 py-3.5 text-zinc-200 font-medium"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      {job.job_type}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-zinc-400 tabular-nums">
                      {job.attempt_count}/{job.max_attempts}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-500 text-xs">{fmt(job.updated_at)}</td>
                    <td className="px-4 py-3.5 text-xs text-red-300/80 max-w-xs truncate">
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
