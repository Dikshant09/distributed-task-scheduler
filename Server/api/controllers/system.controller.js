const logger = require('../../common/logger');
const etcdClient = require('../../scheduler/leader-election/etcd-client');
const redisQueue = require('../../queue/redis-queue');
const workersRepo = require('../../db/repositories/workers.repo');
const db = require('../../db');

// Import dispatcher to check if scheduler is enabled
let dispatcher = null;
try {
    dispatcher = require('../../scheduler/task-dispatcher/dispatcher');
} catch (err) {
    // API server might not have access to dispatcher (runs separately)
    logger.debug('Dispatcher not available in API process');
}

/**
 * GET /system/status
 * Returns comprehensive system health metrics
 */
const getSystemStatus = async (req, res, next) => {
    try {
        // Get current leader from Etcd directly (API doesn't participate in election)
        let leaderId = 'N/A';
        try {
            const election = etcdClient.election('/scheduler/leader');
            const leader = await election.leader();
            leaderId = leader ? leader.toString() : 'N/A';
        } catch (err) {
            logger.debug('Could not fetch leader from Etcd', err);
        }

        // Get worker count
        const activeWorkers = await workersRepo.getActiveWorkers();

        // Get Redis queue depth
        let queueDepth = 0;
        try {
            const pendingInfo = await redisQueue.getPendingCount();
            queueDepth = pendingInfo.count || 0;
        } catch (err) {
            logger.warn('Failed to get queue depth', err);
        }

        // Get job statistics for today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const statsQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(attempt) as total_retries
            FROM tasks 
            WHERE created_at >= $1
        `;

        const statsResult = await db.query(statsQuery, [todayStart]);
        const stats = statsResult.rows[0];

        // Calculate dispatch lag (time since oldest pending task)
        const lagQuery = `
            SELECT EXTRACT(EPOCH FROM (NOW() - MIN(scheduled_at))) as lag_seconds
            FROM tasks 
            WHERE status = 'PENDING' AND scheduled_at <= NOW()
        `;
        const lagResult = await db.query(lagQuery);
        const dispatchLag = Math.round(lagResult.rows[0]?.lag_seconds || 0);

        res.json({
            status: 'success',
            data: {
                scheduler: {
                    enabled: dispatcher ? dispatcher.isRunning : true, // Use actual dispatcher state
                    isLeader: false, // API doesn't participate in election
                    leaderId: leaderId || 'none',
                    leaderUptime: 0, // Not applicable for API
                    dispatchLag
                },
                workers: {
                    active: activeWorkers.length,
                    total: activeWorkers.length
                },
                redis: {
                    status: 'connected',
                    queueDepth
                },
                stats: {
                    jobsToday: parseInt(stats.total) || 0,
                    successToday: parseInt(stats.success) || 0,
                    failedToday: parseInt(stats.failed) || 0,
                    totalRetries: parseInt(stats.total_retries) || 0
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSystemStatus
};
