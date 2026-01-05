/**
 * Database initialization for production
 * Clears stale data from previous sessions on startup
 * This ensures a clean slate when Docker containers restart
 */
const db = require('../db');
const logger = require('../common/logger');

const initDatabase = async () => {
    try {
        logger.info('Initializing database - clearing stale data...');

        // Clear stale process instances from previous container runs
        await db.query('DELETE FROM process_instances');
        logger.info('Cleared process_instances table');

        // Clear stale tasks (optional - uncomment for full reset on restart)
        // await db.query('DELETE FROM tasks');
        // await db.query('DELETE FROM task_executions');
        // logger.info('Cleared tasks and executions');

        // Clear Redis events (optional)
        // Redis data persists in volume, but events will be fresh

        logger.info('Database initialization complete');
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
