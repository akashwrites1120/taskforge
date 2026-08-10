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

  return (
    <div className="flex items-center justify-between px-2 py-3 text-sm text-slate-400">
      <span>
        {total === 0
          ? 'No results'
          : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="p-1 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-2 text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
          className="p-1 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
