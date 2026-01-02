const express = require('express');
const systemController = require('../controllers/system.controller');

const router = express.Router();

router.get('/status', systemController.getSystemStatus);

module.exports = router;
