const db = require('../index');
const { ConflictError } = require('../../common/errors/custom-errors');
const logger = require('../../common/logger');

// Create Task
const createTask = async (task) => {
  const { id, type, payload, scheduledAt, idempotencyKey } = task;

  const query = `
    INSERT INTO tasks (
      id, type, payload, status, scheduled_at, idempotency_key
    ) VALUES (
      $1, $2, $3, 'PENDING', $4, $5
    ) RETURNING *;
  `;

  try {
    const res = await db.query(query, [id, type, payload, scheduledAt, idempotencyKey]);
    return res.rows[0];
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      // Fetch existing task
      const existing = await db.query('SELECT * FROM tasks WHERE idempotency_key = $1', [idempotencyKey]);
      return existing.rows[0];
    }
    throw err;
  }
};

// Get pending tasks for dispatch
const getPendingTasks = async (limit = 100) => {
  const query = `
    SELECT id, attempt
    FROM tasks
    WHERE status = 'PENDING'
    AND scheduled_at <= NOW()
    LIMIT $1;
  `;
  const res = await db.query(query, [limit]);
  return res.rows;
};

// Batch update to DISPATCHED
const markDispatched = async (taskIds, leaderEpoch) => {
  const query = `
    UPDATE tasks
    SET status = 'DISPATCHED',
        leader_epoch = $1,
        updated_at = NOW()
    WHERE id = ANY($2::uuid[])
    RETURNING id;
  `;
  const res = await db.query(query, [leaderEpoch, taskIds]);
  return res.rows;
};

// Acquire Lease (Worker side)
const acquireLease = async (taskId, workerId) => {
  const query = `
    UPDATE tasks
    SET assigned_worker_id = $1,
        lease_expiry = NOW() + INTERVAL '30 seconds',
        status = 'RUNNING',
        updated_at = NOW()
    WHERE id = $2
    AND (lease_expiry IS NULL OR lease_expiry < NOW())
    RETURNING *;
  `;
  const res = await db.query(query, [workerId, taskId]);
  return res.rows[0]; // Returns undefined if fail
};

// Renew Lease
const renewLease = async (taskId, workerId) => {
  const query = `
    UPDATE tasks
    SET lease_expiry = NOW() + INTERVAL '30 seconds'
    WHERE id = $1 AND assigned_worker_id = $2
    RETURNING lease_expiry;
  `;
  const res = await db.query(query, [taskId, workerId]);
  return res.rows.length > 0;
};

// Update Status (Success/Fail)
const updateStatus = async (id, status, result = null, nextRetryAt = null) => {
  let query = `
    UPDATE tasks
    SET status = $1, updated_at = NOW()
  `;
  const params = [status, id];

  if (status === 'FAILED') {
    query += `, attempt = attempt + 1, next_retry_at = $3`;
    params.push(nextRetryAt);
  } else if (status === 'SUCCESS') {
    // maybe store result in payload or separate table?
    // LLD didn't specify result column, just status.
  }

  query += ` WHERE id = $2 RETURNING *;`;
  const res = await db.query(query, params);
  return res.rows[0];
};

const getTaskById = async (id) => {
  const res = await db.query('SELECT *, assigned_worker_id as worker_id FROM tasks WHERE id = $1', [id]);
  return res.rows[0];
};

// ============ RETRY & DLQ METHODS ============

/**
 * Get tasks that are ready for retry
 * FAILED tasks where next_retry_at <= NOW()
 */
const getRetryableTasks = async (limit = 100) => {
  const query = `
    SELECT id, attempt, max_attempts, type
    FROM tasks
    WHERE status = 'FAILED'
    AND next_retry_at IS NOT NULL
    AND next_retry_at <= NOW()
    LIMIT $1;
  `;
  const res = await db.query(query, [limit]);
  return res.rows;
};

/**
 * Reset a FAILED task back to PENDING for retry
 */
const resetForRetry = async (taskId) => {
  const query = `
    UPDATE tasks
    SET status = 'PENDING',
        next_retry_at = NULL,
        assigned_worker_id = NULL,
        lease_expiry = NULL,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await db.query(query, [taskId]);
  return res.rows[0];
};

/**
 * Move a task to DLQ (Dead Letter Queue)
 */
const moveToDLQ = async (taskId, reason) => {
  const query = `
    UPDATE tasks
    SET status = 'DLQ',
        dlq_reason = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await db.query(query, [taskId, reason]);
  return res.rows[0];
};

/**
 * Get all tasks in DLQ
 */
const getDLQTasks = async (limit = 100) => {
  const query = `
    SELECT id, type, attempt, max_attempts, dlq_reason, created_at
    FROM tasks
    WHERE status = 'DLQ'
    ORDER BY updated_at DESC
    LIMIT $1;
  `;
  const res = await db.query(query, [limit]);
  return res.rows;
};

/**
 * Reset a task from DLQ back to PENDING
 * Used for manual retry from admin interface
 */
const resetFromDLQ = async (taskId) => {
  const query = `
    UPDATE tasks
    SET status = 'PENDING',
        dlq_reason = NULL,
        attempt = 0,
        next_retry_at = NULL,
        assigned_worker_id = NULL,
        lease_expiry = NULL,
        updated_at = NOW()
    WHERE id = $1 AND status = 'DLQ'
    RETURNING *;
  `;
  const res = await db.query(query, [taskId]);
  return res.rows[0];
};

/**
 * Delete DLQ tasks older than retention period
 */
const deleteDLQTasksOlderThan = async (retentionDays) => {
  const query = `
    DELETE FROM tasks
    WHERE status = 'DLQ'
    AND updated_at < NOW() - ($1 || ' days')::INTERVAL
    RETURNING id;
  `;
  const res = await db.query(query, [retentionDays]);
  return res.rows.length;
};

/**
 * Create execution record
 */
const createExecution = async (execution) => {
  const { taskId, attempt, status, startedAt, finishedAt, durationMs, output, error, truncated } = execution;

  const query = `
    INSERT INTO task_executions 
    (task_id, attempt, status, started_at, finished_at, duration_ms, output, error, truncated)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const res = await db.query(query, [
    taskId, attempt, status, startedAt, finishedAt, durationMs, output, error, truncated
  ]);

  return res.rows[0];
};

/**
 * Get execution history for a task
 */
const getExecutionHistory = async (taskId) => {
  const query = `
    SELECT * FROM task_executions
    WHERE task_id = $1
    ORDER BY attempt DESC;
  `;

  const res = await db.query(query, [taskId]);
  return res.rows;
};

module.exports = {
  createTask,
  getPendingTasks,
  markDispatched,
  acquireLease,
  renewLease,
  updateStatus,
  getTaskById,
  // Retry & DLQ methods
  getRetryableTasks,
  resetForRetry,
  moveToDLQ,
  getDLQTasks,
  resetFromDLQ,
  deleteDLQTasksOlderThan,
  // Execution methods
  createExecution,
  getExecutionHistory
};
