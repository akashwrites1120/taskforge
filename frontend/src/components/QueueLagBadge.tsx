import clsx from 'clsx';
import { Clock } from 'lucide-react';

interface Props {
  ageSeconds: number;
}

export function QueueLagBadge({ ageSeconds }: Props) {
  const minutes = Math.round(ageSeconds / 60);

  let label: string;
  let cls: string;

  if (ageSeconds === 0) {
    label = 'No lag';
    cls = 'text-green-400 bg-green-500/10 border-green-700/40';
  } else if (ageSeconds < 60) {
    label = `${ageSeconds}s lag`;
    cls = 'text-green-400 bg-green-500/10 border-green-700/40';
  } else if (minutes < 5) {
    label = `${minutes}m lag`;
    cls = 'text-amber-400 bg-amber-500/10 border-amber-700/40';
  } else {
    label = `${minutes}m lag`;
    cls = 'text-red-400 bg-red-500/10 border-red-700/40';
  }

  return (
    <div className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold', cls)}>
      <Clock size={16} />
      {label}
    </div>
  );
}
