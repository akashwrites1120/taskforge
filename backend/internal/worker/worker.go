package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"

	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/store"

	"github.com/jackc/pgx/v5"
)

type HandlerFunc func(ctx context.Context, payload json.RawMessage) error

type NonRetryableError struct {
	Err error
}

func (e *NonRetryableError) Error() string {
	return e.Err.Error()
}

func (e *NonRetryableError) Unwrap() error {
	return e.Err
}

// MarkNonRetryable wraps an error to indicate it should skip retries.
func MarkNonRetryable(err error) error {
	if err == nil {
		return nil
	}
	return &NonRetryableError{Err: err}
}

// IsNonRetryable checks if an error was marked non-retryable.
func IsNonRetryable(err error) bool {
	var target *NonRetryableError
	return errors.As(err, &target)
}

type contextKey string

const heartbeatCtxKey contextKey = "heartbeat"

// Heartbeat allows job handlers to signal progress and extend the visibility timeout.
func Heartbeat(ctx context.Context) error {
	hb, ok := ctx.Value(heartbeatCtxKey).(func() error)
	if !ok {
		return errors.New("heartbeat callback not present in context")
	}
	return hb()
}

// ClaimIdempotencyKey attempts to claim an idempotency key inside a transaction.
// Returns true if successfully claimed (first time), false if it was already processed.
func ClaimIdempotencyKey(ctx context.Context, tx pgx.Tx, key string) (bool, error) {
	query := `
		INSERT INTO processed_idempotency_keys (key) 
		VALUES ($1) 
		ON CONFLICT DO NOTHING 
		RETURNING key
	`
	var returnedKey string
	err := tx.QueryRow(ctx, query, key).Scan(&returnedKey)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return false, err
}

type WorkerPool struct {
	store             *store.Store
	queue             *queue.Queue
	workerID          string
	handlers          map[string]HandlerFunc
	concurrencyLimits map[string]int
	semaphores        map[string]chan struct{}
	semMutex          sync.Mutex
	stopChan          chan struct{}
	wg                sync.WaitGroup
	pollInterval      time.Duration
	defaultTimeout    time.Duration
	backoffPolicy     queue.BackoffPolicy
}

func NewWorkerPool(store *store.Store, q *queue.Queue, workerID string, pollInterval time.Duration) *WorkerPool {
	return &WorkerPool{
		store:             store,
		queue:             q,
		workerID:          workerID,
		handlers:          make(map[string]HandlerFunc),
		concurrencyLimits: make(map[string]int),
		semaphores:        make(map[string]chan struct{}),
		stopChan:          make(chan struct{}),
		pollInterval:      pollInterval,
		defaultTimeout:    30 * time.Second,
		backoffPolicy:     queue.DefaultBackoffPolicy,
	}
}

// Register registers a handler and concurrency limit for a job type.
func (wp *WorkerPool) Register(jobType string, limit int, handler HandlerFunc) {
	wp.semMutex.Lock()
	defer wp.semMutex.Unlock()

	if limit <= 0 {
		limit = 5
	}
	wp.handlers[jobType] = handler
	wp.concurrencyLimits[jobType] = limit
	wp.semaphores[jobType] = make(chan struct{}, limit)
}

// Start starts the worker polling loop.
func (wp *WorkerPool) Start(ctx context.Context) {
	slog.Info("Starting worker pool", "worker_id", wp.workerID)
	ticker := time.NewTicker(wp.pollInterval)
	defer ticker.Stop()

	// Initial poll immediately
	wp.pollAndExecute(ctx)

	for {
		select {
		case <-wp.stopChan:
			slog.Info("Worker pool polling stopped (shutting down)")
			return
		case <-ctx.Done():
			slog.Info("Worker pool context cancelled (shutting down)")
			return
		case <-ticker.C:
			wp.pollAndExecute(ctx)
		}
	}
}

// Stop signals the worker pool to stop polling and waits for all active jobs to drain.
func (wp *WorkerPool) Stop() {
	close(wp.stopChan)
	wp.wg.Wait()
	slog.Info("Worker pool gracefully stopped")
}

func (wp *WorkerPool) getSaturatedTypes() []string {
	wp.semMutex.Lock()
	defer wp.semMutex.Unlock()

	var saturated []string
	for jt, sem := range wp.semaphores {
		if len(sem) == cap(sem) {
			saturated = append(saturated, jt)
		}
	}
	return saturated
}

func (wp *WorkerPool) pollAndExecute(ctx context.Context) {
	excludeTypes := wp.getSaturatedTypes()

	batchSize := 0
	wp.semMutex.Lock()
	for _, sem := range wp.semaphores {
		batchSize += cap(sem) - len(sem)
	}
	wp.semMutex.Unlock()

	if batchSize <= 0 {
		return
	}

	if batchSize > 20 {
		batchSize = 20
	}

	jobs, err := wp.queue.Dequeue(ctx, wp.workerID, batchSize, wp.defaultTimeout, excludeTypes)
	if err != nil {
		slog.Error("Failed to dequeue jobs", "error", err)
		return
	}

	for _, job := range jobs {
		wp.wg.Add(1)
		go func(j *queue.Job) {
			defer wp.wg.Done()
			wp.executeJob(ctx, j)
		}(job)
	}
}

func (wp *WorkerPool) executeJob(ctx context.Context, j *queue.Job) {
	wp.semMutex.Lock()
	sem, exists := wp.semaphores[j.JobType]
	wp.semMutex.Unlock()

	if !exists {
		err := fmt.Errorf("no registered handler or semaphore for job type: %s", j.JobType)
		wp.markFailed(ctx, j, MarkNonRetryable(err), 0)
		return
	}

	// Acquire slot, respecting stop channel
	select {
	case sem <- struct{}{}:
		// acquired slot
	case <-wp.stopChan:
		wp.releaseJob(ctx, j)
		return
	}
	defer func() {
		<-sem
	}()

	startTime := time.Now()

	// Job-specific cancellation context
	jobCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Implement Heartbeat function
	heartbeatFunc := func() error {
		query := `
			UPDATE jobs 
			SET visibility_deadline = now() + $1 * INTERVAL '1 second',
			    updated_at = now()
			WHERE id = $2 AND locked_by = $3 AND status = 'processing'
		`
		res, err := wp.store.Pool.Exec(jobCtx, query, wp.defaultTimeout.Seconds(), j.ID, wp.workerID)
		if err != nil {
			return fmt.Errorf("db heartbeat error: %w", err)
		}
		if res.RowsAffected() == 0 {
			return errors.New("heartbeat failed: job reclaimed by reaper or locked by another worker")
		}
		return nil
	}

	jobCtx = context.WithValue(jobCtx, heartbeatCtxKey, heartbeatFunc)

	handler := wp.handlers[j.JobType]
	var handlerErr error

	// Run with panic recovery
	func() {
		defer func() {
			if r := recover(); r != nil {
				handlerErr = fmt.Errorf("panic in handler: %v\nstack: %s", r, string(debug.Stack()))
			}
		}()
		handlerErr = handler(jobCtx, j.Payload)
	}()

	durationMs := int(time.Since(startTime).Milliseconds())

	if handlerErr != nil {
		wp.markFailed(ctx, j, handlerErr, durationMs)
	} else {
		wp.markSucceeded(ctx, j, durationMs)
	}
}

func (wp *WorkerPool) releaseJob(ctx context.Context, j *queue.Job) {
	slog.Info("Releasing job back to queue due to shutdown", "job_id", j.ID)
	query := `
		UPDATE jobs
		SET status = 'pending',
		    locked_by = NULL,
		    locked_at = NULL,
		    visibility_deadline = NULL,
		    updated_at = now()
		WHERE id = $1 AND locked_by = $2 AND status = 'processing'
	`
	_, err := wp.store.Pool.Exec(ctx, query, j.ID, wp.workerID)
	if err != nil {
		slog.Error("Failed to release job on shutdown", "job_id", j.ID, "error", err)
	}
}

func (wp *WorkerPool) markSucceeded(ctx context.Context, j *queue.Job, durationMs int) {
	tx, err := wp.store.Pool.Begin(ctx)
	if err != nil {
		slog.Error("Failed to begin transaction for markSucceeded", "job_id", j.ID, "error", err)
		return
	}
	defer tx.Rollback(ctx)

	queryJob := `
		UPDATE jobs
		SET status = 'succeeded',
		    attempt_count = $3,
		    locked_by = NULL,
		    locked_at = NULL,
		    visibility_deadline = NULL,
		    completed_at = now(),
		    updated_at = now()
		WHERE id = $1 AND locked_by = $2 AND status = 'processing'
	`
	_, err = tx.Exec(ctx, queryJob, j.ID, wp.workerID, j.AttemptCount+1)
	if err != nil {
		slog.Error("Failed to mark job succeeded in db", "job_id", j.ID, "error", err)
		return
	}

	queryAttempt := `
		INSERT INTO job_attempts (job_id, attempt_number, result, duration_ms)
		VALUES ($1, $2, 'success', $3)
	`
	_, err = tx.Exec(ctx, queryAttempt, j.ID, j.AttemptCount+1, durationMs)
	if err != nil {
		slog.Error("Failed to insert job attempt for success", "job_id", j.ID, "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("Failed to commit markSucceeded transaction", "job_id", j.ID, "error", err)
	}
}

func (wp *WorkerPool) markFailed(ctx context.Context, j *queue.Job, handlerErr error, durationMs int) {
	tx, err := wp.store.Pool.Begin(ctx)
	if err != nil {
		slog.Error("Failed to begin transaction for markFailed", "job_id", j.ID, "error", err)
		return
	}
	defer tx.Rollback(ctx)

	isNonRetryable := IsNonRetryable(handlerErr)
	nextAttempt := j.AttemptCount + 1
	exhausted := nextAttempt >= j.MaxAttempts

	var newStatus queue.JobStatus
	var resultStr string
	var runAt time.Time

	if isNonRetryable {
		newStatus = queue.StatusDeadLetter
		resultStr = "non_retryable"
	} else if exhausted {
		newStatus = queue.StatusDeadLetter
		resultStr = "error"
	} else {
		newStatus = queue.StatusRetrying
		resultStr = "error"
		delay := wp.backoffPolicy.CalculateBackoff(nextAttempt)
		runAt = time.Now().Add(delay)
	}

	errMsg := handlerErr.Error()

	var queryJob string
	var args []any
	if newStatus == queue.StatusDeadLetter {
		queryJob = `
			UPDATE jobs
			SET status = $1,
			    attempt_count = $2,
			    locked_by = NULL,
			    locked_at = NULL,
			    visibility_deadline = NULL,
			    completed_at = now(),
			    updated_at = now()
			WHERE id = $3 AND locked_by = $4 AND status = 'processing'
		`
		args = []any{string(newStatus), nextAttempt, j.ID, wp.workerID}
	} else {
		queryJob = `
			UPDATE jobs
			SET status = $1,
			    attempt_count = $2,
			    run_at = $3,
			    locked_by = NULL,
			    locked_at = NULL,
			    visibility_deadline = NULL,
			    updated_at = now()
			WHERE id = $4 AND locked_by = $5 AND status = 'processing'
		`
		args = []any{string(newStatus), nextAttempt, runAt, j.ID, wp.workerID}
	}

	_, err = tx.Exec(ctx, queryJob, args...)
	if err != nil {
		slog.Error("Failed to mark job failed in db", "job_id", j.ID, "error", err)
		return
	}

	queryAttempt := `
		INSERT INTO job_attempts (job_id, attempt_number, result, error_message, duration_ms)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err = tx.Exec(ctx, queryAttempt, j.ID, nextAttempt, resultStr, errMsg, durationMs)
	if err != nil {
		slog.Error("Failed to insert job attempt for failure", "job_id", j.ID, "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("Failed to commit markFailed transaction", "job_id", j.ID, "error", err)
	}
}
