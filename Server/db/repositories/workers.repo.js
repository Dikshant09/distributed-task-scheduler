const db = require('../index');

const upsertHeartbeat = async (workerId) => {
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

module.exports = {
    upsertHeartbeat,
    getDeadWorkers
};
