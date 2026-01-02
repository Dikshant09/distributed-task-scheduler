const express = require('express');
const jobsController = require('../controllers/jobs.controller');
const validateJob = require('../validators/job.validator');

const router = express.Router();

router.post('/', validateJob, jobsController.createJob);
router.get('/:id', jobsController.getJob);
router.get('/', jobsController.getTasks);

module.exports = router;
