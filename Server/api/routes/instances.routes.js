const express = require('express');
const router = express.Router();
const instancesController = require('../controllers/instances.controller');

router.get('/', instancesController.getInstances);

module.exports = router;
