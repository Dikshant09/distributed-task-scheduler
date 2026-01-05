const tasksRepo = require('../../db/repositories/tasks.repo');
const { generateId } = require('../../common/utils/uuid');
const { now } = require('../../common/utils/time');
const { NotFoundError } = require('../../common/errors/custom-errors');
const db = require('../../db');
const eventLogger = require('../../common/event-logger');

const createJob = async (req, res, next) => {
    try {
        const { type, payload, scheduledAt, idempotencyKey } = req.body;
        const schedulerState = require('../../common/scheduler-state');

        // Check if scheduler is enabled
        const isEnabled = await schedulerState.isEnabled();
        if (!isEnabled) {
            return res.status(400).json({
                status: 'error',
                message: 'Scheduler is disabled. Enable the scheduler first to create jobs.'
            });
        }

        const finalIdempotencyKey = idempotencyKey || generateId();

        const task = {
            id: generateId(),
            type,
            payload,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : now(),
            idempotencyKey: finalIdempotencyKey
        };

        const createdTask = await tasksRepo.createTask(task);

        // Log event
        eventLogger.log('TASK_CREATED', `Task ${createdTask.id.substring(0, 8)} created (${type})`, {
            taskId: createdTask.id,
            type
        });

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

        // Get execution history from task_executions table
        const executions = await tasksRepo.getExecutionHistory(id);

        res.status(200).json({
            status: 'success',
            data: {
                task,
                executions
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
        const schedulerState = require('../../common/scheduler-state');

        // Check if scheduler is enabled
        const isEnabled = await schedulerState.isEnabled();
        if (!isEnabled) {
            return res.status(400).json({
                status: 'error',
                message: 'Scheduler is disabled. Enable the scheduler first to run jobs.'
            });
        }

        // Update task to run immediately - reset all execution state for re-run
        const query = `
            UPDATE tasks
            SET scheduled_at = NOW(),
                status = 'PENDING',
                attempt = 0,
                assigned_worker_id = NULL,
                lease_expiry = NULL,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;

        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            throw new NotFoundError(`Task with ID ${id} not found`);
        }

        eventLogger.log('TASK_RUN_NOW', `Task ${id.substring(0, 8)} scheduled to run immediately`, {
            taskId: id
        });

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
