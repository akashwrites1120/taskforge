package queue

import (
	"encoding/json"
	"time"
)

type JobStatus string

const (
	StatusPending    JobStatus = "pending"
	StatusProcessing JobStatus = "processing"
	StatusRetrying   JobStatus = "retrying"
	StatusSucceeded  JobStatus = "succeeded"
	StatusDeadLetter JobStatus = "dead_letter"
)

type Job struct {
	ID                 string          `json:"id"`
	JobType            string          `json:"job_type"`
	Payload            json.RawMessage `json:"payload"`
	Status             JobStatus       `json:"status"`
	IdempotencyKey     *string         `json:"idempotency_key,omitempty"`
	UniqueKey          *string         `json:"unique_key,omitempty"`
	Priority           int             `json:"priority"`
	RunAt              time.Time       `json:"run_at"`
	MaxAttempts        int             `json:"max_attempts"`
	AttemptCount       int             `json:"attempt_count"`
	LockedBy           *string         `json:"locked_by,omitempty"`
	LockedAt           *time.Time      `json:"locked_at,omitempty"`
	VisibilityDeadline *time.Time      `json:"visibility_deadline,omitempty"`
	Result             json.RawMessage `json:"result,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
	CompletedAt        *time.Time      `json:"completed_at,omitempty"`
}

type JobAttempt struct {
	ID            int64     `json:"id"`
	JobID         string    `json:"job_id"`
	AttemptNumber int       `json:"attempt_number"`
	Result        string    `json:"result"` // "success", "error", "non_retryable", "reclaimed_by_reaper"
	ErrorMessage  *string   `json:"error_message,omitempty"`
	StackTrace    *string   `json:"stack_trace,omitempty"`
	DurationMs    int       `json:"duration_ms"`
	CreatedAt     time.Time `json:"created_at"`
}
