const express = require('express');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

// Scheduler control
router.post('/scheduler/enable', adminController.enableScheduler);
router.post('/scheduler/disable', adminController.disableScheduler);

// Fault injection
router.post('/faults/kill-leader', adminController.killLeader);
router.post('/faults/kill-worker', adminController.killWorker);
router.post('/faults/pause-queue', adminController.pauseQueue);

module.exports = router;
