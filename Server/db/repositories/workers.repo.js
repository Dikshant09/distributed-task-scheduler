const db = require('../index');

const upsertHeartbeat = async (workerId) => {
  // Enforce max 3 workers limit (matching demo configuration)
  const countRes = await db.query('SELECT COUNT(*) FROM workers');
  const workerCount = parseInt(countRes.rows[0].count);

  // If we're at the limit and this is a new worker, remove the oldest one
  if (workerCount >= 3) {
    const existingWorker = await db.query('SELECT 1 FROM workers WHERE worker_id = $1', [workerId]);

    if (existingWorker.rows.length === 0) {
      // New worker and we're at limit - remove oldest worker
      await db.query(`
        DELETE FROM workers 
        WHERE worker_id = (
          SELECT worker_id FROM workers 
          ORDER BY last_heartbeat ASC 
          LIMIT 1
        )
      `);
    }
  }

  // Now upsert the heartbeat
  const query = `
    INSERT INTO workers (worker_id, last_heartbeat, status)
    VALUES ($1, NOW(), 'ALIVE')
    ON CONFLICT (worker_id)
    DO UPDATE SET last_heartbeat = NOW(), status = 'ALIVE';
  `;
  await db.query(query, [workerId]);
};

const getDeadWorkers = async (timeoutSeconds = 15) => {
  const query = `
    SELECT worker_id
    FROM workers
    WHERE last_heartbeat < NOW() - ($1 || ' seconds')::INTERVAL;
  `;
  const res = await db.query(query, [timeoutSeconds]);
  return res.rows;
};

const getActiveWorkers = async (timeoutSeconds = 15) => {
  const query = `
    SELECT worker_id, last_heartbeat, status
    FROM workers
    WHERE last_heartbeat >= NOW() - ($1 || ' seconds')::INTERVAL
    AND status = 'ALIVE';
  `;
  const res = await db.query(query, [timeoutSeconds]);
  return res.rows;
};

module.exports = {
  upsertHeartbeat,
  getDeadWorkers,
  getActiveWorkers
};
