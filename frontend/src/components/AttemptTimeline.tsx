import type { JobAttempt } from '../types';
import { CheckCircle, XCircle, AlertTriangle, Shield } from 'lucide-react';
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
    icon: CheckCircle,
    label: 'Success',
    cls: 'text-green-400',
    dot: 'bg-green-500',
    line: 'border-green-800',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    cls: 'text-red-400',
    dot: 'bg-red-500',
    line: 'border-red-900',
  },
  non_retryable: {
    icon: AlertTriangle,
    label: 'Non-retryable',
    cls: 'text-amber-400',
    dot: 'bg-amber-500',
    line: 'border-amber-900',
  },
  reclaimed_by_reaper: {
    icon: Shield,
    label: 'Reclaimed by Reaper',
    cls: 'text-violet-400',
    dot: 'bg-violet-500',
    line: 'border-violet-900',
  },
} as const;

interface Props {
  attempts: JobAttempt[];
}

export function AttemptTimeline({ attempts }: Props) {
  if (attempts.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic py-4">No attempts recorded yet.</div>
    );
  }

  return (
    <ol className="space-y-4">
      {attempts.map((att, i) => {
        const cfg = RESULT_CONFIG[att.Result] ?? RESULT_CONFIG.error;
        const Icon = cfg.icon;
        const isLast = i === attempts.length - 1;

        return (
          <li key={att.ID} className="flex gap-4 relative">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-3 top-7 bottom-0 w-px bg-slate-700" />
            )}

            {/* Dot */}
            <div
              className={clsx(
                'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 z-10',
                `${cfg.dot}/20 ring-1 ring-${cfg.dot.replace('bg-', '')}/50`
              )}
            >
              <Icon size={12} className={cfg.cls} />
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`text-sm font-medium ${cfg.cls}`}>{cfg.label}</span>
                <span className="text-xs text-slate-500">
                  Attempt #{att.AttemptNumber + 1}
                </span>
                {att.DurationMs > 0 && (
                  <span className="text-xs text-slate-500">
                    · {fmtDuration(att.DurationMs)}
                  </span>
                )}
                <span className="text-xs text-slate-600 ml-auto">{fmt(att.CreatedAt)}</span>
              </div>

              {att.Result === 'reclaimed_by_reaper' && (
                <div className="text-xs text-violet-400/80 bg-violet-500/10 border border-violet-800/40 rounded-lg px-3 py-2 mt-2">
                  ⚠ Worker crash detected — job reclaimed and re-queued by the Reaper
                </div>
              )}

              {att.ErrorMessage && att.Result !== 'reclaimed_by_reaper' && (
                <pre className="mt-2 text-xs text-red-300 bg-red-500/5 border border-red-900/30 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {att.ErrorMessage}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
