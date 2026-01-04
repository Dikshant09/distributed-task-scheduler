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
 * Simulate Redis queue pause (pauses dispatcher temporarily)
 * 
 * Semantic difference from "Disable Scheduler":
 * - Disable Scheduler: Stops BOTH coordinator and dispatcher
 * - Pause Queue: Only pauses dispatcher, coordinator continues marking PENDING → READY
 *   (tasks accumulate in READY state until resumed)
 * 
 * Works with both V1 (monolithic) and V2 (SRP) architectures via scheduler state
 */
const pauseQueue = async (req, res, next) => {
    try {
        const { duration = 10000 } = req.body;

        logger.warn(`FAULT INJECTION: Pausing queue for ${duration}ms`);

        // Use queuePaused state (only affects dispatcher, not coordinator)
        await schedulerState.setQueuePaused(true);

        eventLogger.log('QUEUE_PAUSED', `Queue paused for ${duration}ms via fault injection`, {
            duration,
            reason: 'admin_fault_injection'
        });

        // Also stop local dispatcher if running in V1 mode (same process)
        try {
            dispatcher.stop();
        } catch (e) {
            // Ignore - dispatcher may not be running in this process (V2 mode)
        }

        setTimeout(async () => {
            logger.info('Resuming queue after fault injection');
            await schedulerState.setQueuePaused(false);

            // Also start local dispatcher if running in V1 mode
            try {
                dispatcher.start();
            } catch (e) {
                // Ignore - dispatcher may not be running in this process (V2 mode)
            }

            eventLogger.log('QUEUE_RESUMED', 'Queue resumed after fault injection', {
                duration,
                reason: 'auto_resume'
            });
        }, duration);

        res.json({
            status: 'success',
            message: `Queue paused for ${duration}ms (tasks accumulate in READY state)`
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

/**
 * POST /admin/faults/network-delay
 * Simulate network delay by pausing the queue temporarily
 * This causes tasks to accumulate in READY state
 */
const networkDelay = async (req, res, next) => {
    try {
        const { duration = 5000 } = req.body;

        logger.warn(`FAULT INJECTION: Simulating network delay for ${duration}ms`);

        // Use queuePaused state to simulate network delay
        await schedulerState.setQueuePaused(true);

        eventLogger.log('NETWORK_DELAY_START', `Network delay simulation started (${duration}ms)`, {
            duration,
            reason: 'admin_fault_injection'
        });

        setTimeout(async () => {
            logger.info('Network delay simulation ended');
            await schedulerState.setQueuePaused(false);

            eventLogger.log('NETWORK_DELAY_END', 'Network delay simulation ended', {
                duration,
                reason: 'auto_resume'
            });
        }, duration);

        res.json({
            status: 'success',
            message: `Network delay simulated for ${duration}ms`,
            data: {
                duration,
                effect: 'Tasks accumulate in READY state until delay ends'
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /admin/scheduler/status
 * Get current scheduler status (enabled/disabled, queue paused)
 */
const getSchedulerStatus = async (req, res, next) => {
    try {
        const isEnabled = await schedulerState.isEnabled();
        const isQueuePaused = await schedulerState.isQueuePaused();
        const leader = await processRegistry.getLeader();

        res.json({
            status: 'success',
            data: {
                enabled: isEnabled,
                queuePaused: isQueuePaused,
                leader: leader ? {
                    id: leader.id,
                    pid: leader.pid,
                    since: leader.startedAt
                } : null
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/faults/kill-worker-mid-task
 * FAST DEMO: Kill worker mid-task and show recovery within 10 seconds
 * 
 * Flow:
 * 1. Create task (1s delay)
 * 2. Wait 1s for worker to pick up
 * 3. Kill worker
 * 4. Immediately expire lease
 * 5. Another worker picks up and completes (~1s)
 * Total: ~3-5 seconds
 */
const killWorkerMidTask = async (req, res, next) => {
    try {
        const tasksRepo = require('../../db/repositories/tasks.repo');
        const { generateId } = require('../../common/utils/uuid');
        const db = require('../../db');

        logger.warn('FAULT INJECTION: Kill worker mid-task fast demo');

        // 1. Create a fast task (1 second delay)
        const taskId = generateId();
        await tasksRepo.createTask({
            id: taskId,
            type: 'HTTP',
            payload: { url: 'https://httpbin.org/delay/1' },
            scheduledAt: new Date(),
            idempotencyKey: `demo-kill-${Date.now()}`
        });

        eventLogger.log('DEMO_TASK_CREATED', `Fast demo task ${taskId.substring(0, 8)} created`, {
            taskId
        });

        // 2. Wait for worker to pick it up (1.5s should be enough)
        setTimeout(async () => {
            try {
                const task = await tasksRepo.getTaskById(taskId);

                if (task && task.worker_id && task.status === 'RUNNING') {
                    const workerId = task.worker_id;

                    // 3. Kill the worker
                    logger.warn(`DEMO: Killing worker ${workerId} mid-task`);
                    const workers = await processRegistry.getWorkers();
                    const targetWorker = workers.find(w => w.id === workerId);

                    if (targetWorker) {
                        process.kill(targetWorker.pid, 'SIGTERM');

                        eventLogger.log('WORKER_KILLED_MID_TASK', `Worker ${workerId} killed mid-task`, {
                            workerId,
                            taskId
                        });

                        // 3.5. Clean up stale Redis pending entries from the killed worker
                        const { redis } = require('../../queue/redis-queue');
                        try {
                            // Get pending entries for this worker and ACK them
                            const pending = await redis.xpending('task-stream', 'workers-group', '-', '+', 10, workerId);
                            for (const entry of pending) {
                                const messageId = entry[0];
                                await redis.xack('task-stream', 'workers-group', messageId);
                                logger.info(`Cleaned up stale Redis message ${messageId} from killed worker`);
                            }
                        } catch (err) {
                            logger.warn('Could not clean Redis pending entries', err.message);
                        }

                        // 4. FAST: Immediately expire the lease and reset to PENDING
                        await db.query(`
                            UPDATE tasks 
                            SET status = 'PENDING',
                                assigned_worker_id = NULL,
                                lease_expiry = NULL,
                                updated_at = NOW()
                            WHERE id = $1
                        `, [taskId]);

                        eventLogger.log('TASK_LEASE_EXPIRED', `Task ${taskId.substring(0, 8)} lease expired (fast)`, {
                            taskId,
                            previousWorker: workerId
                        });

                        // 5. Mark READY so another worker picks it up immediately
                        await db.query(`
                            UPDATE tasks 
                            SET status = 'READY', updated_at = NOW()
                            WHERE id = $1
                        `, [taskId]);

                        eventLogger.log('TASK_READY', `Task ${taskId.substring(0, 8)} marked READY for recovery`, {
                            taskId
                        });
                    }
                } else if (task && task.status === 'SUCCESS') {
                    logger.info('Task completed before we could kill worker');
                } else {
                    logger.info('Task not yet running, will retry');
                }
            } catch (err) {
                logger.error('Demo error', err);
            }
        }, 1500);

        res.json({
            status: 'success',
            message: 'Fast demo started. Worker will be killed in ~1.5s, task recovered immediately.',
            data: {
                taskId,
                expectedFlow: [
                    '1. Task created → PENDING → READY → DISPATCHED',
                    '2. Worker picks up → RUNNING (1.5s)',
                    '3. Worker killed',
                    '4. Lease expired immediately',
                    '5. Task reset → READY',
                    '6. Another worker picks up → SUCCESS (~1s)',
                ],
                totalTime: '~5 seconds'
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    enableScheduler,
    disableScheduler,
    killLeader,
    killWorker,
    killWorkerMidTask,
    pauseQueue,
    networkDelay,
    getSchedulerStatus,
    getDLQTasks,
    retryFromDLQ,
    cleanupDLQ,
    resetSystem
};
