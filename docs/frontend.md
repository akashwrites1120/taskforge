# Frontend Spec — Operator Dashboard

## 1. Purpose

A single-page operator dashboard for observing and intervening in the job
queue: live counts, throughput, per-job drill-down with full retry history,
and dead-letter recovery actions. Built for clarity under incident
pressure — an operator debugging a stuck job at 3am should find what they
need in two clicks.

## 2. Routes

| Route | View | Purpose |
|---|---|---|
| `/` | Queue Overview | Status counts, throughput chart, queue lag, per-job-type breakdown |
| `/jobs` | Job List | Filterable/paginated table of all jobs |
| `/jobs/:id` | Job Detail | Payload, full attempt timeline, current lock state, actions |
| `/dead-letter` | Dead-Letter View | Focused list of `dead_letter` jobs with bulk actions |

## 3. Components

```
/src/components
  QueueOverview.tsx       # top-level dashboard: StatusCards + ThroughputChart
  StatusCards.tsx         # pending/processing/retrying/succeeded/dead_letter counts
  ThroughputChart.tsx     # Recharts line chart, jobs/min succeeded vs failed
  QueueLagBadge.tsx       # "oldest pending job age" indicator, color-coded by threshold
  JobList.tsx             # table: id, type, status, attempts, run_at, updated_at
  JobFilters.tsx          # status/type/date-range/search controls, synced to URL query params
  JobDetail.tsx           # payload viewer, AttemptTimeline, action buttons
  AttemptTimeline.tsx     # vertical timeline of attempts with error messages/durations
  PayloadEditor.tsx       # JSON editor w/ zod validation, used before requeue
  DeadLetterTable.tsx     # dead-letter-specific table with checkbox bulk-select
  BulkActionBar.tsx       # "Requeue selected" / "Discard selected" with confirm modal
  ConfirmModal.tsx        # generic confirm dialog for destructive actions
  StatusPill.tsx          # colored status badge, reused everywhere
  Pagination.tsx          # shared table pagination control
```

## 4. Hooks (TanStack Query)

```
/src/hooks
  useStats.ts        # GET /stats, refetchInterval: 5000
  useJobs.ts         # GET /jobs?filters, refetchInterval: 5000, keeps prior data while refetching
  useJobDetail.ts     # GET /jobs/:id, refetchInterval: 3000 while status is processing/retrying, off once terminal
  useRequeueJob.ts    # POST /jobs/:id/requeue mutation, invalidates useJobs + useJobDetail on success
  useDiscardJob.ts    # POST /jobs/:id/discard mutation, invalidates on success
  useBulkAction.ts    # fires N mutations for bulk requeue/discard with progress state
```

Design choice: polling via `refetchInterval` rather than WebSockets/SSE for
v1 — the queue's own state already lives in Postgres and changes on the
order of seconds, so polling is simpler to reason about and debug than a
push channel, and it's what most real internal dashboards actually use.
Noted in README as a swap-in point (SSE endpoint) if sub-second updates
are ever needed.

## 5. Queue Overview — Behavior

- Status cards for `pending`, `processing`, `retrying`, `succeeded`,
  `dead_letter`, each showing count and a small sparkline of the last hour.
- `dead_letter` card is visually distinct (red-toned) and links directly to
  `/dead-letter`.
- Queue lag badge: age of the oldest `pending`/`retrying` job past due;
  green under a configurable threshold, amber, red if breached — this is
  the single most important "is the queue healthy" signal.
- Throughput chart: stacked area of succeeded vs failed jobs per minute
  over the last hour, from `/stats`.
- Per-job-type table: count by status per `job_type`, so an operator can
  spot "the email job type is the one stuck" instead of only a global
  number.

## 6. Job List — Behavior

- Server-side pagination (cursor or offset, matches API) — never fetch
  the whole table client-side.
- Filters: status (multi-select), job_type (multi-select), date range,
  free-text search (matches job ID or idempotency key). Filters serialize
  to the URL so a filtered view is shareable/bookmarkable.
- Row click → navigates to `/jobs/:id`.
- Attempts column shows `current/max` (e.g., `2/5`) as a quick health
  signal without opening detail.

## 7. Job Detail — Behavior

- Header: status pill, job type, created/updated timestamps, current
  `locked_by`/`visibility_deadline` if in flight.
- Payload panel: read-only JSON viewer normally; becomes an editable
  `PayloadEditor` only when the job is `dead_letter` and the operator
  clicks "Edit & Requeue."
- Attempt timeline: chronological list, each entry shows attempt number,
  timestamp, duration, result (`success` / `error` / `non_retryable` /
  `reclaimed_by_reaper`), and full error message. `reclaimed_by_reaper`
  entries are visually flagged so a pattern of worker crashes is
  immediately obvious.
- Actions (contextual to status):
  - `dead_letter` → "Requeue" (with optional payload edit), "Discard"
    (behind `ConfirmModal`).
  - `retrying` → "Requeue now" (skip remaining backoff), read-only
    otherwise.
  - `processing` → read-only; shows live countdown to
    `visibility_deadline`.

## 8. Dead-Letter View — Behavior

- Dedicated table, default-sorted by most recently dead-lettered.
- Checkbox column + "select all on page."
- `BulkActionBar` appears once ≥1 row selected: "Requeue N jobs" /
  "Discard N jobs," both behind `ConfirmModal` with a summary of affected
  job types.
- Each row shows a truncated last-error message inline so a pattern (e.g.,
  "all failing with the same downstream 500") is visible without opening
  every job.

## 9. Visual / UX Principles

- Status color convention is consistent everywhere: gray `pending`, blue
  `processing`, amber `retrying`, green `succeeded`, red `dead_letter`.
- Destructive actions (discard, bulk discard) always require explicit
  confirmation and show a count of affected jobs.
- Empty states are informative, not blank ("No dead-lettered jobs — queue
  is healthy" rather than an empty table).
- Numbers over decoration: this is an operator tool, not a marketing page —
  density and scanability win over whitespace.

## 10. API Contract Assumptions

Frontend types are hand-written/generated from the Go API's response
structs to keep the two in sync; a mismatch should fail at build time via
TypeScript rather than at runtime in the browser. See `backend/internal/api`
for the source of truth and `requirements.md` §1.7 for the endpoint list.

## 11. Testing

- Component tests (Vitest + React Testing Library) for `StatusPill`,
  `JobFilters` URL-sync logic, `AttemptTimeline` rendering, and
  `PayloadEditor` validation.
- A mocked API layer (MSW) for hook tests (`useJobs`, `useRequeueJob`)
  so tests don't require a live backend.
