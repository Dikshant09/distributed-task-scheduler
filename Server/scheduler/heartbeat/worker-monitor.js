const workersRepo = require('../../db/repositories/workers.repo');
const tasksRepo = require('../../db/repositories/tasks.repo'); // We might need a reclaim function
const logger = require('../../common/logger');
const leaderElection = require('../leader-election/leader-election');
const db = require('../../db');
const eventLogger = require('../../common/event-logger');

class WorkerMonitor {
    constructor() {
        this.interval = null;
    }

    start() {
        this.interval = setInterval(() => this._checkWorkers(), 15000);
        logger.info('Worker Monitor started');
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }

    async _checkWorkers() {
        if (!leaderElection.isLeader) return;

        try {
            const deadWorkers = await workersRepo.getDeadWorkers(15); // 15s timeout
            if (deadWorkers.length > 0) {
                logger.warn(`Found ${deadWorkers.length} dead workers`, deadWorkers);

                for (const w of deadWorkers) {
                    eventLogger.log('WORKER_FAILED', `Worker ${w.worker_id} failed (missed heartbeats)`, {
                        workerId: w.worker_id,
                        lastHeartbeat: w.last_heartbeat
                    });

                    // Reclaim tasks
                    const query = `
             UPDATE tasks
             SET status = 'PENDING', assigned_worker_id = NULL, updated_at = NOW()
             WHERE assigned_worker_id = $1 AND status = 'RUNNING'
           `;
                    const res = await db.query(query, [w.worker_id]);
                    if (res.rowCount > 0) {
                        logger.info(`Reclaimed ${res.rowCount} tasks from dead worker ${w.worker_id}`);
                    }
                }
            }
        } catch (err) {
            logger.error('Worker Monitor error', err);
        }
    }
}

module.exports = new WorkerMonitor();
