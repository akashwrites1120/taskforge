# Tech Stack

## 1. Overview

Single repo, two deployables: a Go backend (API + worker pool + reaper, can
run as one binary with subcommands or split into `server` / `worker`
processes) and a Vite/React frontend dashboard consuming the backend's REST
API.

## 2. Backend

| Concern | Choice | Why |
|---|---|---|
| Language | Go 1.22+ | Strong concurrency primitives, static binary, good fit for a worker pool |
| HTTP router | `chi` | Lightweight, idiomatic middleware chaining, no magic |
| DB driver | `pgx` (v5) + `pgxpool` | Fast, native Postgres driver with proper connection pooling |
| Queue storage | PostgreSQL 15+ | `FOR UPDATE SKIP LOCKED` gives correct, battle-tested queue semantics without a separate broker |
| Migrations | `golang-migrate` | Versioned, reversible, CLI + library use |
| Config | `env`-based struct (e.g. `caarlos0/env`) | 12-factor config, easy to override per environment |
| Logging | `log/slog` (stdlib) | Structured JSON logs, no extra dependency needed in modern Go |
| Metrics | `prometheus/client_golang` | Standard `/metrics` endpoint, works with any Prometheus/Grafana setup |
| Scheduling/backoff math | internal `internal/queue` package | Small enough to own directly rather than pull a framework |
| Testing | stdlib `testing` + `testify/assert` + `dockertest` (or `testcontainers-go`) | Real Postgres in integration tests, not mocks, for queue correctness |
| Process/graceful shutdown | stdlib `context` + `signal.NotifyContext` | Clean drain-on-SIGTERM without extra deps |

### Why Postgres instead of Redis/Kafka/RabbitMQ
The project's value is in demonstrating *correct* queue semantics
(durability, exactly-visible locking, dead-letter, crash recovery) using
primitives that are easy to audit and reason about. Postgres's
`SKIP LOCKED` gives transactional, durable dequeue for free, and keeping
job data relational makes the dashboard's filtering/history queries trivial
SQL instead of a second data store to reconcile. Redis/Kafka are called out
in the README as valid alternates for higher-throughput scale-out, with
notes on what would need to change.

## 3. Frontend

| Concern | Choice | Why |
|---|---|---|
| Build tool | Vite | Fast dev server/HMR, minimal config |
| Framework | React 18 + TypeScript | Type safety matches the discipline of the backend; catches API-shape drift at compile time |
| Data fetching / caching | TanStack Query | Built-in polling (`refetchInterval`), caching, and loading/error states — ideal for a live dashboard |
| Styling | Tailwind CSS | Fast to build a clean operator UI without a component library dependency |
| Charts | Recharts | Simple declarative charts for throughput/queue-depth graphs |
| Routing | React Router | Job list / job detail / dead-letter views as routes |
| HTTP client | native `fetch` wrapped in a small typed `apiClient` | Avoids axios dependency; typed responses generated/hand-written from the Go API contract |
| Forms (payload edit) | native controlled inputs + `zod` for validation | Lightweight JSON payload editing/validation before requeue |

## 4. Data Layer

- **PostgreSQL** — single source of truth for jobs, attempts, and the
  idempotency-key table.
- Core tables (see `flow.md` for lifecycle): `jobs`, `job_attempts`,
  `processed_idempotency_keys`.
- Indexes: `(status, run_at)` partial index for dequeue efficiency,
  `(job_type, status)` for dashboard filters, unique index on
  `idempotency_key` and `unique_key` where not null.

## 5. Infrastructure / Tooling

| Concern | Choice |
|---|---|
| Local dev orchestration | `docker-compose` (Postgres + backend + frontend) |
| Build automation | `Makefile` (`make migrate`, `make run-server`, `make run-worker`, `make test`, `make dev`) |
| CI | GitHub Actions: `go vet`, `go test ./...` (with a Postgres service container), `npm run build`, `npm run lint` |
| Containerization | Multi-stage `Dockerfile` per service; static Go binary in a `distroless` final stage |
| Metrics/observability stack (optional, documented) | Prometheus + Grafana docker-compose profile |

## 6. Repository Layout

```
/job-queue
  /backend
    /cmd/server          # HTTP API entrypoint
    /cmd/worker          # worker pool entrypoint
    /cmd/reaper          # reaper entrypoint (or --with-reaper flag on worker)
    /internal/queue      # enqueue/dequeue, backoff math, idempotency
    /internal/worker     # handler registry, execution loop, heartbeat
    /internal/reaper     # visibility-timeout scan/reclaim
    /internal/api        # HTTP handlers, request/response types
    /internal/store      # pgx queries, transactions
    go.mod
  /frontend
    /src
      /components        # QueueOverview, JobList, JobDetail, DeadLetterView
      /hooks              # useJobs, useJobDetail, useStats (TanStack Query)
    package.json
    vite.config.js
  /migrations             # golang-migrate SQL files
  README.md
  Makefile
```

## 7. Explicitly Deferred (documented as "future work" in README)

- Redis/Kafka-backed alternate queue backend behind the same interface.
- Multi-region / multi-Postgres sharding.
- Remote worker protocol (gRPC) for polyglot job handlers.
- Auth/RBAC on the dashboard beyond reverse-proxy basic auth.
