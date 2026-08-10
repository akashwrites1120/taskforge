// Hand-written TypeScript types mirroring the Go backend response structs.
// See backend/internal/api/handlers.go for the source of truth.

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'retrying'
  | 'succeeded'
  | 'dead_letter';

export interface Job {
  ID: string;
  JobType: string;
  Payload: unknown;
  Status: JobStatus;
  IdempotencyKey: string | null;
  UniqueKey: string | null;
  Priority: number;
  RunAt: string;
  MaxAttempts: number;
  AttemptCount: number;
  LockedBy: string | null;
  LockedAt: string | null;
  VisibilityDeadline: string | null;
  Result: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  CompletedAt: string | null;
}

export interface JobAttempt {
  ID: string;
  JobID: string;
  AttemptNumber: number;
  Result: 'success' | 'error' | 'non_retryable' | 'reclaimed_by_reaper';
  ErrorMessage: string | null;
  StackTrace: string | null;
  DurationMs: number;
  CreatedAt: string;
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
