import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onChange }: Props) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const btn =
    'p-1.5 rounded-md border border-stone-200 bg-white text-stone-500 hover:text-stone-900 hover:border-stone-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-stone-200 disabled:hover:text-stone-500 transition-all duration-200';

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-stone-500 border-t border-stone-200/90">
      <span>
        {total === 0
          ? 'No results'
          : `${offset + 1}–${Math.min(offset + limit, total)} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, offset - limit))} disabled={offset === 0} className={btn} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="px-1.5 font-mono text-xs text-stone-500 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
          className={btn}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
