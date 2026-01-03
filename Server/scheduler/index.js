const logger = require('../common/logger');
const leaderElection = require('./leader-election/leader-election');
const dispatcher = require('./task-dispatcher/dispatcher');
const workerMonitor = require('./heartbeat/worker-monitor');
const dlqHandler = require('./dead-letter/dlq-handler');
const redisQueue = require('../queue/redis-queue');
const processRegistry = require('../common/process-registry');

const startScheduler = async () => {
    logger.info('Starting Scheduler Service...');

    // Register this scheduler instance
    const schedulerId = leaderElection.getLeaderId();
    await processRegistry.registerScheduler(schedulerId, process.pid, false);

    // Initialize Queues
    await redisQueue.initGroup();

    // Start Leader Election
    await leaderElection.start();

    // Listen to election events
    leaderElection.on('elected', async () => {
        logger.info('Became Leader. Starting services...');
        await processRegistry.updateSchedulerLeader(schedulerId, true);
        dispatcher.start();
        workerMonitor.start();
        dlqHandler.start();
    });

    leaderElection.on('lost', async () => {
        logger.info('Lost Leadership. Stopping services...');
        await processRegistry.updateSchedulerLeader(schedulerId, false);
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();
    });

    // Graceful Shutdown
    process.on('SIGTERM', async () => {
        logger.info('SIGTERM received. Shutting down...');
        await processRegistry.unregisterScheduler(schedulerId);
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.info('SIGINT received. Shutting down...');
        await processRegistry.unregisterScheduler(schedulerId);
        dispatcher.stop();
        workerMonitor.stop();
        dlqHandler.stop();
        process.exit(0);
    });
};

if (require.main === module) {
    startScheduler();
}
