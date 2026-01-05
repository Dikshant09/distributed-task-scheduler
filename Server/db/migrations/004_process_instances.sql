-- Process instances table for tracking schedulers and workers
-- This table is used by the process registry to display instances in the UI

CREATE TABLE IF NOT EXISTS process_instances (
    id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(20) NOT NULL,  -- 'scheduler' or 'worker'
    pid INTEGER,
    is_leader BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    current_task_id UUID,
    started_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups by type
CREATE INDEX IF NOT EXISTS idx_process_instances_type ON process_instances(type);

-- Index for leader lookup
CREATE INDEX IF NOT EXISTS idx_process_instances_leader ON process_instances(type, is_leader) WHERE is_leader = TRUE;
