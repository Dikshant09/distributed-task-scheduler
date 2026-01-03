const tasksRepo = require('../../db/repositories/tasks.repo');
const redisQueue = require('../../queue/redis-queue');
const logger = require('../../common/logger');
const metrics = require('../../common/metrics');
const config = require('../../common/config');
const leaderElection = require('../leader-election/leader-election');
const schedulerState = require('../../common/scheduler-state');

class Dispatcher {
    constructor() {
        this.isRunning = false;
        this.dispatchInterval = null;
        this.retryInterval = null;
    }

    start() {
        this.isRunning = true;
        this.dispatchInterval = setInterval(() => this._dispatchLoop(), config.scheduler.dispatchInterval);
        this.retryInterval = setInterval(() => this._retryLoop(), 5000); // Retry loop every 5s
        logger.info('Dispatcher started (dispatch + retry loops)');
    }

    stop() {
        this.isRunning = false;
        if (this.dispatchInterval) clearInterval(this.dispatchInterval);
        if (this.retryInterval) clearInterval(this.retryInterval);
        logger.info('Dispatcher stopped');
    }

    async _dispatchLoop() {
        // Check if scheduler is enabled
        const isEnabled = await schedulerState.isEnabled();
        if (!isEnabled) {
            logger.debug('Scheduler is disabled, skipping dispatch');
            return;
        }

        if (!leaderElection.isLeader) return;

        try {
            const leaderEpoch = await leaderElection.getLeaderEpoch();
            const tasks = await tasksRepo.getPendingTasks(100);

            if (tasks.length === 0) return;

            logger.info(`Found ${tasks.length} pending tasks`);

            const dispatchedIds = [];
            for (const task of tasks) {
                try {
                    // Push to Redis
                    await redisQueue.pushTask(task.id, { attempt: task.attempt || 0 });
                    dispatchedIds.push(task.id);

                    // Metrics
                    // const lag = (Date.now() - new Date(task.scheduled_at).getTime()) / 1000;
                    // metrics.dispatchLag.observe(lag);

                } catch (err) {
                    logger.error(`Failed to push task ${task.id} to Redis`, err);
                }
            }

            if (dispatchedIds.length > 0) {
                await tasksRepo.markDispatched(dispatchedIds, leaderEpoch);
                logger.info(`Dispatched ${dispatchedIds.length} tasks`);
            }

        } catch (err) {
            logger.error('Dispatch loop error', err);
        }
    }

    /**
     * Retry Loop
     * Handles FAILED tasks that are ready for retry:
     * 1. Find FAILED tasks where next_retry_at <= NOW()
     * 2. Check if they haven't exceeded max_attempts
     * 3. Reset them to PENDING for re-dispatch
     * 4. Move to DLQ if max attempts exceeded
     */
    async _retryLoop() {
        if (!leaderElection.isLeader) return;

        try {
            const retryableTasks = await tasksRepo.getRetryableTasks();

            if (retryableTasks.length === 0) return;

            logger.info(`Found ${retryableTasks.length} tasks ready for retry`);

            for (const task of retryableTasks) {
                try {
                    // Check if max attempts exceeded
                    if (task.attempt >= task.max_attempts) {
                        // Move to DLQ
                        await tasksRepo.moveToDLQ(task.id, 'Max retry attempts exceeded');
                        logger.warn(`Task ${task.id} moved to DLQ after ${task.attempt} attempts`);
                    } else {
                        // Reset to PENDING for retry
                        await tasksRepo.resetForRetry(task.id);
                        logger.info(`Task ${task.id} reset to PENDING for retry (attempt ${task.attempt + 1})`);
                    }
                } catch (err) {
                    logger.error(`Failed to process retry for task ${task.id}`, err);
                }
            }

        } catch (err) {
            logger.error('Retry loop error', err);
        }
    }

    isRunning() {
        return this.isRunning;
    }
}

module.exports = new Dispatcher();
