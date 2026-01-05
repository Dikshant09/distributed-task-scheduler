const logger = require('../../common/logger');
const tasksRepo = require('../../db/repositories/tasks.repo');
const redisQueue = require('../../queue/redis-queue');
const eventLogger = require('../../common/event-logger');
const config = require('../../common/config');
const schedulerState = require('../../common/scheduler-state');

/**
 * Dispatcher Service
 * 
 * Responsibility: Poll READY tasks, push to Redis, mark DISPATCHED
 * 
 * This is a STATELESS service - can run multiple instances.
 * NO leader election required.
 * Uses atomic DB operations to prevent duplicate dispatch.
 */
class Dispatcher {
    constructor() {
        this.isRunning = false;
        this.dispatchInterval = null;
    }

    async start() {
        logger.info('Starting Dispatcher Service...');

        // Initialize Redis consumer group
        await redisQueue.initGroup();

        this._startDispatchLoop();

        // Graceful Shutdown
        const shutdown = async () => {
            logger.info('Dispatcher shutting down...');
            this._stopDispatchLoop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    _startDispatchLoop() {
        this.isRunning = true;
        // Run slightly faster than coordinator to pick up READY tasks quickly
        const interval = config.scheduler?.dispatchInterval || 2000;
        this.dispatchInterval = setInterval(() => this._dispatchLoop(), interval);
        logger.info(`Dispatch loop started (every ${interval}ms)`);
    }

    _stopDispatchLoop() {
        this.isRunning = false;
        if (this.dispatchInterval) {
            clearInterval(this.dispatchInterval);
            this.dispatchInterval = null;
        }
        logger.info('Dispatch loop stopped');
    }

    /**
     * The dispatch loop:
     * 1. Atomically get READY tasks and mark them DISPATCHED
     * 2. Push each to Redis
     * 3. If Redis push fails, the task stays DISPATCHED but not in queue
     *    (Recovery service will handle this edge case)
     */
    async _dispatchLoop() {
        // Check if scheduler is enabled
        const isEnabled = await schedulerState.isEnabled();
        if (!isEnabled) {
            logger.debug('Scheduler is disabled, skipping dispatch loop');
            return;
        }

        // Check if queue is paused (separate from scheduler disabled)
        const isQueuePaused = await schedulerState.isQueuePaused();
        if (isQueuePaused) {
            logger.debug('Queue is paused, skipping dispatch loop (tasks accumulate in READY state)');
            return;
        }

        try {
            // Atomic: GET + UPDATE in one query to prevent race conditions
            const tasks = await tasksRepo.dispatchReadyTasks(100);

            if (tasks.length === 0) return;

            logger.info(`Dispatching ${tasks.length} tasks to Redis`);

            for (const task of tasks) {
                try {
                    await redisQueue.pushTask(task.id, { attempt: task.attempt || 0 });

                    eventLogger.log('TASK_DISPATCHED', `Task ${task.id.substring(0, 8)} dispatched to Redis`, {
                        taskId: task.id
                    });
                } catch (err) {
                    // If Redis push fails, task is already DISPATCHED in DB
                    // Recovery service should detect and handle stale DISPATCHED tasks
                    logger.error(`Failed to push task ${task.id} to Redis`, err);
                }
            }

            logger.info(`Dispatched ${tasks.length} tasks`);
        } catch (err) {
            logger.error('Dispatch loop error', err);
        }
    }
}

const dispatcher = new Dispatcher();

if (require.main === module) {
    dispatcher.start();
}

module.exports = dispatcher;
