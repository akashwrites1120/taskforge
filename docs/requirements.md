# Requirements

## 1. Functional Requirements

### 1.1 Job Submission
- FR-1: API accepts job creation with `job_type`, `payload` (JSON), optional
  `idempotency_key`, optional `run_at` (schedule for the future), optional
  `max_attempts` override, optional `priority`.
- FR-2: If `idempotency_key` matches an existing non-expired job, the API
  returns the existing job instead of creating a duplicate (dedupe window
  configurable, default 24h).
- FR-3: Jobs are persisted durably before the API acknowledges success
  (write-then-ack, not ack-then-write).
- FR-4: Jobs support an optional `unique_key` for "only one job of this kind
  active at a time" semantics (e.g., "only one export per user running").

### 1.2 Dequeue / Locking
- FR-5: Workers dequeue using `SELECT ... FOR UPDATE SKIP LOCKED` so no two
  workers ever hold the same job simultaneously.
- FR-6: Dequeue respects `run_at <= now()`, status = `pending` or
  `retrying`, and orders by `priority DESC, run_at ASC`.
- FR-7: On dequeue, job status transitions to `processing`, records
  `locked_by` (worker ID) and `locked_at`, and sets a `visibility_deadline`
  = now + configurable timeout (default 30s, per-job-type override).
- FR-8: Long-running jobs can call a `heartbeat()` API to extend their
  `visibility_deadline` before it expires.

### 1.3 Execution & Idempotency
- FR-9: Job handlers are registered by `job_type` in a Go handler registry
  at process startup.
- FR-10: The system guarantees at-least-once delivery; handlers MUST be
  written idempotently. The framework provides an idempotency-key helper
  table (`processed_keys`) handlers can use for exactly-once side effects.
- FR-11: On success, job status → `succeeded`, `completed_at` recorded,
  result payload optionally stored.

### 1.4 Retry & Backoff
- FR-12: On handler error, job status → `retrying` (if attempts remaining)
  or `dead_letter` (if attempts exhausted).
- FR-13: Backoff delay = `base_delay * 2^attempt`, capped at
  `max_delay`, with ±jitter (default full jitter per AWS-style algorithm) to
  avoid thundering herd.
- FR-14: `max_attempts` is configurable globally, per job type, and
  per-job override at enqueue time. Default: 5.
- FR-15: Each attempt's error message, stack/context, timestamp, and
  duration is appended to an `attempts` history table — never overwritten.
- FR-16: Certain error types can be marked `non_retryable` by the handler
  (e.g., validation errors) to skip straight to dead-letter without burning
  the retry budget.

### 1.5 Dead-Letter Queue
- FR-17: Jobs that exhaust `max_attempts` move to `dead_letter` status and
  stop being picked up by workers.
- FR-18: Dead-lettered jobs retain full payload and attempt history.
- FR-19: Operators can requeue a dead-lettered job (resets status to
  `pending`, optionally resets attempt count, preserves history as
  "previous cycle").
- FR-20: Operators can edit the payload of a dead-lettered job before
  requeueing (e.g., fix a malformed field) — edit is recorded as an audit
  entry.
- FR-21: Operators can permanently discard a dead-lettered job.

### 1.6 Reaper (Crash Recovery)
- FR-22: A background reaper process periodically scans for jobs in
  `processing` status whose `visibility_deadline` has passed.
- FR-23: Expired jobs are returned to `pending`/`retrying` (consuming one
  attempt) so another worker can pick them up — this is what makes worker
  crashes safe.
- FR-24: Reaper actions are logged with job ID and prior worker ID for
  audit/debugging.
- FR-25: Reaper interval and visibility timeout are independently
  configurable; reaper runs on a leader-election or single-instance
  assumption documented clearly (out of scope: distributed reaper
  coordination beyond an advisory lock).

### 1.7 API
- FR-26: `POST /jobs` — enqueue a job.
- FR-27: `GET /jobs` — list/filter jobs by status, type, time range,
  paginated.
- FR-28: `GET /jobs/{id}` — job detail including full attempt history.
- FR-29: `POST /jobs/{id}/requeue` — requeue a dead-lettered job.
- FR-30: `POST /jobs/{id}/discard` — discard a dead-lettered job.
- FR-31: `GET /stats` — queue depth, in-flight count, throughput,
  success/failure rates, per job type.
- FR-32: `GET /healthz`, `GET /readyz` for liveness/readiness probes.
- FR-33: `GET /metrics` — Prometheus-format metrics endpoint.
- FR-39: `GET /` — service info banner (name, status, endpoint list) so
  browsers hitting the API root get a helpful response instead of a 404.

### 1.8 Dashboard
- FR-34: Live queue overview: counts by status, throughput chart, oldest
  pending job age (queue lag).
- FR-35: Job list view with filters (status, type, date range, search by
  ID/idempotency key) and pagination.
- FR-36: Job detail view showing payload, full attempt/error timeline, and
  current visibility deadline if in flight.
- FR-37: Dead-letter view with bulk-select requeue/discard actions.
- FR-38: Auto-refresh via polling (configurable interval, default 5s);
  manual refresh control.
- FR-40: Enqueue view with job-type presets that prefill editable sample
  payloads, an optional custom job type, and advanced options (priority,
  max attempts, delay, idempotency key, unique key).
- FR-41: One-click sample seeding that enqueues a realistic job mix
  (including jobs destined for the dead-letter queue) so the dashboard can
  be demonstrated without external tooling.

## 2. Non-Functional Requirements

- NFR-1: **Durability** — no acknowledged job is ever lost due to process
  crash; all state transitions are committed to Postgres inside
  transactions.
- NFR-2: **Correctness under crash** — a worker `SIGKILL`ed mid-job never
  results in the job being lost, and results in at most one concurrent
  processor at any moment (verified via chaos test).
- NFR-3: **Observability** — every state transition is logged (structured
  JSON logs) and reflected in Prometheus metrics: queue depth by status,
  job duration histograms, retry counts, dead-letter rate.
- NFR-4: **Backpressure** — per-job-type concurrency limits prevent one
  noisy job type from starving others.
- NFR-5: **Performance target** — sustain ≥ 500 jobs/sec enqueue and
  dequeue on a single mid-tier Postgres instance in local benchmarking.
- NFR-6: **Testability** — core retry/backoff/reaper logic covered by unit
  tests; end-to-end crash-recovery covered by an integration test that
  kills a worker process mid-job.
- NFR-7: **Config over code** — retry policy, timeouts, concurrency, and
  poll intervals are environment-configurable, not hardcoded.
- NFR-8: **Graceful shutdown** — `SIGTERM` drains in-flight jobs up to a
  configurable deadline before exiting, rather than dropping them
  mid-transaction.
- NFR-9: **Migrations** — schema changes are versioned and applied via
  `golang-migrate`, runnable via `make migrate`.
- NFR-10: **Single-binary deploy** — backend compiles to one Go binary;
  frontend builds to static assets servable by any static host or embedded
  via Go's `embed`.

## 3. Explicit Constraints / Assumptions

- Single Postgres instance is the source of truth (no distributed
  consensus layer in v1).
- Job handlers run in-process in Go; no remote/polyglot worker protocol in
  v1 (documented as a future extension).
- Dashboard assumes a trusted operator network; auth is out of scope for
  v1 beyond optional reverse-proxy basic auth.
