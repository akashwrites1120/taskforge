# TaskForge: Reliable Job Queue with Dead-Letter Recovery

A self-hosted, Postgres-backed background job queue written in Go, with a React dashboard for observing job state, retry history, and dead-letter recovery.

## Overview

TaskForge demonstrates production-grade distributed systems fundamentals:
- At-least-once delivery with idempotency support
- Exponential backoff with jitter per job type
- Visibility timeouts and automatic dead-letter quarantine
- Reaper process for worker crash recovery
- Operator dashboard for monitoring and intervention

## Architecture

```mermaid
graph TD
    subgraph Backend[Go Backend]
        API[HTTP API Server] -->|Enqueue/Get Jobs| Store[(PostgreSQL)]
        API --> Stats[Prometheus Metrics]
        Worker[Worker Pool] -->|Dequeue/Execute| Store
        Reaper[Reaper] -->|Visibility Timeout Scan| Store
        Store -->|Durable Storage| Jobs[jobs table]
        Store -->|Attempt History| Attempts[job_attempts table]
        Store -->|Idempotency Keys| Idempotency[processed_idempotency_keys]
    end

    subgraph Frontend[React Dashboard]
        Overview[Queue Overview] -->|Polls| API
        List[Job List] -->|Polls| API
        Detail[Job Detail] -->|Polls| API
        DeadLetter[Dead Letter View] -->|Polls| API
    end

    style Backend fill:#f9f,stroke:#333,stroke-width:2px
    style Frontend fill:#bbf,stroke:#333,stroke-width:2px
    style Store fill:#cfc,stroke:#333,stroke-width:2px
```

## Features

- **Durable Storage**: All job state persisted in PostgreSQL with transactional guarantees
- **At-Least-Once Delivery**: Jobs are retried with exponential backoff + jitter
- **Idempotency**: Optional idempotency keys prevent duplicate processing
- **Visibility Timeouts**: Automatic reclamation of jobs from crashed workers
- **Dead-Letter Queue**: Jobs exceeding max attempts are quarantined with full history
- **Operator Dashboard**: Real-time monitoring, filtering, and manual intervention
- **Metrics**: Prometheus endpoint for queue depth, throughput, and latency
- **Graceful Shutdown**: SIGTERM drains in-flight jobs before exit

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Go 1.25+ (for local backend development)
- Node.js 20+ (for local frontend development)

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd taskforge

# Start all services (PostgreSQL, backend API, worker, reaper, frontend)
docker-compose up -d --build

# Services will be available at:
# - Backend API: http://localhost:8080
# - Frontend Dashboard: http://localhost:5173
# - PostgreSQL: localhost:5432 (user: postgres, password: postgres, db: taskforge)
```

### Local Development

#### Backend
```bash
cd backend
# Install dependencies
go mod download
# Run migrations (uses DATABASE_URL from .env.local if present)
make migrate-up
# Run the all-in-one dev mode (API + worker + reaper)
go run ./cmd/taskforge start
```

### Cloud Postgres (Neon) — no Docker needed

The app runs against any Postgres. To use a free [Neon](https://neon.tech)
database instead of the docker-compose one:

1. Create a project at neon.tech and copy the connection string
2. Put it in `.env.local` at the repo root (gitignored):
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Apply migrations: `make migrate-up`
4. Run the backend: `go run ./cmd/taskforge start`

`.env.local` is loaded automatically (real environment variables always win),
which is also how production deployment works on Render/Vercel.

> Note: DB-backed integration tests truncate tables between subtests — point
> `TEST_DATABASE_URL` at a disposable database, never at your real data.

#### Frontend
```bash
cd frontend
# Install dependencies
npm install
# Start dev server
npm run dev
# Visit http://localhost:5173
```

### Environment Configuration

Configure the backend via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/taskforge?sslmode=disable` |
| `PORT` | HTTP server port | `8080` |
| `WORKER_CONCURRENCY` | Number of concurrent workers | `10` |
| `POLL_INTERVAL` | Worker polling interval | `5s` |
| `REAPER_INTERVAL` | Reaper scan interval | `15s` |
| `DEDUPE_WINDOW` | Idempotency key dedupe window | `24h` |

Frontend configuration:
- `VITE_API_BASE_URL`: Base URL for API requests (defaults to `http://localhost:8080` in dev)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/jobs` | Enqueue a new job |
| `GET` | `/jobs` | List/filter jobs (pagination) |
| `GET` | `/jobs/{id}` | Get job details + attempt history |
| `POST` | `/jobs/{id}/requeue` | Requeue a dead-letter job |
| `POST` | `/jobs/{id}/discard` | Permanently delete a dead-letter job |
| `GET` | `/stats` | Queue statistics for dashboard |
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe (DB connectivity) |
| `GET` | `/metrics` | Prometheus metrics |

## Running Tests

```bash
# Backend tests
cd backend
go test -v ./...

# Frontend tests
cd frontend
npm run test

# All tests via Makefile
make test
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start backend + frontend dev servers |
| `make build` | Build backend binary and frontend assets |
| `make test` | Run all tests |
| `make lint` | Run linters |
| `make docker-up` | Start all services via Docker Compose |
| `make docker-down` | Stop Docker Compose services |
| `make migrate-up` | Apply database migrations |
| `make migrate-down` | Rollback last migration |

## Monitoring

TaskForge exposes Prometheus metrics at `/metrics`. A basic Prometheus configuration is provided in `prometheus.yml` for optional monitoring with Grafana.

## Project Structure

```
taskforge/
├── backend/                  # Go backend
│   ├── cmd/                  # Application entrypoints
│   │   ├── server/           # HTTP API server
│   │   ├── worker/           # Worker pool
│   │   ├── reaper/           # Reaper daemon
│   │   └── taskforge/        # All-in-one main
│   ├── internal/             # Private Go packages
│   │   ├── api/              # HTTP handlers
│   │   ├── config/           # Environment configuration
│   │   ├── queue/            # Enqueue/dequeue logic
│   │   ├── reaper/           # Visibility timeout scanning
│   │   ├── store/            # PostgreSQL data access
│   │   └── worker/           # Job execution loop
│   ├── go.mod                # Go dependencies
│   └── Dockerfile            # Multi-stage build
├── frontend/                 # React dashboard
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # TanStack Query data fetching
│   │   └── test/             # Component tests
│   ├── package.json          # NPM dependencies
│   ├── vite.config.ts        # Vite + Vitest configuration
│   └── Dockerfile            # Multi-stage build
├── migrations/               # Golang-migrate SQL files
├── docker-compose.yml        # Local development stack
├── prometheus.yml            # Optional Prometheus config
├── Makefile                  # Development commands
�└── README.md                 # This file
```

## License

MIT

## Acknowledgments

Inspired by battle-tested queue systems and designed to demonstrate production-ready patterns for backend engineering portfolios.