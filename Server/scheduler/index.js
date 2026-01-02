const logger = require('../common/logger');
const leaderElection = require('./leader-election/leader-election');
const dispatcher = require('./task-dispatcher/dispatcher');
const workerMonitor = require('./heartbeat/worker-monitor');
const dlqHandler = require('./dead-letter/dlq-handler');
const redisQueue = require('../queue/redis-queue');

const startScheduler = async () => {
    logger.info('Starting Scheduler Service...');

    // Initialize Queues
    await redisQueue.initGroup();

    // Start Leader Election
    await leaderElection.start();

    // Listen to election events
    leaderElection.on('elected', () => {
        logger.info('Became Leader. Starting services...');
        dispatcher.start();
        workerMonitor.start();
        dlqHandler.start();
    });

    leaderElection.on('lost', () => {
        logger.info('Lost Leadership. Stopping services...');
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();
    });

    // Graceful Shutdown
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received. Shutting down...');
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();
        process.exit(0);
    });
};

if (require.main === module) {
    startScheduler();
}
