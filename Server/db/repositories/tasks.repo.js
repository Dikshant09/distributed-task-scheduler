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
    // For now assuming result is logged or stored elsewhere, or we add result column.
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

module.exports = {
  createTask,
  getPendingTasks,
  markDispatched,
  acquireLease,
  renewLease,
  updateStatus,
  getTaskById
};
