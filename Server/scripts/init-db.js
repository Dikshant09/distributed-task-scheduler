/**
 * Database initialization for production
 * FULL RESET: Clears all data on Docker restart for demo purposes
 * The 3 schedulers and 5 workers will auto-register as fresh instances
 */
const db = require('../db');
const logger = require('../common/logger');

const initDatabase = async () => {
    try {
        logger.info('Initializing database - FULL RESET...');

        // Clear stale process instances from previous container runs
        await db.query('DELETE FROM process_instances');
        logger.info('Cleared process_instances');

        // Clear all tasks and executions for fresh demo
        await db.query('DELETE FROM task_executions');
        await db.query('DELETE FROM tasks');
        logger.info('Cleared tasks and task_executions');

        // Clear Redis events
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        await redis.del('system:events');
        await redis.del('task-stream');
        await redis.quit();
        logger.info('Cleared Redis events and task stream');

        logger.info('Database initialization complete - system reset');
    } catch (err) {
        // Table may not exist on first run - that's OK
        if (err.code === '42P01') {
            logger.info('Database tables not yet created - skipping cleanup');
        } else {
            logger.error('Database initialization error', err);
        }
    }
};

module.exports = initDatabase;

