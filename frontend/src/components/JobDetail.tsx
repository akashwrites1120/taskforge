import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJobDetail } from '../hooks/useJobDetail';
import { useRequeueJob, useDiscardJob } from '../hooks/useJobActions';
import { StatusPill } from './StatusPill';
import { AttemptTimeline } from './AttemptTimeline';
import { PayloadEditor } from './PayloadEditor';
import { ConfirmModal } from './ConfirmModal';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  PenLine,
  TriangleAlert,
  Lock,
  History,
  Braces,
} from 'lucide-react';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function CountdownTimer({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));

  return (
    <span className="font-mono text-amber-300 tabular-nums">
      reclaims in {remaining}s
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
      <div className="flex items-center justify-center h-64 text-zinc-500 gap-2.5 text-sm">
        <RefreshCw size={16} className="animate-spin" /> Loading job…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2.5 text-sm animate-fade-in">
        <TriangleAlert size={16} /> Job not found or backend unavailable
      </div>
    );
  }

  const { job, attempts } = data;
  const isDL = job.status === 'dead_letter';
  const isProcessing = job.status === 'processing';

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-emerald-400 transition-colors duration-200 group"
      >
        <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform duration-200" /> Back
      </button>

      {/* Header */}
      <div className="card p-6 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusPill status={job.status} />
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{job.job_type}</h2>
            </div>
            <div className="font-mono text-xs text-zinc-600">{job.id}</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 tabular-nums">
              <span>Created {fmt(job.created_at)}</span>
              <span>Updated {fmt(job.updated_at)}</span>
              {job.completed_at && <span>Completed {fmt(job.completed_at)}</span>}
              <span className="font-mono">
                Attempts {job.attempt_count}/{job.max_attempts}
              </span>
            </div>
          </div>

          {/* Actions */}
          {isDL && (
            <div className="flex gap-2.5 flex-wrap animate-fade-in">
              <button
                onClick={() => setEditingPayload(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg font-medium transition-all duration-200"
              >
                <PenLine size={14} /> Edit & Requeue
              </button>
              <button
                onClick={() => requeue.mutate(undefined)}
                disabled={requeue.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw size={14} className={requeue.isPending ? 'animate-spin' : ''} />
                Requeue
              </button>
              <button
                onClick={() => setConfirmDiscard(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/25 rounded-lg font-medium transition-all duration-200"
              >
                <Trash2 size={14} /> Discard
              </button>
            </div>
          )}
        </div>

        {/* Lock info when processing */}
        {isProcessing && job.visibility_deadline && (
          <div className="mt-5 flex items-center gap-2.5 text-xs bg-sky-500/10 border border-sky-500/20 rounded-lg px-4 py-2.5 animate-scale-in">
            <Lock size={13} className="text-sky-400" />
            <span className="text-sky-300">
              Locked by <span className="font-mono">{job.locked_by}</span>
            </span>
            <span className="text-zinc-700">·</span>
            <CountdownTimer deadline={job.visibility_deadline} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payload */}
        <div
          className="card p-5 animate-fade-up self-start"
          style={{ animationDelay: '60ms' }}
        >
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-3.5">
            <Braces size={14} className="text-zinc-500" />
            Payload
          </h3>
          {editingPayload ? (
            <PayloadEditor
              initialValue={job.payload}
              loading={requeue.isPending}
              onCancel={() => setEditingPayload(false)}
              onSave={(p) => {
                requeue.mutate(p, {
                  onSuccess: () => setEditingPayload(false),
                });
              }}
            />
          ) : (
            <pre className="text-xs font-mono leading-relaxed text-zinc-300 bg-zinc-950 rounded-lg px-4 py-3.5 overflow-x-auto whitespace-pre-wrap break-words border border-zinc-800/80">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          )}
        </div>

        {/* Attempt Timeline */}
        <div
          className="card p-5 animate-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-4">
            <History size={14} className="text-zinc-500" />
            Attempt History
            <span className="text-zinc-600 font-normal tabular-nums">({attempts.length})</span>
          </h3>
          <AttemptTimeline attempts={attempts} />
        </div>
      </div>

      {/* Error/success feedback */}
      {(requeue.isError || discard.isError) && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 animate-fade-in space-y-1">
          {requeue.isError && (
            <p>Requeue failed: {(requeue.error as Error).message}</p>
          )}
          {discard.isError && (
            <p>Discard failed: {(discard.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Discard confirm modal */}
      {confirmDiscard && (
        <ConfirmModal
          title="Discard Job"
          message={`Permanently delete job ${job.id.slice(0, 8)}…? This cannot be undone.`}
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
