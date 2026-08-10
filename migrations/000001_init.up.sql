CREATE TABLE IF NOT EXISTS jobs (
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
);

CREATE TABLE IF NOT EXISTS job_attempts (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    result VARCHAR(50) NOT NULL CHECK (result IN ('success', 'error', 'non_retryable', 'reclaimed_by_reaper')),
    error_message TEXT,
    stack_trace TEXT,
    duration_ms INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for dequeue efficiency: order by priority DESC, run_at ASC for pending/retrying jobs
CREATE INDEX IF NOT EXISTS idx_jobs_dequeue ON jobs (priority DESC, run_at ASC) 
WHERE status IN ('pending', 'retrying');

-- Index for filtering by job_type and status (useful for dashboard and stats)
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs (job_type, status);

-- Unique index for global idempotency key (allows write-once-and-re-use if deleted, or global unique check)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Unique index for unique_key: only one job of a specific unique_key can be active (pending, processing, retrying) at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_key_active ON jobs (unique_key) 
WHERE unique_key IS NOT NULL AND status NOT IN ('succeeded', 'dead_letter');
