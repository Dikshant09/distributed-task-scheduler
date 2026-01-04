const logger = require('../../common/logger');
const tasksRepo = require('../../db/repositories/tasks.repo');
const db = require('../../db');
const eventLogger = require('../../common/event-logger');

/**
 * Recovery Service
 * 
 * Responsibilities:
 * 1. Retry Handler - Reset FAILED tasks to PENDING
 * 2. DLQ Handler - Monitor and manage Dead Letter Queue
 * 3. Lease Reaper - Reclaim tasks with expired leases
 * 
 * This is a STATELESS service - can run multiple instances.
 * NO leader election required.
 */
class RecoveryService {
    constructor() {
        this.isRunning = false;
        this.retryInterval = null;
        this.dlqInterval = null;
        this.leaseInterval = null;
    }

    async start() {
        logger.info('Starting Recovery Service...');

        this._startRetryLoop();
        this._startDLQMonitor();
        this._startLeaseReaper();

        // Graceful Shutdown
        const shutdown = async () => {
            logger.info('Recovery Service shutting down...');
            this._stopAll();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    _stopAll() {
        this.isRunning = false;
        if (this.retryInterval) clearInterval(this.retryInterval);
        if (this.dlqInterval) clearInterval(this.dlqInterval);
        if (this.leaseInterval) clearInterval(this.leaseInterval);
        logger.info('All recovery loops stopped');
    }

    // ============ RETRY HANDLER ============

    _startRetryLoop() {
        this.retryInterval = setInterval(() => this._retryLoop(), 5000); // Every 5s
        logger.info('Retry loop started (every 5s)');
    }

    /**
     * Retry Loop:
     * 1. Find FAILED tasks where next_retry_at <= NOW()
     * 2. Check max_attempts
     * 3. Reset to PENDING or move to DLQ
     */
    async _retryLoop() {
        try {
            const retryableTasks = await tasksRepo.getRetryableTasks(100);

            if (retryableTasks.length === 0) return;

            logger.info(`Found ${retryableTasks.length} tasks ready for retry`);

            for (const task of retryableTasks) {
                try {
                    if (task.attempt >= task.max_attempts) {
                        await tasksRepo.moveToDLQ(task.id, 'Max retry attempts exceeded');
                        logger.warn(`Task ${task.id} moved to DLQ after ${task.attempt} attempts`);

                        eventLogger.log('TASK_DLQ', `Task ${task.id.substring(0, 8)} moved to DLQ`, {
                            taskId: task.id,
                            attempts: task.attempt
                        });
                    } else {
                        await tasksRepo.resetForRetry(task.id);
                        logger.info(`Task ${task.id} reset to PENDING for retry (attempt ${task.attempt + 1})`);

                        eventLogger.log('TASK_RETRY', `Task ${task.id.substring(0, 8)} queued for retry`, {
                            taskId: task.id,
                            attempt: task.attempt + 1
                        });
                    }
                } catch (err) {
                    logger.error(`Failed to process retry for task ${task.id}`, err);
                }
            }
        } catch (err) {
            logger.error('Retry loop error', err);
        }
    }

    // ============ DLQ MONITOR ============

    _startDLQMonitor() {
        this.dlqInterval = setInterval(() => this._monitorDLQ(), 30000); // Every 30s
        logger.info('DLQ monitor started (every 30s)');
    }

    async _monitorDLQ() {
        try {
            const dlqTasks = await tasksRepo.getDLQTasks(100);

            if (dlqTasks.length === 0) return;

            logger.warn(`DLQ contains ${dlqTasks.length} failed tasks`);

            if (dlqTasks.length > 100) {
                logger.error(`⚠️  DLQ size critical: ${dlqTasks.length} tasks!`);
            }
        } catch (err) {
            logger.error('DLQ monitor error', err);
        }
    }

    // ============ LEASE REAPER ============

    _startLeaseReaper() {
        this.leaseInterval = setInterval(() => this._reapExpiredLeases(), 15000); // Every 15s
        logger.info('Lease reaper started (every 15s)');
    }

    /**
     * Lease Reaper:
     * Find RUNNING tasks with expired leases and reset to PENDING
     * This handles worker crashes mid-execution
     */
    async _reapExpiredLeases() {
        try {
            const query = `
                UPDATE tasks
                SET status = 'PENDING',
                    assigned_worker_id = NULL,
                    lease_expiry = NULL,
                    updated_at = NOW()
                WHERE status = 'RUNNING'
                AND lease_expiry < NOW()
                RETURNING id, assigned_worker_id;
            `;

            const result = await db.query(query);
            const reaped = result.rows;

            if (reaped.length > 0) {
                logger.warn(`Reaped ${reaped.length} tasks with expired leases`);

                reaped.forEach(task => {
                    eventLogger.log('TASK_LEASE_EXPIRED', `Task ${task.id.substring(0, 8)} lease expired, resetting`, {
                        taskId: task.id,
                        previousWorker: task.assigned_worker_id
                    });
                });
            }
        } catch (err) {
            logger.error('Lease reaper error', err);
        }
    }

    // ============ ADMIN METHODS ============

    async retryFromDLQ(taskId) {
        try {
            await tasksRepo.resetFromDLQ(taskId);
            logger.info(`Task ${taskId} manually retried from DLQ`);
            return true;
        } catch (err) {
            logger.error(`Failed to retry task ${taskId} from DLQ`, err);
            return false;
        }
    }

    async cleanupOldDLQTasks(retentionDays = 30) {
        try {
            const deleted = await tasksRepo.deleteDLQTasksOlderThan(retentionDays);
            if (deleted > 0) {
                logger.info(`Cleaned up ${deleted} DLQ tasks older than ${retentionDays} days`);
            }
            return deleted;
        } catch (err) {
            logger.error('DLQ cleanup error', err);
            return 0;
        }
    }
}

const recovery = new RecoveryService();

if (require.main === module) {
    recovery.start();
}

module.exports = recovery;
