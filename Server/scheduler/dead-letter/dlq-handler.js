const logger = require('../../common/logger');
const tasksRepo = require('../../db/repositories/tasks.repo');
const leaderElection = require('../leader-election/leader-election');

/**
 * DLQ (Dead Letter Queue) Handler
 * 
 * Responsibilities:
 * 1. Monitor tasks in DLQ status
 * 2. Log DLQ tasks for alerting/monitoring
 * 3. Optionally: Clean up old DLQ tasks
 * 4. Optionally: Provide manual retry mechanism
 */
class DLQHandler {
    constructor() {
        this.isRunning = false;
        this.monitorInterval = null;
    }

    start() {
        this.isRunning = true;
        this.monitorInterval = setInterval(() => this._monitorDLQ(), 30000); // Check every 30s
        logger.info('DLQ Handler started');
    }

    stop() {
        this.isRunning = false;
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        logger.info('DLQ Handler stopped');
    }

    /**
     * Monitor DLQ tasks
     * Logs DLQ tasks for alerting and monitoring
     */
    async _monitorDLQ() {
        if (!leaderElection.isLeader) return;

        try {
            const dlqTasks = await tasksRepo.getDLQTasks();

            if (dlqTasks.length === 0) return;

            logger.warn(`DLQ contains ${dlqTasks.length} failed tasks`);

            // Log details of DLQ tasks for monitoring/alerting
            for (const task of dlqTasks) {
                logger.warn(`DLQ Task: ${task.id}, Type: ${task.type}, Reason: ${task.dlq_reason}, Attempts: ${task.attempt}`);
            }

            // Optional: Alert if DLQ size exceeds threshold
            if (dlqTasks.length > 100) {
                logger.error(`⚠️  DLQ size critical: ${dlqTasks.length} tasks! Manual intervention may be required.`);
            }

        } catch (err) {
            logger.error('DLQ monitor error', err);
        }
    }

    /**
     * Manually retry a task from DLQ
     * Useful for admin operations
     */
    async retryFromDLQ(taskId) {
        try {
            await tasksRepo.resetFromDLQ(taskId);
            logger.info(`Task ${taskId} manually retried from DLQ`);
            return true;
        } catch (err) {
            logger.error(`Failed to retry task ${taskId} from DLQ`, err);
            return false;
        }
    }

    /**
     * Clean up old DLQ tasks
     * Remove tasks older than retention period
     */
    async cleanupOldTasks(retentionDays = 30) {
        if (!leaderElection.isLeader) return;

        try {
            const deleted = await tasksRepo.deleteDLQTasksOlderThan(retentionDays);
            if (deleted > 0) {
                logger.info(`Cleaned up ${deleted} DLQ tasks older than ${retentionDays} days`);
            }
        } catch (err) {
            logger.error('DLQ cleanup error', err);
        }
    }
}

module.exports = new DLQHandler();
