package worker

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/store"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNonRetryableError(t *testing.T) {
	err := errors.New("something went wrong")
	assert.False(t, IsNonRetryable(err))

	nrErr := MarkNonRetryable(err)
	assert.True(t, IsNonRetryable(nrErr))
	assert.Equal(t, "something went wrong", nrErr.Error())
	assert.ErrorIs(t, nrErr, err)
}

func TestWorkerPoolRegister(t *testing.T) {
	s := &store.Store{}
	q := &queue.Queue{}
	wp := NewWorkerPool(s, q, "test-worker", 100*time.Millisecond)

	dummyHandler := func(ctx context.Context, payload json.RawMessage) error {
		return nil
	}

	wp.Register("test_job", 3, dummyHandler)

	assert.Contains(t, wp.handlers, "test_job")
	assert.Equal(t, 3, wp.concurrencyLimits["test_job"])
	assert.Equal(t, 3, cap(wp.semaphores["test_job"]))
}

func TestWorkerPoolDB(t *testing.T) {
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

	// Setup schema cleanly
	setupTestSchema(t, ctx, s)

	q := queue.NewQueue(s, 24*time.Hour)

	t.Run("Job execution success", func(t *testing.T) {
		wp := NewWorkerPool(s, q, "worker-success", 50*time.Millisecond)
		executed := make(chan struct{})

		wp.Register("success_job", 1, func(ctx context.Context, payload json.RawMessage) error {
			close(executed)
			return nil
		})

		// Enqueue
		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType: "success_job",
			Payload: []byte(`{}`),
		})
		require.NoError(t, err)

		// Start pool in goroutine
		runCtx, runCancel := context.WithCancel(ctx)
		defer runCancel()
		go wp.Start(runCtx)

		// Wait for execution
		select {
		case <-executed:
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for job execution")
		}

		wp.Stop()

		// Verify job status in DB
		var dbStatus string
		var attemptCount int
		err = s.Pool.QueryRow(ctx, "SELECT status, attempt_count FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus, &attemptCount)
		require.NoError(t, err)
		assert.Equal(t, string(queue.StatusSucceeded), dbStatus)
		assert.Equal(t, 1, attemptCount)

		// Verify attempts table
		var result string
		var duration int
		err = s.Pool.QueryRow(ctx, "SELECT result, duration_ms FROM job_attempts WHERE job_id = $1", job.ID).Scan(&result, &duration)
		require.NoError(t, err)
		assert.Equal(t, "success", result)
		assert.GreaterOrEqual(t, duration, 0)
	})

	t.Run("Job execution retryable failure", func(t *testing.T) {
		wp := NewWorkerPool(s, q, "worker-retry", 50*time.Millisecond)
		executed := make(chan struct{})

		wp.Register("retry_job", 1, func(ctx context.Context, payload json.RawMessage) error {
			close(executed)
			return errors.New("transient database connection error")
		})

		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType: "retry_job",
			Payload: []byte(`{}`),
		})
		require.NoError(t, err)

		runCtx, runCancel := context.WithCancel(ctx)
		defer runCancel()
		go wp.Start(runCtx)

		select {
		case <-executed:
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for job execution")
		}

		wp.Stop()

		// Verify status is retrying
		var dbStatus string
		var attemptCount int
		err = s.Pool.QueryRow(ctx, "SELECT status, attempt_count FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus, &attemptCount)
		require.NoError(t, err)
		assert.Equal(t, string(queue.StatusRetrying), dbStatus)
		assert.Equal(t, 1, attemptCount)

		// Verify attempts table
		var result, errMsg string
		err = s.Pool.QueryRow(ctx, "SELECT result, error_message FROM job_attempts WHERE job_id = $1", job.ID).Scan(&result, &errMsg)
		require.NoError(t, err)
		assert.Equal(t, "error", result)
		assert.Contains(t, errMsg, "transient database connection error")
	})

	t.Run("Job execution non-retryable failure", func(t *testing.T) {
		wp := NewWorkerPool(s, q, "worker-non-retry", 50*time.Millisecond)
		executed := make(chan struct{})

		wp.Register("non_retry_job", 1, func(ctx context.Context, payload json.RawMessage) error {
			close(executed)
			return MarkNonRetryable(errors.New("invalid payload syntax"))
		})

		job, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType: "non_retry_job",
			Payload: []byte(`{}`),
		})
		require.NoError(t, err)

		runCtx, runCancel := context.WithCancel(ctx)
		defer runCancel()
		go wp.Start(runCtx)

		select {
		case <-executed:
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for job execution")
		}

		wp.Stop()

		// Verify status is dead_letter
		var dbStatus string
		var attemptCount int
		err = s.Pool.QueryRow(ctx, "SELECT status, attempt_count FROM jobs WHERE id = $1", job.ID).Scan(&dbStatus, &attemptCount)
		require.NoError(t, err)
		assert.Equal(t, string(queue.StatusDeadLetter), dbStatus)
		assert.Equal(t, 1, attemptCount)

		// Verify attempt result is non_retryable
		var result string
		err = s.Pool.QueryRow(ctx, "SELECT result FROM job_attempts WHERE job_id = $1", job.ID).Scan(&result)
		require.NoError(t, err)
		assert.Equal(t, "non_retryable", result)
	})

	t.Run("Job heartbeat extension", func(t *testing.T) {
		wp := NewWorkerPool(s, q, "worker-heartbeat", 50*time.Millisecond)
		executed := make(chan struct{})

		wp.Register("heartbeat_job", 1, func(ctx context.Context, payload json.RawMessage) error {
			// Call heartbeat helper
			err := Heartbeat(ctx)
			require.NoError(t, err)
			close(executed)
			return nil
		})

		_, _, err := q.Enqueue(ctx, queue.EnqueueParams{
			JobType: "heartbeat_job",
			Payload: []byte(`{}`),
		})
		require.NoError(t, err)

		runCtx, runCancel := context.WithCancel(ctx)
		defer runCancel()
		go wp.Start(runCtx)

		select {
		case <-executed:
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for job execution")
		}

		wp.Stop()
	})

	t.Run("Concurrency limits per job type", func(t *testing.T) {
		wp := NewWorkerPool(s, q, "worker-concurrency", 50*time.Millisecond)

		var mu sync.Mutex
		activeCount := 0
		maxSeenActive := 0
		var wg sync.WaitGroup

		// Single capacity queue runner
		wp.Register("limited_job", 1, func(ctx context.Context, payload json.RawMessage) error {
			mu.Lock()
			activeCount++
			if activeCount > maxSeenActive {
				maxSeenActive = activeCount
			}
			mu.Unlock()

			time.Sleep(100 * time.Millisecond)

			mu.Lock()
			activeCount--
			mu.Unlock()
			wg.Done()
			return nil
		})

		// Enqueue 3 jobs
		wg.Add(3)
		_, _, err1 := q.Enqueue(ctx, queue.EnqueueParams{JobType: "limited_job"})
		_, _, err2 := q.Enqueue(ctx, queue.EnqueueParams{JobType: "limited_job"})
		_, _, err3 := q.Enqueue(ctx, queue.EnqueueParams{JobType: "limited_job"})
		require.NoError(t, err1)
		require.NoError(t, err2)
		require.NoError(t, err3)

		runCtx, runCancel := context.WithCancel(ctx)
		defer runCancel()
		go wp.Start(runCtx)

		// Wait for all 3 jobs to complete
		doneChan := make(chan struct{})
		go func() {
			wg.Wait()
			close(doneChan)
		}()

		select {
		case <-doneChan:
		case <-time.After(4 * time.Second):
			t.Fatal("Timeout waiting for concurrent jobs to finish")
		}

		wp.Stop()

		// Max active count should strictly be 1
		assert.Equal(t, 1, maxSeenActive)
	})
}

func setupTestSchema(t *testing.T, ctx context.Context, s *store.Store) {
	// Recreate schema cleanly for tests
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
