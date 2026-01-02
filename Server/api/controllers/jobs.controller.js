const tasksRepo = require('../../db/repositories/tasks.repo');
const { generateId } = require('../../common/utils/uuid');
const { now } = require('../../common/utils/time');
const { NotFoundError } = require('../../common/errors/custom-errors');
const db = require('../../db');

const createJob = async (req, res, next) => {
    try {
        const { type, payload, scheduledAt, idempotencyKey } = req.body;

        const finalIdempotencyKey = idempotencyKey || generateId();

        const task = {
            id: generateId(),
            type,
            payload,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : now(),
            idempotencyKey: finalIdempotencyKey
        };

        const createdTask = await tasksRepo.createTask(task);

        res.status(201).json({
            status: 'success',
            data: { task: createdTask }
        });
    } catch (error) {
        next(error);
    }
};

const getJob = async (req, res, next) => {
    try {
        const { id } = req.params;
        const task = await tasksRepo.getTaskById(id);

        if (!task) {
            throw new NotFoundError(`Task with ID ${id} not found`);
        }

        res.status(200).json({
            status: 'success',
            data: { task }
        });
    } catch (error) {
        next(error);
    }
};

const getTasks = async (req, res, next) => {
    try {
        // Simple list all for demo. In prod, pagination is needed.
        const result = await db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50');
        res.status(200).json({
            status: 'success',
            data: { tasks: result.rows }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createJob,
    getJob,
    getTasks
};
