import clsx from 'clsx';
import { Timer } from 'lucide-react';

interface Props {
  ageSeconds: number;
}

export function QueueLagBadge({ ageSeconds }: Props) {
  const minutes = Math.round(ageSeconds / 60);

  let label: string;
  let cls: string;
  let dot: string;

  if (ageSeconds < 60) {
    label = ageSeconds === 0 ? 'No lag' : `${ageSeconds}s lag`;
    cls = 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    dot = 'bg-emerald-400';
  } else if (minutes < 5) {
    label = `${minutes}m lag`;
    cls = 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    dot = 'bg-amber-400';
  } else {
    label = `${minutes}m lag`;
    cls = 'text-red-300 bg-red-500/10 border-red-500/30';
    dot = 'bg-red-400';
  }

  return (
    <div className={clsx('inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg border text-sm font-medium animate-scale-in', cls)}>
      <span className="relative flex w-2 h-2">
        <span className={clsx('absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping', dot)} />
        <span className={clsx('relative inline-flex w-2 h-2 rounded-full', dot)} />
      </span>
      {label}
      <Timer size={15} className="opacity-50" />
    </div>
  );
}
