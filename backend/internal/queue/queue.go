package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"taskforge/backend/internal/store"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrUniqueKeyViolation   = errors.New("a job with this unique key is already active")
	ErrIdempotencyViolation = errors.New("a job with this idempotency key already exists")
)

type EnqueueParams struct {
	JobType        string
	Payload        json.RawMessage
	IdempotencyKey *string
	UniqueKey      *string
	Priority       int
	RunAt          *time.Time
	MaxAttempts    *int
}

type Queue struct {
	store        *store.Store
	dedupeWindow time.Duration
}

func NewQueue(store *store.Store, dedupeWindow time.Duration) *Queue {
	return &Queue{
		store:        store,
		dedupeWindow: dedupeWindow,
	}
}

// Enqueue enqueues a new job, enforcing idempotency and unique key constraints.
func (q *Queue) Enqueue(ctx context.Context, params EnqueueParams) (*Job, bool, error) {
	if params.JobType == "" {
		return nil, false, errors.New("job_type cannot be empty")
	}
	if len(params.Payload) == 0 {
		params.Payload = json.RawMessage("{}")
	}

	runAt := time.Now()
	if params.RunAt != nil {
		runAt = *params.RunAt
	}

	maxAttempts := 5
	if params.MaxAttempts != nil {
		maxAttempts = *params.MaxAttempts
	}

	tx, err := q.store.Pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Idempotency Check
	if params.IdempotencyKey != nil && *params.IdempotencyKey != "" {
		cutoff := time.Now().Add(-q.dedupeWindow)
		query := `
			SELECT id, job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, 
			       attempt_count, locked_by, locked_at, visibility_deadline, result, created_at, updated_at, completed_at
			FROM jobs
			WHERE idempotency_key = $1 AND created_at > $2
			LIMIT 1
		`
		var job Job
		err := tx.QueryRow(ctx, query, *params.IdempotencyKey, cutoff).Scan(
			&job.ID, &job.JobType, &job.Payload, &job.Status, &job.IdempotencyKey, &job.UniqueKey, &job.Priority, &job.RunAt, &job.MaxAttempts,
			&job.AttemptCount, &job.LockedBy, &job.LockedAt, &job.VisibilityDeadline, &job.Result, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
		)
		if err == nil {
			// Found existing non-expired job, return it (deduped = true)
			tx.Commit(ctx)
			return &job, true, nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, false, fmt.Errorf("failed to query idempotency key: %w", err)
		}
	}

	// 2. Insert new job
	insertQuery := `
		INSERT INTO jobs (
			job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, attempt_count
		) VALUES (
			$1, $2, 'pending', $3, $4, $5, $6, $7, 0
		) RETURNING id, job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, 
		          attempt_count, locked_by, locked_at, visibility_deadline, result, created_at, updated_at, completed_at
	`
	var job Job
	err = tx.QueryRow(ctx, insertQuery,
		params.JobType,
		params.Payload,
		params.IdempotencyKey,
		params.UniqueKey,
		params.Priority,
		runAt,
		maxAttempts,
	).Scan(
		&job.ID, &job.JobType, &job.Payload, &job.Status, &job.IdempotencyKey, &job.UniqueKey, &job.Priority, &job.RunAt, &job.MaxAttempts,
		&job.AttemptCount, &job.LockedBy, &job.LockedAt, &job.VisibilityDeadline, &job.Result, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" { // unique_violation
				if pgErr.ConstraintName == "idx_jobs_unique_key_active" {
					return nil, false, ErrUniqueKeyViolation
				}
				if pgErr.ConstraintName == "idx_jobs_idempotency_key" {
					return nil, false, ErrIdempotencyViolation
				}
			}
		}
		return nil, false, fmt.Errorf("failed to insert job: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &job, false, nil
}

// Dequeue locks and claims a batch of ready jobs for a worker.
func (q *Queue) Dequeue(ctx context.Context, workerID string, batchSize int, visibilityTimeout time.Duration) ([]*Job, error) {
	if batchSize <= 0 {
		return nil, nil
	}

	// Single atomic query: select ready jobs for update, skipping locked rows, and update their status/lock fields
	query := `
		WITH selected_jobs AS (
			SELECT id 
			FROM jobs 
			WHERE status IN ('pending', 'retrying') 
			  AND run_at <= now() 
			ORDER BY priority DESC, run_at ASC 
			LIMIT $1 
			FOR UPDATE SKIP LOCKED
		)
		UPDATE jobs 
		SET status = 'processing', 
		    locked_by = $2, 
		    locked_at = now(), 
		    visibility_deadline = now() + $3 * INTERVAL '1 second', 
		    updated_at = now()
		WHERE id IN (SELECT id FROM selected_jobs)
		RETURNING id, job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, 
		          attempt_count, locked_by, locked_at, visibility_deadline, result, created_at, updated_at, completed_at
	`

	// Convert duration to seconds as integer/float for PG interval compatibility
	timeoutSeconds := visibilityTimeout.Seconds()

	rows, err := q.store.Pool.Query(ctx, query, batchSize, workerID, timeoutSeconds)
	if err != nil {
		return nil, fmt.Errorf("dequeue query failed: %w", err)
	}
	defer rows.Close()

	var jobs []*Job
	for rows.Next() {
		var job Job
		err := rows.Scan(
			&job.ID, &job.JobType, &job.Payload, &job.Status, &job.IdempotencyKey, &job.UniqueKey, &job.Priority, &job.RunAt, &job.MaxAttempts,
			&job.AttemptCount, &job.LockedBy, &job.LockedAt, &job.VisibilityDeadline, &job.Result, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan dequeued job: %w", err)
		}
		jobs = append(jobs, &job)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error during dequeue: %w", err)
	}

	return jobs, nil
}
