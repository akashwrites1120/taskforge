import { useState } from 'react';

interface Props {
  initialValue: unknown;
  onSave: (payload: unknown) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function PayloadEditor({ initialValue, onSave, onCancel, loading = false }: Props) {
  const [text, setText] = useState(() => JSON.stringify(initialValue, null, 2));
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
    <div className="space-y-3 animate-fade-in">
      <div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          rows={12}
          spellCheck={false}
          className={`w-full font-mono text-xs leading-relaxed text-zinc-200 bg-zinc-950 border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 transition-all duration-200 ${
            error
              ? 'border-red-500/50 focus:ring-red-500/20'
              : 'border-zinc-800 focus:border-emerald-500/50 focus:ring-emerald-500/15'
          }`}
        />
        {error && <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{error}</p>}
      </div>
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg disabled:opacity-50 transition-all duration-200"
        >
          {loading ? 'Saving…' : 'Requeue with Payload'}
        </button>
      </div>
    </div>
  );
}
