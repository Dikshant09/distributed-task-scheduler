const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');

router.get('/', eventsController.getEvents);

module.exports = router;
