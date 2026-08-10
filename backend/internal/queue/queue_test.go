package queue

import (
	"context"
	"math"
	"os"
	"testing"
	"time"

	"taskforge/backend/internal/store"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBackoffPolicy(t *testing.T) {
	policy := BackoffPolicy{
		BaseDelay: 2 * time.Second,
		MaxDelay:  15 * time.Minute,
	}

	// Test exponential bounds
	for i := 0; i < 10; i++ {
		for run := 0; run < 5; run++ {
			delay := policy.CalculateBackoff(i)
			maxDelay := time.Duration(float64(policy.BaseDelay) * math.Pow(2, float64(i)))
			if maxDelay > policy.MaxDelay {
				maxDelay = policy.MaxDelay
			}

			assert.GreaterOrEqual(t, delay, time.Duration(0), "delay should be non-negative")
			assert.LessOrEqual(t, delay, maxDelay, "delay %v should be <= max delay %v for attempt %d", delay, maxDelay, i)
		}
	}

	// Test cap at MaxDelay
	for run := 0; run < 50; run++ {
		// 2^20 is huge, should definitely hit MaxDelay limit
		delay := policy.CalculateBackoff(20)
		assert.LessOrEqual(t, delay, policy.MaxDelay, "delay should be capped at MaxDelay")
	}
}

func TestQueueDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Use a standard local test db URL if none is specified, but skip if connection fails
		dbURL = "postgres://postgres:postgres@localhost:5432/taskforge_test?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s, err := store.NewStore(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping integration test; failed to connect to DB at %s: %v", dbURL, err)
	}
	defer s.Close()

	// Set up schema for test database (clean and recreate tables)
	setupTestSchema(t, ctx, s)

	q := NewQueue(s, 24*time.Hour)

	t.Run("Enqueue and Dequeue basic flow", func(t *testing.T) {
		payload := []byte(`{"user_id": 123}`)
		job, deduped, err := q.Enqueue(ctx, EnqueueParams{
			JobType: "send_email",
			Payload: payload,
		})
		require.NoError(t, err)
		assert.False(t, deduped)
		assert.NotEmpty(t, job.ID)
		assert.Equal(t, "send_email", job.JobType)
		assert.JSONEq(t, string(payload), string(job.Payload))
		assert.Equal(t, StatusPending, job.Status)
		assert.Equal(t, 5, job.MaxAttempts)

		// Dequeue
		jobs, err := q.Dequeue(ctx, "worker-1", 10, 10*time.Second, nil)
		require.NoError(t, err)
		require.Len(t, jobs, 1)
		assert.Equal(t, job.ID, jobs[0].ID)
		assert.Equal(t, StatusProcessing, jobs[0].Status)
		assert.Equal(t, "worker-1", *jobs[0].LockedBy)
		assert.NotNil(t, jobs[0].LockedAt)
		assert.NotNil(t, jobs[0].VisibilityDeadline)
	})

	t.Run("Enqueue idempotency key deduplication", func(t *testing.T) {
		key := "idem-key-1"
		payload1 := []byte(`{"run": 1}`)
		payload2 := []byte(`{"run": 2}`)

		job1, deduped1, err := q.Enqueue(ctx, EnqueueParams{
			JobType:        "process_payment",
			Payload:        payload1,
			IdempotencyKey: &key,
		})
		require.NoError(t, err)
		assert.False(t, deduped1)

		// Try enqueuing again with same key within dedupe window
		job2, deduped2, err := q.Enqueue(ctx, EnqueueParams{
			JobType:        "process_payment",
			Payload:        payload2,
			IdempotencyKey: &key,
		})
		require.NoError(t, err)
		assert.True(t, deduped2)
		assert.Equal(t, job1.ID, job2.ID)
		assert.JSONEq(t, string(payload1), string(job2.Payload)) // returns original payload
	})

	t.Run("Unique key active restriction", func(t *testing.T) {
		uk := "export-user-123"
		_, deduped, err := q.Enqueue(ctx, EnqueueParams{
			JobType:   "export_data",
			Payload:   []byte(`{}`),
			UniqueKey: &uk,
		})
		require.NoError(t, err)
		assert.False(t, deduped)

		// Try enqueuing a second active one with the same unique key
		_, _, err = q.Enqueue(ctx, EnqueueParams{
			JobType:   "export_data",
			Payload:   []byte(`{}`),
			UniqueKey: &uk,
		})
		assert.ErrorIs(t, err, ErrUniqueKeyViolation)
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
