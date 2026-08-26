# TaskForge Dashboard

Operator dashboard for the TaskForge job queue — built with React 19,
TypeScript, Vite, Tailwind CSS v4, TanStack Query, Recharts, and
lucide-react icons.

## Views

| Route | View | Purpose |
|---|---|---|
| `/` | Queue Overview | Status counts, throughput chart, queue lag |
| `/enqueue` | Enqueue | Create jobs from presets or custom payloads; seed sample jobs |
| `/jobs` | Job List | Filterable, paginated table of all jobs |
| `/jobs/:id` | Job Detail | Payload, attempt timeline, requeue/discard actions |
| `/dead-letter` | Dead Letter | Dead-lettered jobs with bulk requeue/discard |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # Vitest + React Testing Library
npm run build      # type-check + production build
```

## Configuration

The API base URL is read at build time (Vite inlines it into the bundle):

```
VITE_API_BASE_URL=https://your-backend-host
```

- Unset in dev → defaults to `http://localhost:8080`
- In production (Vercel), set it as a **Config**-type environment variable
  and redeploy

Only `VITE_`-prefixed variables are exposed to the browser — never put
secrets in them.

## Structure

```
src/
├── apiClient.ts       # typed fetch wrapper for the backend API
├── types.ts           # hand-written types mirroring the Go response structs
├── components/        # views + reusable UI (EnqueueJob, JobList, JobDetail, …)
├── hooks/             # TanStack Query hooks (useStats, useJobs, mutations)
└── test/              # Vitest component tests
```

Live deployment: the backend runs on Render, this dashboard on Vercel —
see the root [README](../README.md#deployment) for details.
