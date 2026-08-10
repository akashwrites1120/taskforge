package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type API struct {
	store *store.Store
	queue *queue.Queue
}

func NewAPI(store *store.Store, q *queue.Queue) *API {
	return &API{
		store: store,
		queue: q,
	}
}

type EnqueueRequest struct {
	JobType        string          `json:"job_type"`
	Payload        json.RawMessage `json:"payload"`
	IdempotencyKey *string         `json:"idempotency_key,omitempty"`
	UniqueKey      *string         `json:"unique_key,omitempty"`
	Priority       int             `json:"priority"`
	RunAt          *time.Time      `json:"run_at,omitempty"`
	MaxAttempts    *int            `json:"max_attempts,omitempty"`
}

// EnqueueJob accepts job creation requests and enqueues jobs transactionally.
func (a *API) EnqueueJob(w http.ResponseWriter, r *http.Request) {
	var req EnqueueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	job, deduped, err := a.queue.Enqueue(r.Context(), queue.EnqueueParams{
		JobType:        req.JobType,
		Payload:        req.Payload,
		IdempotencyKey: req.IdempotencyKey,
		UniqueKey:      req.UniqueKey,
		Priority:       req.Priority,
		RunAt:          req.RunAt,
		MaxAttempts:    req.MaxAttempts,
	})
	if err != nil {
		if errors.Is(err, queue.ErrUniqueKeyViolation) || errors.Is(err, queue.ErrIdempotencyViolation) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf("failed to enqueue job: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if deduped {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{"id": job.ID, "deduped": true})
	} else {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]any{"id": job.ID})
	}
}

// ListJobs retrieves a filterable and paginated list of jobs.
func (a *API) ListJobs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	statuses := q["status"]
	if len(statuses) == 1 && strings.Contains(statuses[0], ",") {
		statuses = strings.Split(statuses[0], ",")
	}

	jobTypes := q["job_type"]
	if len(jobTypes) == 1 && strings.Contains(jobTypes[0], ",") {
		jobTypes = strings.Split(jobTypes[0], ",")
	}

	search := q.Get("search")
	startTimeStr := q.Get("start_time")
	endTimeStr := q.Get("end_time")

	limit := 20
	if limitVal, err := strconv.Atoi(q.Get("limit")); err == nil && limitVal > 0 {
		limit = limitVal
	}
	if limit > 100 {
		limit = 100
	}

	offset := 0
	if offsetVal, err := strconv.Atoi(q.Get("offset")); err == nil && offsetVal >= 0 {
		offset = offsetVal
	}

	query := `
		SELECT id, job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, 
		       attempt_count, locked_by, locked_at, visibility_deadline, result, created_at, updated_at, completed_at
		FROM jobs
		WHERE 1=1
	`
	countQuery := `SELECT count(*) FROM jobs WHERE 1=1`

	var args []any
	argCount := 1

	if len(statuses) > 0 {
		query += fmt.Sprintf(" AND status = ANY($%d)", argCount)
		countQuery += fmt.Sprintf(" AND status = ANY($%d)", argCount)
		args = append(args, statuses)
		argCount++
	}

	if len(jobTypes) > 0 {
		query += fmt.Sprintf(" AND job_type = ANY($%d)", argCount)
		countQuery += fmt.Sprintf(" AND job_type = ANY($%d)", argCount)
		args = append(args, jobTypes)
		argCount++
	}

	if search != "" {
		query += fmt.Sprintf(" AND (id::text ILIKE $%d OR idempotency_key ILIKE $%d OR unique_key ILIKE $%d)", argCount, argCount, argCount)
		countQuery += fmt.Sprintf(" AND (id::text ILIKE $%d OR idempotency_key ILIKE $%d OR unique_key ILIKE $%d)", argCount, argCount, argCount)
		args = append(args, "%"+search+"%")
		argCount++
	}

	if startTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			query += fmt.Sprintf(" AND created_at >= $%d", argCount)
			countQuery += fmt.Sprintf(" AND created_at >= $%d", argCount)
			args = append(args, t)
			argCount++
		}
	}

	if endTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			query += fmt.Sprintf(" AND created_at <= $%d", argCount)
			countQuery += fmt.Sprintf(" AND created_at <= $%d", argCount)
			args = append(args, t)
			argCount++
		}
	}

	var total int
	err := a.store.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to count jobs: %v", err), http.StatusInternalServerError)
		return
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argCount, argCount+1)
	args = append(args, limit, offset)

	rows, err := a.store.Pool.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to query jobs: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	jobs := []queue.Job{}
	for rows.Next() {
		var job queue.Job
		err := rows.Scan(
			&job.ID, &job.JobType, &job.Payload, &job.Status, &job.IdempotencyKey, &job.UniqueKey, &job.Priority, &job.RunAt, &job.MaxAttempts,
			&job.AttemptCount, &job.LockedBy, &job.LockedAt, &job.VisibilityDeadline, &job.Result, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to scan job: %v", err), http.StatusInternalServerError)
			return
		}
		jobs = append(jobs, job)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"jobs":   jobs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GetJob returns detailed information and history of a single job.
func (a *API) GetJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	queryJob := `
		SELECT id, job_type, payload, status, idempotency_key, unique_key, priority, run_at, max_attempts, 
		       attempt_count, locked_by, locked_at, visibility_deadline, result, created_at, updated_at, completed_at
		FROM jobs
		WHERE id = $1
	`
	var job queue.Job
	err := a.store.Pool.QueryRow(r.Context(), queryJob, id).Scan(
		&job.ID, &job.JobType, &job.Payload, &job.Status, &job.IdempotencyKey, &job.UniqueKey, &job.Priority, &job.RunAt, &job.MaxAttempts,
		&job.AttemptCount, &job.LockedBy, &job.LockedAt, &job.VisibilityDeadline, &job.Result, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("failed to query job: %v", err), http.StatusInternalServerError)
		return
	}

	queryAttempts := `
		SELECT id, job_id, attempt_number, result, error_message, stack_trace, duration_ms, created_at
		FROM job_attempts
		WHERE job_id = $1
		ORDER BY attempt_number ASC
	`
	rows, err := a.store.Pool.Query(r.Context(), queryAttempts, id)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to query attempts: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	attempts := []queue.JobAttempt{}
	for rows.Next() {
		var att queue.JobAttempt
		err := rows.Scan(
			&att.ID, &att.JobID, &att.AttemptNumber, &att.Result, &att.ErrorMessage, &att.StackTrace, &att.DurationMs, &att.CreatedAt,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to scan attempt: %v", err), http.StatusInternalServerError)
			return
		}
		attempts = append(attempts, att)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"job":      job,
		"attempts": attempts,
	})
}

type RequeueRequest struct {
	Payload json.RawMessage `json:"payload,omitempty"`
}

// RequeueJob transitions a dead-letter job back to pending.
func (a *API) RequeueJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req RequeueRequest
	if r.Body != http.NoBody && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
	}

	tx, err := a.store.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, "failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var currentStatus string
	var payload json.RawMessage
	err = tx.QueryRow(r.Context(), "SELECT status, payload FROM jobs WHERE id = $1 FOR UPDATE", id).Scan(&currentStatus, &payload)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to query job status", http.StatusInternalServerError)
		return
	}

	if currentStatus != string(queue.StatusDeadLetter) {
		http.Error(w, "only dead_lettered jobs can be requeued", http.StatusBadRequest)
		return
	}

	newPayload := payload
	if len(req.Payload) > 0 {
		newPayload = req.Payload
	}

	queryUpdate := `
		UPDATE jobs
		SET status = 'pending',
		    attempt_count = 0,
		    run_at = now(),
		    payload = $1,
		    locked_by = NULL,
		    locked_at = NULL,
		    visibility_deadline = NULL,
		    completed_at = NULL,
		    updated_at = now()
		WHERE id = $2 AND status = 'dead_letter'
	`
	_, err = tx.Exec(r.Context(), queryUpdate, newPayload, id)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to update job status: %v", err), http.StatusInternalServerError)
		return
	}

	queryAttempt := `
		INSERT INTO job_attempts (job_id, attempt_number, result, error_message, duration_ms)
		VALUES ($1, 0, 'reclaimed_by_reaper', 'job manually requeued by operator', 0)
	`
	_, err = tx.Exec(r.Context(), queryAttempt, id)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to insert audit attempt: %v", err), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
}

// DiscardJob deletes a dead-letter job permanently.
func (a *API) DiscardJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var status string
	err := a.store.Pool.QueryRow(r.Context(), "SELECT status FROM jobs WHERE id = $1", id).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to query job status", http.StatusInternalServerError)
		return
	}

	if status != string(queue.StatusDeadLetter) {
		http.Error(w, "only dead_lettered jobs can be discarded", http.StatusBadRequest)
		return
	}

	_, err = a.store.Pool.Exec(r.Context(), "DELETE FROM jobs WHERE id = $1", id)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to discard/delete job: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "discarded"})
}

type StatsResponse struct {
	StatusCounts            map[string]int64 `json:"status_counts"`
	ThroughputSucceeded     int64            `json:"throughput_succeeded"`
	ThroughputFailed        int64            `json:"throughput_failed"`
	OldestPendingAgeSeconds int64            `json:"oldest_pending_age_seconds"`
}

// GetStats returns queue aggregation metrics for the overview dashboard.
func (a *API) GetStats(w http.ResponseWriter, r *http.Request) {
	rows, err := a.store.Pool.Query(r.Context(), "SELECT status, count(*) FROM jobs GROUP BY status")
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to query status counts: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	counts := map[string]int64{
		"pending":     0,
		"processing":  0,
		"retrying":    0,
		"succeeded":   0,
		"dead_letter": 0,
	}
	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err == nil {
			counts[status] = count
		}
	}

	var succeeded, failed int64
	queryThroughput := `
		SELECT 
			COALESCE(SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END), 0) as succeeded,
			COALESCE(SUM(CASE WHEN result IN ('error', 'non_retryable') THEN 1 ELSE 0 END), 0) as failed
		FROM job_attempts
		WHERE created_at > now() - INTERVAL '1 hour'
	`
	err = a.store.Pool.QueryRow(r.Context(), queryThroughput).Scan(&succeeded, &failed)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to query throughput: %v", err), http.StatusInternalServerError)
		return
	}

	var oldestAge float64
	queryAge := `
		SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN(run_at))), 0)
		FROM jobs
		WHERE status IN ('pending', 'retrying') AND run_at <= now()
	`
	_ = a.store.Pool.QueryRow(r.Context(), queryAge).Scan(&oldestAge)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(StatsResponse{
		StatusCounts:            counts,
		ThroughputSucceeded:     succeeded,
		ThroughputFailed:        failed,
		OldestPendingAgeSeconds: int64(oldestAge),
	})
}

// Healthz returns 200 OK to indicate the app is alive.
func (a *API) Healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Readyz returns 200 OK if PostgreSQL is pingable.
func (a *API) Readyz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	if err := a.store.Pool.Ping(r.Context()); err != nil {
		http.Error(w, "database unreachable: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}
