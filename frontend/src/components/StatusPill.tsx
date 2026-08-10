import clsx from 'clsx';
import type { JobStatus } from '../types';

const CONFIG: Record<JobStatus, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  processing:  { label: 'Processing',  cls: 'bg-blue-500/20  text-blue-300  border-blue-500/40'  },
  retrying:    { label: 'Retrying',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  succeeded:   { label: 'Succeeded',   cls: 'bg-green-500/20 text-green-300 border-green-500/40' },
  dead_letter: { label: 'Dead Letter', cls: 'bg-red-500/20   text-red-300   border-red-500/40'   },
};

interface Props {
  status: JobStatus;
  className?: string;
}

export function StatusPill({ status, className }: Props) {
  const cfg = CONFIG[status] ?? { label: status, cls: 'bg-slate-600/20 text-slate-400 border-slate-600/40' };
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        cfg.cls,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}
