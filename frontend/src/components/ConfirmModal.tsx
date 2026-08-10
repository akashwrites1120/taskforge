import { AlertTriangle, X } from 'lucide-react';

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-4">
            {danger && (
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{message}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
