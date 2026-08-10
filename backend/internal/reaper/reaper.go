package reaper

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"taskforge/backend/internal/store"
)

const ReaperAdvisoryLockID = 987654321

type Reaper struct {
	store    *store.Store
	interval time.Duration
	stopChan chan struct{}
	wg       sync.WaitGroup
}

func NewReaper(store *store.Store, interval time.Duration) *Reaper {
	return &Reaper{
		store:    store,
		interval: interval,
		stopChan: make(chan struct{}),
	}
}

// Start starts the background reaping ticker.
func (r *Reaper) Start(ctx context.Context) {
	slog.Info("Starting reaper process", "interval", r.interval)
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	// Initial check on startup
	r.reap(ctx)

	for {
		select {
		case <-r.stopChan:
			slog.Info("Reaper stopped polling (shutting down)")
			return
		case <-ctx.Done():
			slog.Info("Reaper context cancelled (shutting down)")
			return
		case <-ticker.C:
			r.reap(ctx)
		}
	}
}

// Stop signals the reaper to halt and blocks until any active reap cycle finishes.
func (r *Reaper) Stop() {
	close(r.stopChan)
	r.wg.Wait()
	slog.Info("Reaper gracefully stopped")
}

func (r *Reaper) reap(ctx context.Context) {
	r.wg.Add(1)
	defer r.wg.Done()

	tx, err := r.store.Pool.Begin(ctx)
	if err != nil {
		slog.Error("Reaper failed to start transaction", "error", err)
		return
	}
	defer tx.Rollback(ctx)

	// 1. Try to acquire transaction-level advisory lock (released automatically on commit/rollback)
	var acquired bool
	err = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock($1)", ReaperAdvisoryLockID).Scan(&acquired)
	if err != nil {
		slog.Error("Reaper failed to query advisory lock", "error", err)
		return
	}

	if !acquired {
		// Lock is held by another instance, skip this tick silently
		return
	}

	// 2. Select jobs that are in processing status but have breached their visibility deadline
	querySelect := `
		SELECT id, attempt_count, max_attempts
		FROM jobs
		WHERE status = 'processing'
		  AND visibility_deadline < now()
		FOR UPDATE SKIP LOCKED
	`
	rows, err := tx.Query(ctx, querySelect)
	if err != nil {
		slog.Error("Reaper failed to query expired jobs", "error", err)
		return
	}

	type expiredJob struct {
		ID           string
		AttemptCount int
		MaxAttempts  int
	}
	var expiredJobs []expiredJob

	for rows.Next() {
		var ej expiredJob
		if err := rows.Scan(&ej.ID, &ej.AttemptCount, &ej.MaxAttempts); err != nil {
			slog.Error("Reaper failed to scan expired job row", "error", err)
			rows.Close()
			return
		}
		expiredJobs = append(expiredJobs, ej)
	}
	rows.Close()

	if len(expiredJobs) == 0 {
		return
	}

	slog.Info("Reaper found expired jobs to reclaim", "count", len(expiredJobs))

	// 3. Reclaim each job
	for _, ej := range expiredJobs {
		nextAttempt := ej.AttemptCount + 1
		exhausted := nextAttempt >= ej.MaxAttempts

		var newStatus string
		var queryJob string
		var args []any

		if exhausted {
			newStatus = "dead_letter"
			queryJob = `
				UPDATE jobs
				SET status = 'dead_letter',
				    attempt_count = $1,
				    locked_by = NULL,
				    locked_at = NULL,
				    visibility_deadline = NULL,
				    completed_at = now(),
				    updated_at = now()
				WHERE id = $2 AND status = 'processing'
			`
			args = []any{nextAttempt, ej.ID}
		} else {
			newStatus = "retrying"
			queryJob = `
				UPDATE jobs
				SET status = 'retrying',
				    attempt_count = $1,
				    run_at = now(),
				    locked_by = NULL,
				    locked_at = NULL,
				    visibility_deadline = NULL,
				    updated_at = now()
				WHERE id = $2 AND status = 'processing'
			`
			args = []any{nextAttempt, ej.ID}
		}

		res, err := tx.Exec(ctx, queryJob, args...)
		if err != nil {
			slog.Error("Reaper failed to update job status", "job_id", ej.ID, "error", err)
			return
		}

		if res.RowsAffected() == 0 {
			// Job was updated by another process/heartbeat just before update, skip
			continue
		}

		// Insert attempt record reflecting reclaim action
		queryAttempt := `
			INSERT INTO job_attempts (job_id, attempt_number, result, error_message, duration_ms)
			VALUES ($1, $2, 'reclaimed_by_reaper', 'visibility deadline expired (worker crashed or froze)', 0)
		`
		_, err = tx.Exec(ctx, queryAttempt, ej.ID, nextAttempt)
		if err != nil {
			slog.Error("Reaper failed to insert attempt history", "job_id", ej.ID, "error", err)
			return
		}

		slog.Warn("Job reclaimed by reaper", "job_id", ej.ID, "new_status", newStatus, "attempt", nextAttempt)
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("Reaper failed to commit transaction", "error", err)
	}
}
