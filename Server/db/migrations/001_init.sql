CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,

  status VARCHAR(20) NOT NULL,
  attempt INT DEFAULT 0,
  max_attempts INT DEFAULT 5,

  scheduled_at TIMESTAMP NOT NULL,
  next_retry_at TIMESTAMP,

  idempotency_key VARCHAR(100),

  assigned_worker_id VARCHAR(50),
  lease_expiry TIMESTAMP,

  -- Split-brain protection
  leader_epoch BIGINT,

  dlq_reason TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency
ON tasks(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status_schedule
ON tasks(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_tasks_retry
ON tasks(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_tasks_worker_running
ON tasks(assigned_worker_id)
WHERE status = 'RUNNING';

CREATE TABLE IF NOT EXISTS workers (
  worker_id VARCHAR(50) PRIMARY KEY,
  last_heartbeat TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL
);
