const express = require('express');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

// Simple in-memory rate limiter for chaos endpoints
// More flexible for demos while still preventing abuse
const chaosRateLimiter = (() => {
    const requests = new Map();
    const WINDOW_MS = 30 * 1000; // 30 seconds (reduced from 60)
    const MAX_REQUESTS = 10; // 10 requests per 30 seconds per IP (more flexible)

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        const key = `${ip}:chaos`;

        if (!requests.has(key)) {
            requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
            return next();
        }

        const record = requests.get(key);

        if (now > record.resetAt) {
            // Window expired, reset
            requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
            return next();
        }

        if (record.count >= MAX_REQUESTS) {
            const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
            return res.status(429).json({
                status: 'error',
                message: `Too many chaos requests. Please wait ${waitSeconds} seconds before trying again.`,
                retryAfter: waitSeconds
            });
        }

        record.count++;
        next();
    };
})();

// Scheduler control
router.get('/scheduler/status', adminController.getSchedulerStatus);
router.post('/scheduler/enable', adminController.enableScheduler);
router.post('/scheduler/disable', adminController.disableScheduler);

// Fault injection (rate-limited to prevent abuse)
router.post('/faults/kill-leader', chaosRateLimiter, adminController.killLeader);
router.post('/faults/kill-worker', chaosRateLimiter, adminController.killWorker);
router.post('/faults/kill-worker-mid-task', chaosRateLimiter, adminController.killWorkerMidTask);
router.post('/faults/pause-queue', chaosRateLimiter, adminController.pauseQueue);
router.post('/faults/network-delay', chaosRateLimiter, adminController.networkDelay);

// System reset (for demos)
router.post('/system/reset', adminController.resetSystem);

// Instance reset - restore to 3 coordinators, 5 workers
router.post('/instances/reset', adminController.resetInstances);

// DLQ management
router.get('/dlq', adminController.getDLQTasks);
router.post('/dlq/:id/retry', adminController.retryFromDLQ);
router.post('/dlq/cleanup', adminController.cleanupDLQ);

module.exports = router;
