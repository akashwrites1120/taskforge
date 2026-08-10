import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJobDetail } from '../hooks/useJobDetail';
import { useRequeueJob, useDiscardJob } from '../hooks/useJobActions';
import { StatusPill } from './StatusPill';
import { AttemptTimeline } from './AttemptTimeline';
import { PayloadEditor } from './PayloadEditor';
import { ConfirmModal } from './ConfirmModal';
import { ArrowLeft, RefreshCw, Trash2, Edit3, AlertTriangle, Clock } from 'lucide-react';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function CountdownTimer({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));

  useState(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  });

  return (
    <span className="font-mono text-amber-400">
      {remaining}s until visibility timeout
    </span>
  );
}

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useJobDetail(id!);
  const requeue = useRequeueJob(id!);
  const discard = useDiscardJob(id!);

  const [editingPayload, setEditingPayload] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading job…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertTriangle size={18} /> Job not found or backend unavailable
      </div>
    );
  }

  const { job, attempts } = data;
  const isDL = job.Status === 'dead_letter';
  const isProcessing = job.Status === 'processing';

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <StatusPill status={job.Status} />
              <span className="text-lg font-semibold text-slate-100">{job.JobType}</span>
            </div>
            <div className="font-mono text-xs text-slate-500">{job.ID}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400 mt-2">
              <span>Created: {fmt(job.CreatedAt)}</span>
              <span>Updated: {fmt(job.UpdatedAt)}</span>
              {job.CompletedAt && <span>Completed: {fmt(job.CompletedAt)}</span>}
              <span>Attempts: {job.AttemptCount}/{job.MaxAttempts}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {isDL && (
              <>
                <button
                  onClick={() => setEditingPayload(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                >
                  <Edit3 size={14} /> Edit & Requeue
                </button>
                <button
                  onClick={() => requeue.mutate(undefined)}
                  disabled={requeue.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={requeue.isPending ? 'animate-spin' : ''} />
                  Requeue
                </button>
                <button
                  onClick={() => setConfirmDiscard(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-900/40 hover:bg-red-800/50 text-red-400 border border-red-800/60 rounded-lg font-medium transition-colors"
                >
                  <Trash2 size={14} /> Discard
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lock info when processing */}
        {isProcessing && job.VisibilityDeadline && (
          <div className="mt-4 flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-800/40 rounded-lg px-4 py-2">
            <Clock size={14} className="text-blue-400" />
            <span className="text-blue-300">Locked by: <span className="font-mono">{job.LockedBy}</span></span>
            <span className="text-slate-500 ml-2">·</span>
            <CountdownTimer deadline={job.VisibilityDeadline} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payload */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Payload</h3>
          {editingPayload ? (
            <PayloadEditor
              initialValue={job.Payload}
              loading={requeue.isPending}
              onCancel={() => setEditingPayload(false)}
              onSave={(p) => {
                requeue.mutate(p, {
                  onSuccess: () => setEditingPayload(false),
                });
              }}
            />
          ) : (
            <pre className="text-xs font-mono text-slate-300 bg-slate-950 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-words border border-slate-800">
              {JSON.stringify(job.Payload, null, 2)}
            </pre>
          )}
        </div>

        {/* Attempt Timeline */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Attempt History
            <span className="ml-2 text-slate-500 font-normal">({attempts.length})</span>
          </h3>
          <AttemptTimeline attempts={attempts} />
        </div>
      </div>

      {/* Error/success feedback */}
      {requeue.isError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-800/40 rounded-lg p-3">
          Requeue failed: {(requeue.error as Error).message}
        </div>
      )}
      {discard.isError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-800/40 rounded-lg p-3">
          Discard failed: {(discard.error as Error).message}
        </div>
      )}

      {/* Discard confirm modal */}
      {confirmDiscard && (
        <ConfirmModal
          title="Discard Job"
          message={`Permanently delete job ${job.ID.slice(0, 8)}…? This cannot be undone.`}
          confirmLabel="Discard"
          loading={discard.isPending}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            discard.mutate(undefined, {
              onSuccess: () => navigate('/dead-letter'),
            });
          }}
        />
      )}
    </div>
  );
}
