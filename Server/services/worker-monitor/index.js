const logger = require('../../common/logger');
const db = require('../../db');
const eventLogger = require('../../common/event-logger');
const Redis = require('ioredis');

const HEARTBEAT_TIMEOUT = 30000; // 30 seconds
const FAILED_WORKERS_KEY = 'scheduler:failed_workers';

/**
 * Worker Monitor Service
 * 
 * Responsibility: Monitor worker heartbeats and emit failure events
 * 
 * This is a STATELESS service - can run multiple instances.
 * NO leader election required.
 * 
 * Note: Lease reaping is handled by Recovery Service.
 * This service only handles detection and event emission.
 */
class WorkerMonitor {
    constructor() {
        this.isRunning = false;
        this.checkInterval = null;
        // Support both REDIS_URL (production) and default (development)
        this.redis = process.env.REDIS_URL
            ? new Redis(process.env.REDIS_URL)
            : new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379
            });
    }

    async start() {
        logger.info('Starting Worker Monitor Service...');

        this._startMonitorLoop();

        // Graceful Shutdown
        const shutdown = async () => {
            logger.info('Worker Monitor shutting down...');
            this._stopMonitorLoop();
            this.redis.quit();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    _startMonitorLoop() {
        this.isRunning = true;
        this.checkInterval = setInterval(() => this._checkWorkers(), 15000); // Every 15s
        logger.info('Worker monitor loop started (every 15s)');
    }

    _stopMonitorLoop() {
        this.isRunning = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger.info('Worker monitor loop stopped');
    }

    async markWorkerAsFailed(workerId) {
        await this.redis.sadd(FAILED_WORKERS_KEY, workerId);
    }

    async isWorkerMarkedAsFailed(workerId) {
        const isMember = await this.redis.sismember(FAILED_WORKERS_KEY, workerId);
        return isMember === 1;
    }

    async markWorkerAsRecovered(workerId) {
        await this.redis.srem(FAILED_WORKERS_KEY, workerId);
    }

    async _checkWorkers() {
        try {
            // Find workers that haven't sent heartbeat
            const query = `
                SELECT worker_id, last_heartbeat
                FROM workers
                WHERE last_heartbeat < NOW() - INTERVAL '${HEARTBEAT_TIMEOUT / 1000} seconds'
            `;
            const result = await db.query(query);
            const deadWorkers = result.rows;

            if (deadWorkers.length > 0) {
                for (const w of deadWorkers) {
                    const alreadyFailed = await this.isWorkerMarkedAsFailed(w.worker_id);

                    if (!alreadyFailed) {
                        logger.warn(`Worker ${w.worker_id} failed (missed heartbeats)`);

                        eventLogger.log('WORKER_FAILED', `Worker ${w.worker_id} failed (missed heartbeats)`, {
                            workerId: w.worker_id,
                            lastHeartbeat: w.last_heartbeat
                        });

                        await this.markWorkerAsFailed(w.worker_id);
                    }
                }
            }

            // Check for recovered workers
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

const monitor = new WorkerMonitor();

if (require.main === module) {
    monitor.start();
}

module.exports = monitor;
