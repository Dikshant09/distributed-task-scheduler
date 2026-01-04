const logger = require('../../common/logger');
const leaderElection = require('../../scheduler/leader-election/leader-election');
const tasksRepo = require('../../db/repositories/tasks.repo');
const processRegistry = require('../../common/process-registry');
const eventLogger = require('../../common/event-logger');
const config = require('../../common/config');
const schedulerState = require('../../common/scheduler-state');

/**
 * Scheduler Coordinator Service
 * 
 * ONLY responsibility: Mark PENDING tasks as READY when scheduled_at <= NOW()
 * 
 * This is the ONLY leader-elected service.
 * Does NOT push to Redis - that's the Dispatcher's job.
 * Does NOT handle retries - that's the Recovery Service's job.
 */
class SchedulerCoordinator {
    constructor() {
        this.isRunning = false;
        this.scheduleInterval = null;
    }

    async start() {
        logger.info('Starting Scheduler Coordinator Service...');

        const coordinatorId = leaderElection.getLeaderId();
        await processRegistry.registerScheduler(coordinatorId, process.pid, false);

        await leaderElection.start();

        leaderElection.on('elected', async () => {
            logger.info('Became Leader. Starting scheduling loop...');
            await processRegistry.updateSchedulerLeader(coordinatorId, true);
            this._startSchedulingLoop();
        });

        leaderElection.on('lost', async () => {
            logger.info('Lost Leadership. Stopping scheduling loop...');
            await processRegistry.updateSchedulerLeader(coordinatorId, false);
            this._stopSchedulingLoop();
        });

        // Graceful Shutdown
        const shutdown = async () => {
            logger.info('Scheduler Coordinator shutting down...');
            await processRegistry.unregisterScheduler(coordinatorId);
            this._stopSchedulingLoop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    _startSchedulingLoop() {
        this.isRunning = true;
        // Run every 2 seconds (configurable)
        const interval = config.scheduler?.dispatchInterval || 2000;
        this.scheduleInterval = setInterval(() => this._schedulingLoop(), interval);
        logger.info(`Scheduling loop started (every ${interval}ms)`);
    }

    _stopSchedulingLoop() {
        this.isRunning = false;
        if (this.scheduleInterval) {
            clearInterval(this.scheduleInterval);
            this.scheduleInterval = null;
        }
        logger.info('Scheduling loop stopped');
    }

    /**
     * The scheduling loop:
     * 1. Find PENDING tasks where scheduled_at <= NOW()
     * 2. Mark them as READY
     * 3. That's it! Dispatcher will handle the rest.
     */
    async _schedulingLoop() {
        // Check if scheduler is enabled
        const isEnabled = await schedulerState.isEnabled();
        if (!isEnabled) {
            logger.debug('Scheduler is disabled, skipping scheduling loop');
            return;
        }

        if (!leaderElection.isLeader) return;

        try {
            const leaderEpoch = await leaderElection.getLeaderEpoch();
            const readyTasks = await tasksRepo.markReady(leaderEpoch, 100);

            if (readyTasks.length > 0) {
                logger.info(`Marked ${readyTasks.length} tasks as READY`);

                readyTasks.forEach(task => {
                    eventLogger.log('TASK_READY', `Task ${task.id.substring(0, 8)} marked READY`, {
                        taskId: task.id
                    });
                });
            }
        } catch (err) {
            logger.error('Scheduling loop error', err);
        }
    }
}

const coordinator = new SchedulerCoordinator();

if (require.main === module) {
    coordinator.start();
}

module.exports = coordinator;
