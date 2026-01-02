-- Migration: Add task_executions table for execution output storage
-- Purpose: Store bounded, truncatable execution output for observability

CREATE TABLE task_executions (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP NOT NULL,
    duration_ms INT,
    
    -- Output (bounded to 16KB)
    output JSONB,
    error TEXT,
    truncated BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_task_executions_status ON task_executions(status);

-- Comments
COMMENT ON TABLE task_executions IS 'Stores bounded execution output for each task attempt';
COMMENT ON COLUMN task_executions.output IS 'Execution result (HTTP response, shell output, etc.) - max 16KB';
COMMENT ON COLUMN task_executions.truncated IS 'True if output was truncated due to size limit';
