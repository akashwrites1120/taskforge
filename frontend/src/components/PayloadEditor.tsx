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
          className={`w-full font-mono text-xs leading-relaxed text-stone-700 bg-stone-50 border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 transition-all duration-200 ${
            error
              ? 'border-red-300 focus:ring-red-500/10'
              : 'border-stone-200 focus:border-emerald-600/50 focus:ring-emerald-600/10'
          }`}
        />
        {error && <p className="mt-1.5 text-xs text-red-600 animate-fade-in">{error}</p>}
      </div>
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50 transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-all duration-200"
        >
          {loading ? 'Saving…' : 'Requeue with Payload'}
        </button>
      </div>
    </div>
  );
}
