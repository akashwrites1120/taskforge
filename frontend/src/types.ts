// Hand-written TypeScript types mirroring the Go backend response structs.
// See backend/internal/api/types.go for the source of truth (snake_case JSON).

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'retrying'
  | 'succeeded'
  | 'dead_letter';

export interface Job {
  id: string;
  job_type: string;
  payload: unknown;
  status: JobStatus;
  idempotency_key?: string | null;
  unique_key?: string | null;
  priority: number;
  run_at: string;
  max_attempts: number;
  attempt_count: number;
  locked_by?: string | null;
  locked_at?: string | null;
  visibility_deadline?: string | null;
  result?: unknown;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface JobAttempt {
  id: number;
  job_id: string;
  attempt_number: number;
  result: 'success' | 'error' | 'non_retryable' | 'reclaimed_by_reaper';
  error_message?: string | null;
  stack_trace?: string | null;
  duration_ms: number;
  created_at: string;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobDetailResponse {
  job: Job;
  attempts: JobAttempt[];
}

export interface StatsResponse {
  status_counts: Record<JobStatus, number>;
  throughput_succeeded: number;
  throughput_failed: number;
  oldest_pending_age_seconds: number;
}

export interface EnqueueResponse {
  id: string;
  deduped?: boolean;
}
