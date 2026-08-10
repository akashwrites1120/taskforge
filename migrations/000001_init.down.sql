DROP INDEX IF EXISTS idx_jobs_unique_key_active;
DROP INDEX IF EXISTS idx_jobs_idempotency_key;
DROP INDEX IF EXISTS idx_jobs_type_status;
DROP INDEX IF EXISTS idx_jobs_dequeue;

DROP TABLE IF EXISTS processed_idempotency_keys;
DROP TABLE IF EXISTS job_attempts;
DROP TABLE IF EXISTS jobs;
