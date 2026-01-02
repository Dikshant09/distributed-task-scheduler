const express = require('express');
const workersController = require('../controllers/workers.controller');

const router = express.Router();

router.get('/', workersController.getWorkers);

module.exports = router;
