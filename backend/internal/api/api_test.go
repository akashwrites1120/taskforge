package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"taskforge/backend/internal/api"
	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/store"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testDB returns a connected store for integration tests; skips if DB unreachable.
func testDB(t *testing.T) *store.Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/taskforge_test?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	s, err := store.NewStore(ctx, dsn)
	if err != nil {
		t.Skipf("Skipping integration test; failed to connect to DB at %s: %v", dsn, err)
	}
	t.Cleanup(func() {
		s.Pool.Exec(context.Background(), "DELETE FROM job_attempts")
		s.Pool.Exec(context.Background(), "DELETE FROM jobs")
		s.Close()
	})
	return s
}

// buildRouter creates an *http.ServeMux wired to the api handlers for testing.
// We create the chi router through api.NewServer to keep test setup minimal.
func buildHandler(t *testing.T) http.Handler {
	t.Helper()
	s := testDB(t)
	q := queue.NewQueue(s, 30*time.Second)
	srv := api.NewServer("0", s, q) // port "0" – we won't actually bind
	return srv.Handler()
}

// --------------------------------------------------------------------------
// Healthz
// --------------------------------------------------------------------------

func TestHealthz(t *testing.T) {
	h := buildHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "OK", rec.Body.String())
}

// --------------------------------------------------------------------------
// Enqueue — POST /jobs
// --------------------------------------------------------------------------

func TestEnqueueJob_Success(t *testing.T) {
	h := buildHandler(t)

	body := map[string]any{
		"job_type": "send_email",
		"payload":  json.RawMessage(`{"to":"test@example.com"}`),
		"priority": 1,
	}
	b, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.NotEmpty(t, resp["id"])
}

func TestEnqueueJob_BadBody(t *testing.T) {
	h := buildHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewBufferString("not-json"))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestEnqueueJob_IdempotencyKey_Deduplication(t *testing.T) {
	h := buildHandler(t)
	ikey := "ikey-test-1"
	body := map[string]any{
		"job_type":        "send_email",
		"payload":         json.RawMessage(`{}`),
		"idempotency_key": ikey,
	}
	b, _ := json.Marshal(body)

	// First enqueue → 201
	rec1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req1.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec1, req1)
	require.Equal(t, http.StatusCreated, rec1.Code)

	// Second enqueue with same idempotency key → 200 (deduped)
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req2.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec2, req2)
	assert.Equal(t, http.StatusOK, rec2.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec2.Body).Decode(&resp))
	assert.Equal(t, true, resp["deduped"])
}

// --------------------------------------------------------------------------
// List Jobs — GET /jobs
// --------------------------------------------------------------------------

func TestListJobs(t *testing.T) {
	h := buildHandler(t)

	// Enqueue a couple of jobs first
	for _, jt := range []string{"send_email", "process_payment"} {
		body := map[string]any{"job_type": jt, "payload": json.RawMessage(`{}`)}
		b, _ := json.Marshal(body)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		h.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jobs?limit=10", nil)
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	jobs := resp["jobs"].([]any)
	assert.GreaterOrEqual(t, len(jobs), 2)
	assert.GreaterOrEqual(t, int(resp["total"].(float64)), 2)
}

func TestListJobs_FilterByStatus(t *testing.T) {
	h := buildHandler(t)

	body := map[string]any{"job_type": "send_email", "payload": json.RawMessage(`{}`)}
	b, _ := json.Marshal(body)
	rec0 := httptest.NewRecorder()
	req0 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req0.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec0, req0)
	require.Equal(t, http.StatusCreated, rec0.Code)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jobs?status=pending", nil)
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	jobs := resp["jobs"].([]any)
	for _, j := range jobs {
		jmap := j.(map[string]any)
		assert.Equal(t, "pending", jmap["status"])
	}
}

// --------------------------------------------------------------------------
// Get Job — GET /jobs/{id}
// --------------------------------------------------------------------------

func TestGetJob_Found(t *testing.T) {
	h := buildHandler(t)

	body := map[string]any{"job_type": "send_email", "payload": json.RawMessage(`{}`)}
	b, _ := json.Marshal(body)
	rec0 := httptest.NewRecorder()
	req0 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req0.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec0, req0)
	require.Equal(t, http.StatusCreated, rec0.Code)
	var created map[string]any
	require.NoError(t, json.NewDecoder(rec0.Body).Decode(&created))
	id := created["id"].(string)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jobs/"+id, nil)
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.NotNil(t, resp["job"])
	assert.NotNil(t, resp["attempts"])
}

func TestGetJob_NotFound(t *testing.T) {
	h := buildHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jobs/00000000-0000-0000-0000-000000000000", nil)
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

// --------------------------------------------------------------------------
// Stats — GET /stats
// --------------------------------------------------------------------------

func TestGetStats(t *testing.T) {
	h := buildHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.NotNil(t, resp["status_counts"])
	assert.NotNil(t, resp["throughput_succeeded"])
	assert.NotNil(t, resp["throughput_failed"])
	assert.NotNil(t, resp["oldest_pending_age_seconds"])
}

// --------------------------------------------------------------------------
// Requeue — POST /jobs/{id}/requeue
// --------------------------------------------------------------------------

func TestRequeueJob_OnlyDeadLetter(t *testing.T) {
	h := buildHandler(t)

	// Enqueue a fresh pending job — cannot requeue a pending job
	body := map[string]any{"job_type": "send_email", "payload": json.RawMessage(`{}`)}
	b, _ := json.Marshal(body)
	rec0 := httptest.NewRecorder()
	req0 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req0.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec0, req0)
	require.Equal(t, http.StatusCreated, rec0.Code)
	var created map[string]any
	require.NoError(t, json.NewDecoder(rec0.Body).Decode(&created))
	id := created["id"].(string)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/jobs/"+id+"/requeue", nil)
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

// --------------------------------------------------------------------------
// Discard — POST /jobs/{id}/discard
// --------------------------------------------------------------------------

func TestDiscardJob_OnlyDeadLetter(t *testing.T) {
	h := buildHandler(t)

	// Enqueue a fresh pending job — cannot discard a pending job
	body := map[string]any{"job_type": "send_email", "payload": json.RawMessage(`{}`)}
	b, _ := json.Marshal(body)
	rec0 := httptest.NewRecorder()
	req0 := httptest.NewRequest(http.MethodPost, "/jobs", bytes.NewReader(b))
	req0.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec0, req0)
	require.Equal(t, http.StatusCreated, rec0.Code)
	var created map[string]any
	require.NoError(t, json.NewDecoder(rec0.Body).Decode(&created))
	id := created["id"].(string)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/jobs/"+id+"/discard", nil)
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
