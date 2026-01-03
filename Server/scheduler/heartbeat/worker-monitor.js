const logger = require('../../common/logger');
const db = require('../../db');
const eventLogger = require('../../common/event-logger');
const Redis = require('ioredis');

const HEARTBEAT_TIMEOUT = 30000; // 30 seconds
const FAILED_WORKERS_KEY = 'scheduler:failed_workers';

class WorkerMonitor {
    constructor() {
        this.interval = null;
        this.redis = new Redis({
            host: 'localhost',
            port: 6379
        });
    }

    start() {
        logger.info('Starting Worker Monitor...');
        this.interval = setInterval(() => this._checkWorkers(), 15000); // Check every 15 seconds
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('Worker Monitor stopped');
        }
    }

    // Public method to mark a worker as failed (e.g., when admin kills it)
    async markWorkerAsFailed(workerId) {
        await this.redis.sadd(FAILED_WORKERS_KEY, workerId);
        logger.debug(`Worker ${workerId} marked as failed in Redis (will not log duplicate failure events)`);
    }

    // Check if worker is already marked as failed
    async isWorkerMarkedAsFailed(workerId) {
        const isMember = await this.redis.sismember(FAILED_WORKERS_KEY, workerId);
        return isMember === 1;
    }

    // Remove worker from failed set (when it recovers)
    async markWorkerAsRecovered(workerId) {
        await this.redis.srem(FAILED_WORKERS_KEY, workerId);
        logger.debug(`Worker ${workerId} removed from failed workers set`);
    }

    async _checkWorkers() {
        try {
            // Find workers that haven't sent heartbeat in HEARTBEAT_TIMEOUT
            const query = `
                SELECT worker_id, last_heartbeat
                FROM workers
                WHERE last_heartbeat < NOW() - INTERVAL '${HEARTBEAT_TIMEOUT / 1000} seconds'
            `;
            const result = await db.query(query);
            const deadWorkers = result.rows;

            if (deadWorkers.length > 0) {
                for (const w of deadWorkers) {
                    // Only log failure event once per worker (check Redis)
                    const alreadyFailed = await this.isWorkerMarkedAsFailed(w.worker_id);

                    if (!alreadyFailed) {
                        logger.warn(`Worker ${w.worker_id} failed (missed heartbeats)`);

                        eventLogger.log('WORKER_FAILED', `Worker ${w.worker_id} failed (missed heartbeats)`, {
                            workerId: w.worker_id,
                            lastHeartbeat: w.last_heartbeat
                        });

                        await this.markWorkerAsFailed(w.worker_id);
                    }

                    // Reclaim tasks from dead worker
                    const reclaimQuery = `
                        UPDATE tasks
                        SET status = 'PENDING', assigned_worker_id = NULL, updated_at = NOW()
                        WHERE assigned_worker_id = $1 AND status = 'RUNNING'
                    `;
                    const res = await db.query(reclaimQuery, [w.worker_id]);
                    if (res.rowCount > 0) {
                        logger.info(`Reclaimed ${res.rowCount} tasks from dead worker ${w.worker_id}`);
                    }
                }
            }

            // Check for recovered workers (were failed, now have recent heartbeat)
            const failedWorkerIds = await this.redis.smembers(FAILED_WORKERS_KEY);

            if (failedWorkerIds.length > 0) {
                const aliveQuery = `
                    SELECT worker_id
                    FROM workers
                    WHERE last_heartbeat >= NOW() - INTERVAL '15 seconds'
                    AND worker_id = ANY($1)
                `;
                const aliveResult = await db.query(aliveQuery, [failedWorkerIds]);
                const recoveredWorkers = aliveResult.rows;

                for (const worker of recoveredWorkers) {
                    logger.info(`Worker ${worker.worker_id} recovered`);

                    eventLogger.log('WORKER_RECOVERED', `Worker ${worker.worker_id} recovered`, {
                        workerId: worker.worker_id
                    });

                    await this.markWorkerAsRecovered(worker.worker_id);
                }
            }
        } catch (err) {
            logger.error('Worker Monitor error', err);
        }
    }
}

module.exports = new WorkerMonitor();
