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

        // Get execution history (state transitions, retry attempts)
        // For now, we'll include the task data with attempts count
        // In a full implementation, we'd have a separate execution_log table
        const executionHistory = {
            attempts: task.attempt || 0,
            status: task.status,
            createdAt: task.created_at,
            scheduledAt: task.scheduled_at,
            startedAt: task.started_at,
            completedAt: task.completed_at,
            workerId: task.assigned_worker_id,
            error: task.error
        };

        res.status(200).json({
            status: 'success',
            data: {
                task,
                executionHistory
            }
        });
    } catch (error) {
        next(error);
    }
};

const getTasks = async (req, res, next) => {
    try {
        const { status, limit = 50 } = req.query;

        let query = 'SELECT *, assigned_worker_id as worker_id FROM tasks';
        const params = [];

        if (status) {
            query += ' WHERE status = $1';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        res.status(200).json({
            status: 'success',
            data: { tasks: result.rows }
        });
    } catch (error) {
        next(error);
    }
};

const runNow = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Update scheduled_at to now
        const query = `
            UPDATE tasks
            SET scheduled_at = NOW(), status = 'PENDING'
            WHERE id = $1
            RETURNING *
        `;

        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            throw new NotFoundError(`Task with ID ${id} not found`);
        }

        res.status(200).json({
            status: 'success',
            data: { task: result.rows[0] },
            message: 'Task scheduled to run immediately'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createJob,
    getJob,
    getTasks,
    runNow
};
