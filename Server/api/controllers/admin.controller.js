const logger = require('../../common/logger');
const dispatcher = require('../../scheduler/task-dispatcher/dispatcher');
const workerMonitor = require('../../scheduler/heartbeat/worker-monitor');
const dlqHandler = require('../../scheduler/dead-letter/dlq-handler');
const processRegistry = require('../../common/process-registry');
const schedulerState = require('../../common/scheduler-state');
const eventLogger = require('../../common/event-logger');

/**
 * POST /admin/scheduler/enable
 * Enable the scheduler (start dispatcher, worker monitor, DLQ handler)
 */
const enableScheduler = async (req, res, next) => {
    try {
        logger.info('Enabling scheduler via admin API');

        await schedulerState.setEnabled(true);
        dispatcher.start();
        workerMonitor.start();
        dlqHandler.start();

        eventLogger.log('SCHEDULER_ENABLED', 'Scheduler enabled via admin API');

        res.json({
            status: 'success',
            message: 'Scheduler enabled'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/scheduler/disable
 * Disable the scheduler (stop dispatcher, worker monitor, DLQ handler)
 */
const disableScheduler = async (req, res, next) => {
    try {
        logger.info('Disabling scheduler via admin API');

        await schedulerState.setEnabled(false);
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();

        eventLogger.log('SCHEDULER_DISABLED', 'Scheduler disabled via admin API');

        res.json({
            status: 'success',
            message: 'Scheduler disabled'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/faults/kill-leader
 * Simulate leader failure by killing the current leader process
 */
const killLeader = async (req, res, next) => {
    try {
        logger.warn('FAULT INJECTION: Kill leader requested');

        const leader = await processRegistry.getLeader();

        if (!leader) {
            return res.status(404).json({
                status: 'error',
                message: 'No leader to kill - all schedulers are already stopped'
            });
        }

        logger.warn(`Killing leader ${leader.id} (PID: ${leader.pid})`);

        try {
            process.kill(leader.pid, 'SIGTERM');

            // Log admin-initiated kill event
            eventLogger.log('LEADER_KILLED', `Leader ${leader.id} killed by admin`, {
                leaderId: leader.id,
                pid: leader.pid,
                reason: 'admin_fault_injection'
            });

            // Emit WebSocket update for immediate topology refresh
            const { emitInstanceUpdate } = require('../websocket');
            setTimeout(() => emitInstanceUpdate(), 500);

            res.json({
                status: 'success',
                message: `Leader ${leader.id} (PID: ${leader.pid}) killed. Standby should become leader within 10-15 seconds.`,
                data: {
                    killedLeader: leader.id,
                    pid: leader.pid
                }
            });
        } catch (killError) {
            logger.error('Failed to kill leader process', killError);
            res.status(500).json({
                status: 'error',
                message: `Failed to kill leader process: ${killError.message}`
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/faults/kill-worker
 * Simulate worker failure by killing a worker process
 * Optional body param: { workerId: 'worker-xxx' } to kill specific worker
 */
const killWorker = async (req, res, next) => {
    try {
        const { workerId } = req.body || {};
        logger.warn(`FAULT INJECTION: Kill worker requested${workerId ? ` (${workerId})` : ' (random)'}`);

        const workers = await processRegistry.getWorkers();

        if (workers.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'No workers left to kill - all workers are already stopped'
            });
        }

        // Select worker to kill
        let targetWorker;
        if (workerId) {
            targetWorker = workers.find(w => w.id === workerId);
            if (!targetWorker) {
                return res.status(404).json({
                    status: 'error',
                    message: `Worker ${workerId} not found`
                });
            }
        } else {
            // Kill random worker
            targetWorker = workers[Math.floor(Math.random() * workers.length)];
        }

        logger.warn(`Killing worker ${targetWorker.id} (PID: ${targetWorker.pid})`);

        try {
            process.kill(targetWorker.pid, 'SIGTERM');

            // Immediately update worker's last_heartbeat to mark it as dead
            // This ensures UI shows worker as dead instantly, not after 30s timeout
            const db = require('../../db');
            await db.query(
                `UPDATE workers SET last_heartbeat = NOW() - INTERVAL '1 hour' WHERE worker_id = $1`,
                [targetWorker.id]
            );

            // Log admin-initiated kill event
            eventLogger.log('WORKER_KILLED', `Worker ${targetWorker.id} killed by admin`, {
                workerId: targetWorker.id,
                pid: targetWorker.pid,
                reason: 'admin_fault_injection'
            });

            // Mark worker as failed to prevent duplicate WORKER_FAILED event
            const workerMonitor = require('../../scheduler/heartbeat/worker-monitor');
            workerMonitor.markWorkerAsFailed(targetWorker.id);

            // Emit WebSocket update for immediate topology refresh
            const { emitInstanceUpdate } = require('../websocket');
            setTimeout(() => emitInstanceUpdate(), 100); // Reduced delay to 100ms

            res.json({
                status: 'success',
                message: `Worker ${targetWorker.id} (PID: ${targetWorker.pid}) killed. Tasks will be reassigned after lease expiry.`,
                data: {
                    killedWorker: targetWorker.id,
                    pid: targetWorker.pid
                }
            });
        } catch (killError) {
            logger.error('Failed to kill worker process', killError);
            res.status(500).json({
                status: 'error',
                message: `Failed to kill worker process: ${killError.message}`
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/faults/pause-queue
 * Simulate Redis queue pause (stops dispatcher temporarily)
 */
const pauseQueue = async (req, res, next) => {
    try {
        const { duration = 10000 } = req.body;

        logger.warn(`FAULT INJECTION: Pausing queue for ${duration}ms`);

        dispatcher.stop();

        setTimeout(() => {
            logger.info('Resuming queue after fault injection');
            dispatcher.start();
        }, duration);

        res.json({
            status: 'success',
            message: `Queue paused for ${duration}ms`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /admin/dlq
 * Get all tasks in Dead Letter Queue
 */
const getDLQTasks = async (req, res, next) => {
    try {
        const tasksRepo = require('../../db/repositories/tasks.repo');
        const dlqTasks = await tasksRepo.getDLQTasks(100);

        res.json({
            status: 'success',
            data: { tasks: dlqTasks, count: dlqTasks.length }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/dlq/:id/retry
 * Manually retry a task from DLQ
 */
const retryFromDLQ = async (req, res, next) => {
    try {
        const { id } = req.params;
        const dlqHandler = require('../../scheduler/dead-letter/dlq-handler');

        const success = await dlqHandler.retryFromDLQ(id);

        if (success) {
            res.json({
                status: 'success',
                message: `Task ${id} reset from DLQ and will be retried`
            });
        } else {
            res.status(400).json({
                status: 'error',
                message: `Failed to retry task ${id} from DLQ`
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/dlq/cleanup
 * Clean up old DLQ tasks
 */
const cleanupDLQ = async (req, res, next) => {
    try {
        const { retentionDays = 30 } = req.body;
        const dlqHandler = require('../../scheduler/dead-letter/dlq-handler');

        await dlqHandler.cleanupOldTasks(retentionDays);

        res.json({
            status: 'success',
            message: `DLQ cleanup initiated for tasks older than ${retentionDays} days`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/system/reset
 * Reset the entire system for demos - clears all tasks and events
 */
const resetSystem = async (req, res, next) => {
    try {
        logger.warn('SYSTEM RESET: Full system reset requested');

        const db = require('../../db');
        const { redis } = require('../../queue/redis-queue');

        // 1. Clear all tasks from database
        const deletedTasks = await db.query('DELETE FROM tasks RETURNING id');
        logger.info(`Deleted ${deletedTasks.rowCount} tasks`);

        // 2. Clear task executions
        await db.query('DELETE FROM task_executions');
        logger.info('Cleared task executions');

        // 3. Clear Redis stream (delete and let it be recreated on next dispatch)
        try {
            // Delete the entire stream - this clears both stream entries AND pending list
            await redis.del('task-stream');
            logger.info('Cleared Redis task stream');
        } catch (redisErr) {
            logger.warn('Could not clear Redis stream:', redisErr.message);
        }

        // 4. Clear events from Redis
        try {
            await redis.del('system:events');
            logger.info('Cleared system events');
        } catch (redisErr) {
            logger.warn('Could not clear events:', redisErr.message);
        }

        // Log the reset event
        eventLogger.log('SYSTEM_RESET', 'System reset via admin API', {
            deletedTasks: deletedTasks.rowCount,
            reason: 'admin_demo_reset'
        });

        // Emit WebSocket update
        const { emitInstanceUpdate } = require('../websocket');
        setTimeout(() => emitInstanceUpdate(), 500);

        res.json({
            status: 'success',
            message: 'System reset complete. All tasks and events cleared.',
            data: {
                deletedTasks: deletedTasks.rowCount,
                clearedQueue: true,
                clearedEvents: true
            }
        });
    } catch (error) {
        logger.error('System reset failed:', error);
        next(error);
    }
};

module.exports = {
    enableScheduler,
    disableScheduler,
    killLeader,
    killWorker,
    pauseQueue,
    getDLQTasks,
    retryFromDLQ,
    cleanupDLQ,
    resetSystem
};
