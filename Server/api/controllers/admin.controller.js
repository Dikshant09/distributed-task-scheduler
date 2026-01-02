const logger = require('../../common/logger');
const dispatcher = require('../../scheduler/task-dispatcher/dispatcher');
const workerMonitor = require('../../scheduler/heartbeat/worker-monitor');
const dlqHandler = require('../../scheduler/dead-letter/dlq-handler');

/**
 * POST /admin/scheduler/enable
 * Enable the scheduler (start dispatcher, worker monitor, DLQ handler)
 */
const enableScheduler = async (req, res, next) => {
    try {
        logger.info('Enabling scheduler via admin API');

        dispatcher.start();
        workerMonitor.start();
        dlqHandler.start();

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

        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();

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
 * Simulate leader failure by forcing process exit
 */
const killLeader = async (req, res, next) => {
    try {
        logger.warn('FAULT INJECTION: Killing leader process');

        res.json({
            status: 'success',
            message: 'Leader process will terminate in 1 second'
        });

        // Give response time to send before killing
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/faults/kill-worker
 * Simulate worker failure by killing a random worker process
 */
const killWorker = async (req, res, next) => {
    try {
        logger.warn('FAULT INJECTION: Simulating worker kill (not implemented in single-process mode)');

        res.json({
            status: 'success',
            message: 'Worker kill simulated (requires multi-process deployment)'
        });
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

module.exports = {
    enableScheduler,
    disableScheduler,
    killLeader,
    killWorker,
    pauseQueue
};
