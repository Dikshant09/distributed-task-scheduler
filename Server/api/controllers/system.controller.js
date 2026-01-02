const logger = require('../../common/logger');
const leaderElection = require('../../scheduler/leader-election/leader-election');
const redisQueue = require('../../queue/redis-queue');
const workersRepo = require('../../db/repositories/workers.repo');
const db = require('../../db');

/**
 * GET /system/status
 * Returns comprehensive system health metrics
 */
const getSystemStatus = async (req, res, next) => {
    try {
        // Get scheduler status
        const isLeader = leaderElection.checkIsLeader();
        const leaderId = leaderElection.getLeaderId();
        const leaderUptime = leaderElection.getLeaderUptime();

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
                    enabled: true, // TODO: Add actual enable/disable state
                    isLeader,
                    leaderId: leaderId || 'none',
                    leaderUptime: leaderUptime || 0,
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
