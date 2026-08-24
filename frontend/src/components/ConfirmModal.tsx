import { useEffect } from 'react';
import { TriangleAlert, X } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
  danger = true,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md card shadow-2xl shadow-black/60 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors duration-200"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-4">
            {danger && (
              <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 animate-scale-in">
                <TriangleAlert size={18} className="text-red-400" />
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{message}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-zinc-800/80">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-zinc-950 disabled:opacity-50 transition-all duration-200 ${
              danger
                ? 'bg-red-500 hover:bg-red-400'
                : 'bg-emerald-500 hover:bg-emerald-400'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
