import clsx from 'clsx';
import type { JobStatus } from '../types';

const CONFIG: Record<JobStatus, { label: string; dot: string; cls: string }> = {
  pending:     { label: 'Pending',     dot: 'bg-zinc-400',   cls: 'text-zinc-300 border-zinc-700/60 bg-zinc-500/10' },
  processing:  { label: 'Processing',  dot: 'bg-sky-400',    cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  retrying:    { label: 'Retrying',    dot: 'bg-amber-400',  cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  succeeded:   { label: 'Succeeded',   dot: 'bg-emerald-400', cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  dead_letter: { label: 'Dead Letter', dot: 'bg-red-400',    cls: 'text-red-300 border-red-500/30 bg-red-500/10' },
};

interface Props {
  status: JobStatus;
  className?: string;
}

export function StatusPill({ status, className }: Props) {
  const cfg = CONFIG[status] ?? { label: status, dot: 'bg-zinc-500', cls: 'text-zinc-400 border-zinc-600/40 bg-zinc-600/10' };
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
