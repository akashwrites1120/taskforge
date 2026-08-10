import { useState } from 'react';

interface Props {
  initialValue: unknown;
  onSave: (payload: unknown) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function PayloadEditor({ initialValue, onSave, onCancel, loading = false }: Props) {
  const [text, setText] = useState(() =>
    JSON.stringify(initialValue, null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onSave(parsed);
    } catch (e) {
      setError('Invalid JSON: ' + (e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          rows={12}
          spellCheck={false}
          className={`w-full font-mono text-xs text-slate-100 bg-slate-950 border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 transition-all ${
            error
              ? 'border-red-700 focus:ring-red-500/40'
              : 'border-slate-700 focus:ring-indigo-500/40'
          }`}
        />
        {error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-lg hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Requeue with Payload'}
        </button>
      </div>
    </div>
  );
}
