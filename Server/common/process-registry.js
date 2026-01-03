const db = require('../db');
const logger = require('./logger');

/**
 * Database-based process registry to track scheduler and worker instances
 * More reliable than file-based approach for concurrent writes
 */
class ProcessRegistry {
    /**
     * Register a scheduler instance
     */
    async registerScheduler(id, pid, isLeader = false) {
        try {
            await db.query(`
                INSERT INTO process_instances (id, type, pid, is_leader, status, started_at, last_updated)
                VALUES ($1, 'scheduler', $2, $3, 'active', NOW(), NOW())
                ON CONFLICT (id) 
                DO UPDATE SET pid = $2, is_leader = $3, last_updated = NOW()
            `, [id, pid, isLeader]);

            logger.info(`Registered scheduler ${id} (PID: ${pid}, Leader: ${isLeader})`);
        } catch (err) {
            logger.error('Failed to register scheduler', err);
        }
    }

    /**
     * Register a worker instance
     */
    async registerWorker(id, pid) {
        try {
            await db.query(`
                INSERT INTO process_instances (id, type, pid, status, started_at, last_updated)
                VALUES ($1, 'worker', $2, 'idle', NOW(), NOW())
                ON CONFLICT (id)
                DO UPDATE SET pid = $2, status = 'idle', last_updated = NOW()
            `, [id, pid]);

            logger.info(`Registered worker ${id} (PID: ${pid})`);
        } catch (err) {
            logger.error('Failed to register worker', err);
        }
    }

    /**
     * Update scheduler leader status
     */
    async updateSchedulerLeader(id, isLeader) {
        try {
            // Set all schedulers to non-leader first
            if (isLeader) {
                await db.query(`UPDATE process_instances SET is_leader = FALSE WHERE type = 'scheduler'`);
            }

            await db.query(`
                UPDATE process_instances 
                SET is_leader = $1, last_updated = NOW()
                WHERE id = $2 AND type = 'scheduler'
            `, [isLeader, id]);

            logger.info(`Updated scheduler ${id} leader status: ${isLeader}`);
        } catch (err) {
            logger.error('Failed to update scheduler leader status', err);
        }
    }

    /**
     * Update worker status
     */
    async updateWorkerStatus(id, status, currentTaskId = null) {
        try {
            await db.query(`
                UPDATE process_instances 
                SET status = $1, current_task_id = $2, last_updated = NOW()
                WHERE id = $3 AND type = 'worker'
            `, [status, currentTaskId, id]);
        } catch (err) {
            logger.error('Failed to update worker status', err);
        }
    }

    /**
     * Unregister a scheduler
     */
    async unregisterScheduler(id) {
        try {
            await db.query(`DELETE FROM process_instances WHERE id = $1 AND type = 'scheduler'`, [id]);
            logger.info(`Unregistered scheduler ${id}`);
        } catch (err) {
            logger.error('Failed to unregister scheduler', err);
        }
    }

    /**
     * Unregister a worker
     */
    async unregisterWorker(id) {
        try {
            await db.query(`DELETE FROM process_instances WHERE id = $1 AND type = 'worker'`, [id]);
            logger.info(`Unregistered worker ${id}`);
        } catch (err) {
            logger.error('Failed to unregister worker', err);
        }
    }

    /**
     * Get all registered instances
     */
    async getAll() {
        try {
            const result = await db.query(`
                SELECT id, type, pid, is_leader, status, current_task_id, started_at, last_updated
                FROM process_instances
                ORDER BY type, started_at
            `);

            const schedulers = result.rows
                .filter(r => r.type === 'scheduler')
                .map(r => ({
                    id: r.id,
                    pid: r.pid,
                    isLeader: r.is_leader,
                    startedAt: r.started_at.toISOString()
                }));

            const workers = result.rows
                .filter(r => r.type === 'worker')
                .map(r => ({
                    id: r.id,
                    pid: r.pid,
                    status: r.status,
                    currentTaskId: r.current_task_id,
                    startedAt: r.started_at.toISOString()
                }));

            return { schedulers, workers };
        } catch (err) {
            logger.error('Failed to get all instances', err);
            return { schedulers: [], workers: [] };
        }
    }

    /**
     * Get current leader scheduler
     */
    async getLeader() {
        try {
            const result = await db.query(`
                SELECT id, pid, started_at
                FROM process_instances
                WHERE type = 'scheduler' AND is_leader = TRUE
                LIMIT 1
            `);

            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            return {
                id: row.id,
                pid: row.pid,
                isLeader: true,
                startedAt: row.started_at.toISOString()
            };
        } catch (err) {
            logger.error('Failed to get leader', err);
            return null;
        }
    }

    /**
     * Get all schedulers
     */
    async getSchedulers() {
        try {
            const result = await db.query(`
                SELECT id, pid, is_leader, started_at
                FROM process_instances
                WHERE type = 'scheduler'
                ORDER BY started_at
            `);

            return result.rows.map(r => ({
                id: r.id,
                pid: r.pid,
                isLeader: r.is_leader,
                startedAt: r.started_at.toISOString()
            }));
        } catch (err) {
            logger.error('Failed to get schedulers', err);
            return [];
        }
    }

    /**
     * Get all workers
     */
    async getWorkers() {
        try {
            const result = await db.query(`
                SELECT id, pid, status, current_task_id, started_at
                FROM process_instances
                WHERE type = 'worker'
                ORDER BY started_at
            `);

            return result.rows.map(r => ({
                id: r.id,
                pid: r.pid,
                status: r.status,
                currentTaskId: r.current_task_id,
                startedAt: r.started_at.toISOString()
            }));
        } catch (err) {
            logger.error('Failed to get workers', err);
            return [];
        }
    }

    /**
     * Clear all registrations (for testing)
     */
    async clear() {
        try {
            await db.query(`DELETE FROM process_instances`);
            logger.info('Cleared process registry');
        } catch (err) {
            logger.error('Failed to clear registry', err);
        }
    }
}

module.exports = new ProcessRegistry();
