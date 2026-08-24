import clsx from 'clsx';
import type { JobStatus } from '../types';

const CONFIG: Record<JobStatus, { label: string; dot: string; cls: string }> = {
  pending:     { label: 'Pending',     dot: 'bg-stone-400',   cls: 'text-stone-600 border-stone-200 bg-stone-50' },
  processing:  { label: 'Processing',  dot: 'bg-blue-500',    cls: 'text-blue-700 border-blue-200 bg-blue-50' },
  retrying:    { label: 'Retrying',    dot: 'bg-amber-500',   cls: 'text-amber-700 border-amber-200 bg-amber-50' },
  succeeded:   { label: 'Succeeded',   dot: 'bg-emerald-500', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  dead_letter: { label: 'Dead Letter', dot: 'bg-red-500',     cls: 'text-red-700 border-red-200 bg-red-50' },
};

interface Props {
  status: JobStatus;
  className?: string;
}

export function StatusPill({ status, className }: Props) {
  const cfg = CONFIG[status] ?? { label: status, dot: 'bg-stone-400', cls: 'text-stone-500 border-stone-200 bg-stone-50' };
  const isLive = status === 'processing' || status === 'retrying';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        cfg.cls,
        className,
      )}
    >
      <span className="relative flex w-1.5 h-1.5">
        {isLive && <span className={clsx('absolute inline-flex w-full h-full rounded-full animate-glow-pulse', cfg.dot)} />}
        <span className={clsx('relative inline-flex w-1.5 h-1.5 rounded-full', cfg.dot)} />
      </span>
      {cfg.label}
    </span>
  );
}
