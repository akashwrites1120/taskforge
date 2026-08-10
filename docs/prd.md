# PRD — Reliable Job Queue with Dead-Letter Recovery

## 1. Summary

A self-hosted, Postgres-backed background job queue written in Go, with a React
dashboard for observing job state, retry history, and dead-letter recovery.
The project exists to demonstrate production-grade distributed-systems
fundamentals: at-least-once delivery, idempotent processing, exponential
backoff with jitter, visibility timeouts, poison-message quarantine, and
operator-driven recovery — the "boring but critical" infrastructure every
real backend depends on.

## 2. Problem Statement

Most side projects show off an algorithm or a UI. Very few show that the
author can be trusted to run something in production at 3am. Job queues are
where a huge share of real backend incidents originate: jobs that retry
forever and hammer a downstream API, jobs that silently vanish, jobs that
run twice because a worker crashed mid-processing, and jobs nobody notices
are stuck until a customer complains. This project builds a queue that is
explicit and observable about all of these failure modes instead of hiding
them.

## 3. Goals

- Durable job storage that survives process restarts and crashes.
- At-least-once execution semantics with idempotency support so "at-least
  once" doesn't become "corrupts data twice."
- Configurable retry policy with exponential backoff + jitter per job type.
- Automatic dead-letter quarantine after max attempts, with full failure
  history preserved.
- A reaper process that reclaims jobs whose worker died mid-processing
  (visibility-timeout expiry) without manual intervention.
- An operator dashboard to inspect queue depth, in-flight jobs, retry
  timelines, and dead-lettered jobs, and to manually requeue / discard /
  edit-and-retry dead-lettered jobs.
- Metrics and structured logs sufficient to answer "why did this job fail"
  without reading source code.

## 4. Non-Goals

- Not building a general-purpose message broker (no pub/sub fan-out, no
  topic partitioning, no cross-datacenter replication).
- Not optimizing for extreme throughput (millions of jobs/sec). Target is
  correctness and operability at moderate scale (thousands/min).
- Not implementing multi-tenant auth/RBAC — single-operator dashboard,
  optionally behind a basic auth/reverse proxy.
- Not building a plugin/scripting system for arbitrary user-submitted job
  code; job handlers are registered in the Go binary at compile time.
- Not implementing distributed queue sharding across multiple Postgres
  instances in v1.

## 5. Target User

Primarily a portfolio/reference implementation for backend engineers and
hiring reviewers evaluating whether the author understands production
queueing systems. Secondarily, usable as a lightweight real job queue for
small services that don't want to run Redis/Kafka just to process emails,
webhooks, or report generation.

## 6. Core User Stories

1. As a service, I can enqueue a job with a type, payload, and idempotency
   key, and get an ack that it will eventually run at least once.
2. As a worker, I can safely pull jobs without two workers processing the
   same job concurrently.
3. As a job, if I fail transiently (network blip), I am retried later with
   backoff, not immediately hammered.
4. As a job, if I fail repeatedly past my retry budget, I stop retrying and
   land in the dead-letter queue instead of retrying forever.
5. As an operator, if a worker crashes while holding a job, that job is
   automatically reclaimed after a timeout rather than stuck "in progress"
   forever.
6. As an operator, I can see a live dashboard of queue depth, in-flight,
   succeeded, failed, and dead-lettered jobs, drill into a single job's full
   attempt history, and requeue or discard dead-lettered jobs.
7. As an operator, I can filter/search jobs by type, status, and time range.

## 7. Success Metrics (for this project as a demonstration)

- Zero duplicate side effects under induced worker crashes (verified with a
  chaos test that SIGKILLs workers mid-job).
- Dead-letter jobs never silently disappear — every terminal failure is
  inspectable with full attempt/error history.
- p99 time from "job ready to retry" to "job picked up" stays within a
  configurable poll interval under load testing.
- README makes the failure-recovery story legible in under 3 minutes of
  reading for a reviewer.

## 8. Key Risks

| Risk | Mitigation |
|---|---|
| Postgres becomes the bottleneck under high enqueue rate | `SELECT ... FOR UPDATE SKIP LOCKED`, proper indexes, batched dequeue |
| Retry storms overwhelm downstream dependencies | Exponential backoff + jitter, per-job-type concurrency limits |
| Jobs processed twice despite locking | Idempotency keys + at-least-once contract documented explicitly to job authors |
| Reaper reclaims a job that's actually still running (slow, not dead) | Configurable visibility timeout per job type + heartbeat extension for long jobs |
| Dashboard queries slow down the live queue | Read replica pattern optional; paginated/indexed queries; polling not per-row streaming |

## 9. Milestones

See `status.md` for the live phase-by-phase checklist.
