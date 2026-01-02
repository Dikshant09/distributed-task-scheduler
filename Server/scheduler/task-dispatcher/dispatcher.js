const tasksRepo = require('../../db/repositories/tasks.repo');
const redisQueue = require('../../queue/redis-queue');
const logger = require('../../common/logger');
const metrics = require('../../common/metrics');
const config = require('../../common/config');
const leaderElection = require('../leader-election/leader-election');

class Dispatcher {
    constructor() {
        this.isRunning = false;
        this.dispatchInterval = null;
        this.retryInterval = null;
    }

    start() {
        this.isRunning = true;
        this.dispatchInterval = setInterval(() => this._dispatchLoop(), config.scheduler.dispatchInterval);
        // this.retryInterval = setInterval(() => this._retryLoop(), 5000); // Retry loop roughly every 5s
        logger.info('Dispatcher started');
    }

    stop() {
        this.isRunning = false;
        if (this.dispatchInterval) clearInterval(this.dispatchInterval);
        if (this.retryInterval) clearInterval(this.retryInterval);
        logger.info('Dispatcher stopped');
    }

    async _dispatchLoop() {
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

    // Retry loop handles FAILED -> DISPATCHED transitions?
    // Current logic: Worker sets FAILED + next_retry_at.
    // We need a loop to find FAILED tasks where next_retry_at <= NOW() and reset them to PENDING/DISPATCHED?
    // Or just pick them up in getPendingTasks if we modify the query?
    // getPendingTasks query: status='PENDING'.
    // We should prob have a separate process that moves FAILED -> PENDING when time is up.
    // Let's add that logic here or in _retryLoop.

    async _retryLoop() {
        // TODO: Implement picking up FAILED tasks ready for retry and setting them to PENDING
        // tasksRepo.resetFailedTasks();
    }
}

module.exports = new Dispatcher();
