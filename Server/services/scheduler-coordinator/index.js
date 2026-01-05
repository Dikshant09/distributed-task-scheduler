const logger = require('../../common/logger');
const LeaderElection = require('../../common/leader-election/leader-election');
const tasksRepo = require('../../db/repositories/tasks.repo');
const processRegistry = require('../../common/process-registry');
const eventLogger = require('../../common/event-logger');
const config = require('../../common/config');
const schedulerState = require('../../common/scheduler-state');
const os = require('os');

/**
 * Generate a clean, readable scheduler ID
 * - In Docker: uses container hostname (e.g., "scheduler-abc123")
 * - Locally: uses "scheduler-" + short random suffix
 */
function generateSchedulerId() {
    const hostname = process.env.HOSTNAME || os.hostname();

    // Docker containers typically have short alphanumeric hostnames
    // If hostname looks like a Docker container ID (12 chars hex), use first 6
    if (/^[a-f0-9]{12}$/i.test(hostname)) {
        return `scheduler-${hostname.substring(0, 6)}`;
    }

    // For local dev or non-Docker, use a simple short ID
    const shortId = Math.random().toString(36).substring(2, 6);
    return `scheduler-${shortId}`;
}

/**
 * Scheduler Service
 * 
 * ONLY responsibility: Mark PENDING tasks as READY when scheduled_at <= NOW()
 * 
 * This is the ONLY leader-elected service.
 * Does NOT push to Redis - that's the Dispatcher's job.
 * Does NOT handle retries - that's the Recovery Service's job.
 */
class Scheduler {
    constructor() {
        this.isRunning = false;
        this.scheduleInterval = null;
        this.schedulerId = generateSchedulerId();
        this.leaderElection = new LeaderElection(this.schedulerId);
    }

    async start() {
        logger.info(`Starting Scheduler Service (${this.schedulerId})...`);

        await processRegistry.registerScheduler(this.schedulerId, process.pid, false);

        this.leaderElection.on('elected', async () => {
            logger.info('Became Leader. Starting scheduling loop...');
            await processRegistry.updateSchedulerLeader(this.schedulerId, true);
            this._startSchedulingLoop();
        });

        this.leaderElection.on('demoted', async () => {
            logger.info('Lost Leadership. Stopping scheduling loop...');
            await processRegistry.updateSchedulerLeader(this.schedulerId, false);
            this._stopSchedulingLoop();
        });

        await this.leaderElection.startElection();

        // Graceful Shutdown
        const shutdown = async () => {
            logger.info('Scheduler shutting down...');
            await this.leaderElection.resignLeadership();
            await processRegistry.unregisterScheduler(this.schedulerId);
            this._stopSchedulingLoop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

        // Listen for chaos kill signals via Redis pub/sub (for Docker mode)
        const chaosSignals = require('../../common/chaos-signals');
        chaosSignals.onKillScheduler(this.schedulerId, () => {
            logger.warn(`Received KILL signal for ${this.schedulerId}`);
            eventLogger.log('SCHEDULER_KILLED', `Scheduler ${this.schedulerId} killed via chaos signal`, {
                schedulerId: this.schedulerId
            });
            shutdown();
        });
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

        if (!this.leaderElection.getIsLeader()) return;

        try {
            const readyTasks = await tasksRepo.markReady(this.schedulerId, 100);

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

const scheduler = new Scheduler();

if (require.main === module) {
    scheduler.start();
}

module.exports = scheduler;
