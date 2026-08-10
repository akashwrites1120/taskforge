import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import { useBulkAction } from '../hooks/useBulkAction';

import { Pagination } from './Pagination';
import { ConfirmModal } from './ConfirmModal';
import { RefreshCw, AlertTriangle, CheckSquare, Square, Trash2 } from 'lucide-react';

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
      setSelected(new Set(jobs.map((j) => j.ID)));
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
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertTriangle size={18} /> Failed to load dead-letter jobs
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm">
          <span className="text-slate-300 font-medium">{selected.size} selected</span>
          <button
            onClick={() => setConfirmAction('requeue')}
            disabled={isBusy}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} /> Requeue {selected.size}
          </button>
          <button
            onClick={() => setConfirmAction('discard')}
            disabled={isBusy}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 text-red-400 border border-red-800/60 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} /> Discard {selected.size}
          </button>
          <span className="ml-auto text-xs text-slate-500">
            {isFetching && <RefreshCw size={12} className="inline animate-spin mr-1" />}
            {data?.total ?? 0} total dead-lettered
          </span>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-16 text-center space-y-3">
          <div className="text-5xl">✅</div>
          <p className="text-slate-300 font-medium">No dead-lettered jobs</p>
          <p className="text-sm text-slate-500">Queue is healthy — nothing needs operator attention.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5 w-10">
                    <button onClick={toggleAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                      {selected.size === jobs.length ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Attempts</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5">Last Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((job) => (
                  <tr
                    key={job.ID}
                    className={`transition-colors ${selected.has(job.ID) ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'}`}
                  >
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); toggle(job.ID); }}
                    >
                      {selected.has(job.ID) ? (
                        <CheckSquare size={16} className="text-indigo-400" />
                      ) : (
                        <Square size={16} className="text-slate-600" />
                      )}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-slate-400 cursor-pointer"
                      onClick={() => navigate(`/jobs/${job.ID}`)}
                    >
                      {job.ID.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium cursor-pointer" onClick={() => navigate(`/jobs/${job.ID}`)}>
                      {job.JobType}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {job.AttemptCount}/{job.MaxAttempts}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmt(job.UpdatedAt)}</td>
                    <td className="px-4 py-3 text-xs text-red-400/80 max-w-xs truncate">
                      {job.Result ?? '—'}
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
              onChange={(o) => { setOffset(o); setSelected(new Set()); }}
            />
          )}
        </div>
      )}

      {/* Confirm bulk modals */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction === 'requeue' ? `Requeue ${selected.size} Jobs` : `Discard ${selected.size} Jobs`}
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
