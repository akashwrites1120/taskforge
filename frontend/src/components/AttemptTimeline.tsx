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
    cls: 'text-emerald-600',
    dotCls: 'bg-emerald-50 ring-emerald-200',
    lineCls: 'bg-stone-200',
    labelCls: 'text-emerald-700',
  },
  error: {
    icon: CircleX,
    label: 'Error',
    cls: 'text-red-500',
    dotCls: 'bg-red-50 ring-red-200',
    lineCls: 'bg-stone-200',
    labelCls: 'text-red-600',
  },
  non_retryable: {
    icon: TriangleAlert,
    label: 'Non-retryable',
    cls: 'text-amber-500',
    dotCls: 'bg-amber-50 ring-amber-200',
    lineCls: 'bg-stone-200',
    labelCls: 'text-amber-700',
  },
  reclaimed_by_reaper: {
    icon: ShieldCheck,
    label: 'Reclaimed by Reaper',
    cls: 'text-blue-500',
    dotCls: 'bg-blue-50 ring-blue-200',
    lineCls: 'bg-stone-200',
    labelCls: 'text-blue-700',
  },
} as const;

interface Props {
  attempts: JobAttempt[];
}

export function AttemptTimeline({ attempts }: Props) {
  if (attempts.length === 0) {
    return (
      <div className="text-sm text-stone-400 italic py-4">No attempts recorded yet.</div>
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
                <span className={`text-sm font-medium ${cfg.labelCls}`}>{cfg.label}</span>
                <span className="text-xs text-stone-400 font-mono tabular-nums">
                  #{att.attempt_number + 1}
                </span>
                {att.duration_ms > 0 && (
                  <span className="text-xs text-stone-400 font-mono">{fmtDuration(att.duration_ms)}</span>
                )}
                <span className="text-xs text-stone-400 ml-auto">{fmt(att.created_at)}</span>
              </div>

              {att.result === 'reclaimed_by_reaper' && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1.5">
                  Worker crash detected — job reclaimed and re-queued by the Reaper
                </div>
              )}

              {att.error_message && att.result !== 'reclaimed_by_reaper' && (
                <pre className="mt-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
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
