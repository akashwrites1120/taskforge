package reaper

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/store"
	"taskforge/backend/internal/worker"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReaperDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/taskforge_test?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s, err := store.NewStore(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping integration test; failed to connect to DB at %s: %v", dbURL, err)
	}
	defer s.Close()

	// Setup clean database schema
	setupTestSchema(t, ctx, s)

	q := queue.NewQueue(s, 24*time.Hour)
	r := NewReaper(s, 100*time.Millisecond)

	// resetTables wipes all queue state so subtests are isolated from each other.
	resetTables := func() {
		t.Helper()
		_, err := s.Pool.Exec(ctx, "DELETE FROM job_attempts")
		require.NoError(t, err)
		_, err = s.Pool.Exec(ctx, "DELETE FROM jobs")
		require.NoError(t, err)
	}

	t.Run("Reclaim expired job to retrying status", func(t *testing.T) {
		resetTables()

		// Enqueue job
		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType:     "send_alert",
			Payload:     []byte(`{}`),
			MaxAttempts: ptr(3),
		})
		require.NoError(t, err)

		// Dequeue to lock it (worker-1)
		jobs, err := q.Dequeue(ctx, "worker-1", 1, 10*time.Second, nil)
		require.NoError(t, err)
		require.Len(t, jobs, 1)

		// Manually expire the visibility deadline in the DB to 5 minutes ago
		_, err = s.Pool.Exec(ctx, "UPDATE jobs SET visibility_deadline = now() - INTERVAL '5 minutes' WHERE id = $1", job.ID)
		require.NoError(t, err)

		// Run reap cycle
		r.reap(ctx)

		// Verify job has been reclaimed and status updated to retrying
		var dbStatus string
		var attemptCount int
		var lockedBy *string
		err = s.Pool.QueryRow(ctx, "SELECT status, attempt_count, locked_by FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus, &attemptCount, &lockedBy)
		require.NoError(t, err)

		assert.Equal(t, "retrying", dbStatus)
		assert.Equal(t, 1, attemptCount)
		assert.Nil(t, lockedBy)

		// Verify attempts table contains a 'reclaimed_by_reaper' log
		var result, errMsg string
		err = s.Pool.QueryRow(ctx, "SELECT result, error_message FROM job_attempts WHERE job_id = $1", job.ID).Scan(&result, &errMsg)
		require.NoError(t, err)
		assert.Equal(t, "reclaimed_by_reaper", result)
		assert.Contains(t, errMsg, "visibility deadline expired")
	})

	t.Run("Reclaim expired job to dead_letter status if attempts exhausted", func(t *testing.T) {
		resetTables()

		// Enqueue job with max_attempts = 1
		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType:     "alert_exhaust",
			Payload:     []byte(`{}`),
			MaxAttempts: ptr(1),
		})
		require.NoError(t, err)

		// Dequeue
		jobs, err := q.Dequeue(ctx, "worker-2", 1, 10*time.Second, nil)
		require.NoError(t, err)
		require.Len(t, jobs, 1)

		// Manually expire visibility deadline
		_, err = s.Pool.Exec(ctx, "UPDATE jobs SET visibility_deadline = now() - INTERVAL '5 minutes' WHERE id = $1", job.ID)
		require.NoError(t, err)

		// Run reap cycle
		r.reap(ctx)

		// Verify job is now dead_lettered
		var dbStatus string
		var attemptCount int
		var completedAt *time.Time
		err = s.Pool.QueryRow(ctx, "SELECT status, attempt_count, completed_at FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus, &attemptCount, &completedAt)
		require.NoError(t, err)

		assert.Equal(t, "dead_letter", dbStatus)
		assert.Equal(t, 1, attemptCount)
		assert.NotNil(t, completedAt)
	})

	t.Run("Advisory lock blocks concurrent reaping", func(t *testing.T) {
		resetTables()

		// Enqueue job
		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType:     "concurrency_check",
			Payload:     []byte(`{}`),
			MaxAttempts: ptr(3),
		})
		require.NoError(t, err)

		// Dequeue
		jobs, err := q.Dequeue(ctx, "worker-3", 1, 10*time.Second, nil)
		require.NoError(t, err)
		require.Len(t, jobs, 1)

		// Manually expire visibility deadline
		_, err = s.Pool.Exec(ctx, "UPDATE jobs SET visibility_deadline = now() - INTERVAL '5 minutes' WHERE id = $1", job.ID)
		require.NoError(t, err)

		// Start a transaction on a separate connection and manually acquire the advisory lock
		lockTx, err := s.Pool.Begin(ctx)
		require.NoError(t, err)
		defer lockTx.Rollback(ctx)

		_, err = lockTx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", ReaperAdvisoryLockID)
		require.NoError(t, err)

		// Run reap cycle (should skip execution because of lock)
		r.reap(ctx)

		// Verify job is still processing (not reclaimed)
		var dbStatus string
		err = s.Pool.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus)
		require.NoError(t, err)
		assert.Equal(t, "processing", dbStatus)

		// Release lock by rolling back lockTx
		err = lockTx.Rollback(ctx)
		require.NoError(t, err)

		// Run reap cycle again
		r.reap(ctx)

		// Verify job is now reclaimed
		err = s.Pool.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus)
		require.NoError(t, err)
		assert.Equal(t, "retrying", dbStatus)
	})

	t.Run("Worker crash simulation and recovery", func(t *testing.T) {
		resetTables()

		// Enqueue a job
		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType: "crash_job",
			Payload: []byte(`{}`),
		})
		require.NoError(t, err)

		// Set up a worker pool
		wp := worker.NewWorkerPool(s, q, "worker-crash", 50*time.Millisecond)

		// Signal to indicate when the job starts processing
		processingChan := make(chan struct{})
		completedChan := make(chan struct{})

		var successCount int
		var mu sync.Mutex

		wp.Register("crash_job", 1, func(jobCtx context.Context, payload json.RawMessage) error {
			mu.Lock()
			isFirst := successCount == 0
			mu.Unlock()

			if isFirst {
				close(processingChan)
				// Simulate a freeze/crash: block until context is cancelled (simulating the worker dying)
				<-jobCtx.Done()
				return jobCtx.Err()
			}

			mu.Lock()
			successCount++
			mu.Unlock()
			close(completedChan)
			return nil
		})

		// Start worker pool 1
		runCtx, runCancel := context.WithCancel(ctx)
		go wp.Start(runCtx)

		// Wait for worker pool to pick up the job and freeze
		select {
		case <-processingChan:
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for job to start processing")
		}

		// SIMULATE CRASH:
		// We cancel the context of the worker pool.
		runCancel()
		wp.Stop()

		// To simulate a real worker crash where it is SIGKILLed and doesn't run markFailed:
		// We reset the job status in the DB back to 'processing' and locked_by to 'worker-crash'
		_, err = s.Pool.Exec(ctx, `
			UPDATE jobs 
			SET status = 'processing', 
			    locked_by = 'worker-crash',
			    visibility_deadline = now() - INTERVAL '5 minutes',
			    locked_at = now() - INTERVAL '5 minutes'
			WHERE id = $1
		`, job.ID)
		require.NoError(t, err)

		// Now run the reaper! It should reclaim the job to 'retrying'
		r.reap(ctx)

		// Check status in DB is 'retrying'
		var dbStatus string
		err = s.Pool.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus)
		require.NoError(t, err)
		assert.Equal(t, "retrying", dbStatus)

		// Start a new worker pool (simulating service restart / new worker)
		wp2 := worker.NewWorkerPool(s, q, "worker-healthy", 50*time.Millisecond)
		wp2.Register("crash_job", 1, func(jobCtx context.Context, payload json.RawMessage) error {
			mu.Lock()
			successCount++
			mu.Unlock()
			close(completedChan)
			return nil
		})

		runCtx2, runCancel2 := context.WithCancel(ctx)
		defer runCancel2()
		go wp2.Start(runCtx2)

		// Wait for job to complete successfully
		select {
		case <-completedChan:
		case <-time.After(3 * time.Second):
			t.Fatal("Timeout waiting for job to complete on healthy worker")
		}

		wp2.Stop()

		// Verify job is now succeeded
		err = s.Pool.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus)
		require.NoError(t, err)
		assert.Equal(t, "succeeded", dbStatus)

		// Verify attempts history (1 reclaimed attempt + 1 successful attempt)
		var attemptsCount int
		err = s.Pool.QueryRow(ctx, "SELECT count(*) FROM job_attempts WHERE job_id = $1", job.ID).Scan(&attemptsCount)
		require.NoError(t, err)
		assert.Equal(t, 2, attemptsCount)
	})
}

func ptr[T any](v T) *T {
	return &v
}

func setupTestSchema(t *testing.T, ctx context.Context, s *store.Store) {
	queries := []string{
		`DROP TABLE IF EXISTS job_attempts CASCADE;`,
		`DROP TABLE IF EXISTS processed_idempotency_keys CASCADE;`,
		`DROP TABLE IF EXISTS jobs CASCADE;`,
		`CREATE TABLE jobs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			job_type VARCHAR(255) NOT NULL,
			payload JSONB NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'retrying', 'succeeded', 'dead_letter')),
			idempotency_key VARCHAR(255),
			unique_key VARCHAR(255),
			priority INT NOT NULL DEFAULT 0,
			run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
			max_attempts INT NOT NULL DEFAULT 5,
			attempt_count INT NOT NULL DEFAULT 0,
			locked_by VARCHAR(255),
			locked_at TIMESTAMP WITH TIME ZONE,
			visibility_deadline TIMESTAMP WITH TIME ZONE,
			result JSONB,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
			updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
			completed_at TIMESTAMP WITH TIME ZONE
		);`,
		`CREATE TABLE job_attempts (
			id BIGSERIAL PRIMARY KEY,
			job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
			attempt_number INT NOT NULL,
			result VARCHAR(50) NOT NULL CHECK (result IN ('success', 'error', 'non_retryable', 'reclaimed_by_reaper')),
			error_message TEXT,
			stack_trace TEXT,
			duration_ms INT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
		);`,
		`CREATE TABLE processed_idempotency_keys (
			key VARCHAR(255) PRIMARY KEY,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
		);`,
		`CREATE INDEX idx_jobs_dequeue ON jobs (priority DESC, run_at ASC) WHERE status IN ('pending', 'retrying');`,
		`CREATE INDEX idx_jobs_type_status ON jobs (job_type, status);`,
		`CREATE UNIQUE INDEX idx_jobs_idempotency_key ON jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;`,
		`CREATE UNIQUE INDEX idx_jobs_unique_key_active ON jobs (unique_key) WHERE unique_key IS NOT NULL AND status NOT IN ('succeeded', 'dead_letter');`,
	}

	for _, query := range queries {
		_, err := s.Pool.Exec(ctx, query)
		require.NoError(t, err, "Failed executing query: %s", query)
	}
}
