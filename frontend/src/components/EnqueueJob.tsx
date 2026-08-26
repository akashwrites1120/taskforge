import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Mail,
  CreditCard,
  FileDown,
  PenLine,
  Sparkles,
  Send,
  CircleCheck,
  TriangleAlert,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

import { apiClient } from '../apiClient';
import type { EnqueueResponse } from '../types';

interface Preset {
  type: string;
  icon: typeof Mail;
  desc: string;
  tag: string;
  payload: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    type: 'send_email',
    icon: Mail,
    desc: 'Simulates sending an email (~0.8s). Randomly fails to demo retries.',
    tag: '15% transient · 5% fatal',
    payload: { to: 'user@example.com', subject: 'Welcome to TaskForge', template: 'signup' },
  },
  {
    type: 'process_payment',
    icon: CreditCard,
    desc: 'Simulates charging a payment. Always succeeds (~0.5s).',
    tag: 'always succeeds',
    payload: { amount: 99.5, currency: 'USD', customer_id: 'cust_1042' },
  },
  {
    type: 'export_data',
    icon: FileDown,
    desc: 'Long-running export (~5s) that heartbeats to keep its lock alive.',
    tag: 'long-running',
    payload: { format: 'csv', rows: 1000, table: 'orders' },
  },
];

const SEED: Array<{ type: string; payload: Record<string, unknown>; max_attempts?: number }> = [
  { type: 'send_email', payload: { to: 'alice@example.com', subject: 'Weekly digest' } },
  { type: 'send_email', payload: { to: 'bob@example.com', subject: 'Password reset' }, max_attempts: 1 },
  { type: 'send_email', payload: { to: 'carol@example.com', subject: 'Invoice #481 ready' }, max_attempts: 1 },
  { type: 'process_payment', payload: { amount: 42, currency: 'USD', customer_id: 'cust_2001' } },
  { type: 'process_payment', payload: { amount: 129.99, currency: 'EUR', customer_id: 'cust_2002' } },
  { type: 'export_data', payload: { format: 'csv', rows: 5000, table: 'events' } },
  { type: 'send_email', payload: { to: 'dave@example.com', subject: 'You are invited' } },
  { type: 'process_payment', payload: { amount: 7.25, currency: 'GBP', customer_id: 'cust_2003' } },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EnqueueJob() {
  const qc = useQueryClient();

  const [selected, setSelected] = useState<number>(0);
  const [customMode, setCustomMode] = useState(false);
  const [customType, setCustomType] = useState('');
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(PRESETS[0].payload, null, 2));
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const [priority, setPriority] = useState('0');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [uniqueKey, setUniqueKey] = useState('');

  const [success, setSuccess] = useState<EnqueueResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const preset = useMemo(() => (customMode ? null : PRESETS[selected]), [customMode, selected]);

  function selectPreset(i: number) {
    setCustomMode(false);
    setSelected(i);
    setPayloadText(JSON.stringify(PRESETS[i].payload, null, 2));
    setPayloadError(null);
    setSuccess(null);
    setSubmitError(null);
  }

  function selectCustom() {
    setCustomMode(true);
    setPayloadText('{\n  \n}');
    setPayloadError(null);
    setSuccess(null);
    setSubmitError(null);
  }

  function resetPayload() {
    if (preset) setPayloadText(JSON.stringify(preset.payload, null, 2));
  }

  const enqueue = useMutation({
    mutationFn: (body: object) => apiClient.enqueueJob(body),
    onSuccess: (data) => {
      setSuccess(data);
      setSubmitError(null);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => {
      setSubmitError(e.message);
      setSuccess(null);
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      let ok = 0;
      for (const job of SEED) {
        try {
          await apiClient.enqueueJob({
            job_type: job.type,
            payload: job.payload,
            priority: 0,
            ...(job.max_attempts ? { max_attempts: job.max_attempts } : {}),
          });
          ok++;
        } catch {
          // keep seeding the rest
        }
        await sleep(120);
      }
      return ok;
    },
    onSuccess: (ok) => {
      setSeedResult(`Seeded ${ok} sample jobs — watch them flow through the queue.`);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => setSeedResult(`Seeding failed: ${e.message}`),
  });

  function handleSubmit() {
    setSuccess(null);
    setSubmitError(null);
    setSeedResult(null);

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
      setPayloadError(null);
    } catch (e) {
      setPayloadError('Invalid JSON: ' + (e as Error).message);
      return;
    }

    const jobType = customMode ? customType.trim() : preset?.type;
    if (!jobType) {
      setSubmitError('Job type is required.');
      return;
    }

    const attempts = parseInt(maxAttempts, 10);
    const delay = parseInt(delaySeconds, 10);

    enqueue.mutate({
      job_type: jobType,
      payload,
      priority: parseInt(priority, 10) || 0,
      ...(Number.isFinite(attempts) && attempts > 0 ? { max_attempts: attempts } : {}),
      ...(Number.isFinite(delay) && delay > 0
        ? { run_at: new Date(Date.now() + delay * 1000).toISOString() }
        : {}),
      ...(idempotencyKey.trim() ? { idempotency_key: idempotencyKey.trim() } : {}),
      ...(uniqueKey.trim() ? { unique_key: uniqueKey.trim() } : {}),
    });
  }

  const inputCls =
    'w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 placeholder:text-stone-300 focus:outline-none focus:border-emerald-600/50 focus:ring-2 focus:ring-emerald-600/10 transition-all duration-200';

  return (
    <div className="space-y-6">
      {/* Job type */}
      <section className="animate-fade-up">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400 mb-3">Job type</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESETS.map((p, i) => {
            const active = !customMode && selected === i;
            const Icon = p.icon;
            return (
              <button
                key={p.type}
                onClick={() => selectPreset(i)}
                className={`card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 ${
                  active ? 'border-stone-900 ring-2 ring-stone-900/10' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon size={16} className={active ? 'text-stone-900' : 'text-stone-400'} />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">{p.tag}</span>
                </div>
                <div className="font-mono text-sm font-medium text-stone-900 mb-1">{p.type}</div>
                <p className="text-xs leading-relaxed text-stone-400">{p.desc}</p>
              </button>
            );
          })}
          <button
            onClick={selectCustom}
            className={`card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 ${
              customMode ? 'border-stone-900 ring-2 ring-stone-900/10' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <PenLine size={16} className={customMode ? 'text-stone-900' : 'text-stone-400'} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">advanced</span>
            </div>
            <div className="text-sm font-medium text-stone-900 mb-1">Custom type</div>
            <p className="text-xs leading-relaxed text-stone-400">
              Any job type string with a hand-written payload.
            </p>
          </button>
        </div>
        {customMode && (
          <input
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="e.g. generate_invoice"
            className={`${inputCls} mt-3 font-mono max-w-sm animate-fade-in`}
          />
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Payload */}
        <section className="lg:col-span-3 card p-5 animate-fade-up" style={{ animationDelay: '70ms' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Payload <span className="normal-case tracking-normal text-stone-300">— JSON, prefilled & editable</span>
            </h3>
            {preset && (
              <button
                onClick={resetPayload}
                className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700 transition-colors duration-200"
              >
                <RotateCcw size={11} /> Reset to sample
              </button>
            )}
          </div>
          <textarea
            value={payloadText}
            onChange={(e) => {
              setPayloadText(e.target.value);
              setPayloadError(null);
            }}
            rows={10}
            spellCheck={false}
            className={`w-full font-mono text-xs leading-relaxed text-stone-700 bg-stone-50 border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 transition-all duration-200 ${
              payloadError
                ? 'border-red-300 focus:ring-red-500/10'
                : 'border-stone-200 focus:border-emerald-600/50 focus:ring-emerald-600/10'
            }`}
          />
          {payloadError && <p className="mt-1.5 text-xs text-red-600 animate-fade-in">{payloadError}</p>}
        </section>

        {/* Options */}
        <section className="lg:col-span-2 card p-5 animate-fade-up" style={{ animationDelay: '140ms' }}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-400 mb-4">Options</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1.5">Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1.5">Max attempts</label>
              <input
                type="number"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                placeholder="default"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-stone-500 mb-1.5">Delay (seconds)</label>
              <input
                type="number"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(e.target.value)}
                placeholder="run immediately"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-stone-500 mb-1.5">Idempotency key</label>
              <input
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                placeholder="optional"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-stone-500 mb-1.5">Unique key</label>
              <input
                value={uniqueKey}
                onChange={(e) => setUniqueKey(e.target.value)}
                placeholder="optional"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Actions */}
      <section
        className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-up"
        style={{ animationDelay: '210ms' }}
      >
        <button
          onClick={handleSubmit}
          disabled={enqueue.isPending}
          className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-all duration-200"
        >
          <Send size={14} />
          {enqueue.isPending ? 'Enqueueing…' : 'Enqueue job'}
        </button>
        <button
          onClick={() => {
            setSuccess(null);
            setSubmitError(null);
            seed.mutate();
          }}
          disabled={seed.isPending}
          className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50 transition-all duration-200"
        >
          <Sparkles size={14} />
          {seed.isPending ? 'Seeding…' : 'Seed 8 sample jobs'}
        </button>

        {success && (
          <div className="flex-1 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 animate-fade-in sm:justify-end">
            <CircleCheck size={15} className="shrink-0" />
            <span>
              {success.deduped ? 'Duplicate — deduped to job ' : 'Enqueued as '}
              <span className="font-mono text-xs">{success.id.slice(0, 8)}</span>
            </span>
            <Link
              to={`/jobs/${success.id}`}
              className="flex items-center gap-0.5 font-medium hover:text-emerald-900 transition-colors duration-200"
            >
              View <ArrowRight size={13} />
            </Link>
          </div>
        )}
        {submitError && (
          <div className="flex-1 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 animate-fade-in sm:justify-end">
            <TriangleAlert size={15} className="shrink-0" />
            <span className="truncate">{submitError}</span>
          </div>
        )}
        {seedResult && !success && !submitError && (
          <div className="flex-1 flex items-center gap-2 text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3.5 py-2.5 animate-fade-in sm:justify-end">
            <Sparkles size={14} className="shrink-0 text-amber-500" />
            <span>{seedResult}</span>
          </div>
        )}
      </section>
    </div>
  );
}
