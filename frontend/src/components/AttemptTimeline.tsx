import type { JobAttempt } from '../types';
import { CircleCheck, CircleX, TriangleAlert, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const RESULT_CONFIG = {
  success: {
    icon: CircleCheck,
    label: 'Success',
    cls: 'text-emerald-400',
    dotCls: 'bg-emerald-500/15 ring-emerald-500/40',
    lineCls: 'bg-zinc-800',
  },
  error: {
    icon: CircleX,
    label: 'Error',
    cls: 'text-red-400',
    dotCls: 'bg-red-500/15 ring-red-500/40',
    lineCls: 'bg-zinc-800',
  },
  non_retryable: {
    icon: TriangleAlert,
    label: 'Non-retryable',
    cls: 'text-amber-400',
    dotCls: 'bg-amber-500/15 ring-amber-500/40',
    lineCls: 'bg-zinc-800',
  },
  reclaimed_by_reaper: {
    icon: ShieldCheck,
    label: 'Reclaimed by Reaper',
    cls: 'text-sky-400',
    dotCls: 'bg-sky-500/15 ring-sky-500/40',
    lineCls: 'bg-zinc-800',
  },
} as const;

interface Props {
  attempts: JobAttempt[];
}

export function AttemptTimeline({ attempts }: Props) {
  if (attempts.length === 0) {
    return (
      <div className="text-sm text-zinc-500 italic py-4">No attempts recorded yet.</div>
    );
  }

  return (
    <ol className="space-y-1">
      {attempts.map((att, i) => {
        const cfg = RESULT_CONFIG[att.result] ?? RESULT_CONFIG.error;
        const Icon = cfg.icon;
        const isLast = i === attempts.length - 1;

        return (
          <li key={att.id} className="flex gap-4 relative animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            {/* Vertical line */}
            {!isLast && (
              <div className={clsx('absolute left-[13px] top-8 bottom-0 w-px', cfg.lineCls)} />
            )}

            {/* Dot */}
            <div
              className={clsx(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 z-10 ring-1',
                cfg.dotCls,
              )}
            >
              <Icon size={14} strokeWidth={2.2} className={cfg.cls} />
            </div>

            {/* Content */}
            <div className="flex-1 pb-5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`text-sm font-medium ${cfg.cls}`}>{cfg.label}</span>
                <span className="text-xs text-zinc-500 font-mono tabular-nums">
                  #{att.attempt_number + 1}
                </span>
                {att.duration_ms > 0 && (
                  <span className="text-xs text-zinc-600 font-mono">{fmtDuration(att.duration_ms)}</span>
                )}
                <span className="text-xs text-zinc-600 ml-auto">{fmt(att.created_at)}</span>
              </div>

              {att.result === 'reclaimed_by_reaper' && (
                <div className="text-xs text-sky-300/90 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2 mt-1.5">
                  Worker crash detected — job reclaimed and re-queued by the Reaper
                </div>
              )}

              {att.error_message && att.result !== 'reclaimed_by_reaper' && (
                <pre className="mt-1.5 text-xs text-red-300/90 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {att.error_message}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
