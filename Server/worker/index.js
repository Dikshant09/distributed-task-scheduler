const config = require('../common/config');
const logger = require('../common/logger');
const redisQueue = require('../queue/redis-queue');
const tasksRepo = require('../db/repositories/tasks.repo');
const HeartbeatSender = require('./heartbeat/heartbeat-sender');
const { executeTask } = require('./executor/task-executor');
const { generateId } = require('../common/utils/uuid');
const { truncateOutput } = require('../common/utils/truncate-output');

const WORKER_ID = `worker-${generateId().substring(0, 8)}`;
const heartbeat = new HeartbeatSender(WORKER_ID);

const processTask = async (msg) => {
    const { messageId, task_id, attempt } = msg;
    logger.info(`Received task ${task_id} (Attempt: ${attempt})`);

    // 1. Idempotency Check (Optional optimization, strictly handled by Swap)
    // But strictly, we check DB status.
    const task = await tasksRepo.getTaskById(task_id);
    if (!task) {
        logger.warn(`Task ${task_id} not found in DB. Skipping.`);
        await redisQueue.ack(messageId);
        return;
    }

    if (task.status === 'SUCCESS') {
        logger.info(`Task ${task_id} already SUCCESS. Acking.`);
        await redisQueue.ack(messageId);
        return;
    }

    // 2. Acquire Lease
    const leasedTask = await tasksRepo.acquireLease(task_id, WORKER_ID);
    if (!leasedTask) {
        logger.info(`Failed to acquire lease for ${task_id}. Possible duplicate delivery or lease held.`);
        // Do NOT ack yet? If we ack, we lose it?
        // Redis Streams Pending List will keep it if we don't ack.
        // But if another worker has it, we should let them finish.
        // If we ack, it's gone from the group.
        // If we don't ack, it stays in PEL.
        // We should ACK if another worker successfully TOOK it.
        // But we don't know that for sure.
        // Safer to NOT Ack here. Let PEL retry later if that worker dies.
        return;
    }

    // 3. Start Lease Renewer
    const renewInterval = setInterval(async () => {
        try {
            const renewed = await tasksRepo.renewLease(task_id, WORKER_ID);
            if (!renewed) {
                logger.warn(`Failed to renew lease for ${task_id}. Stopping execution.`);
                clearInterval(renewInterval);
                // We should probably abort execution here if possible.
            }
        } catch (err) {
            logger.error('Lease renewal error', err);
        }
    }, 10000);

    const startedAt = new Date();

    // 4. Execute
    try {
        const result = await executeTask(leasedTask);
        const finishedAt = new Date();

        // Truncate output if needed
        const { output, truncated } = truncateOutput(result);

        // Record execution
        await tasksRepo.createExecution({
            taskId: task_id,
            attempt: task.attempt || 0,
            status: 'SUCCESS',
            startedAt,
            finishedAt,
            durationMs: finishedAt - startedAt,
            output,
            error: null,
            truncated
        });

        // 5. Report Success
        await tasksRepo.updateStatus(task_id, 'SUCCESS');
        logger.info(`Task ${task_id} SUCCEEDED`);
    } catch (err) {
        const finishedAt = new Date();
        logger.error(`Task ${task_id} FAILED`, err);

        // Record failed execution
        await tasksRepo.createExecution({
            taskId: task_id,
            attempt: task.attempt || 0,
            status: 'FAILED',
            startedAt,
            finishedAt,
            durationMs: finishedAt - startedAt,
            output: null,
            error: err.message,
            truncated: false
        });

        // 6. Report Failure
        const nextRetryAt = new Date(Date.now() + Math.min(1000 * Math.pow(2, task.attempt || 0), 60000));
        await tasksRepo.updateStatus(task_id, 'FAILED', null, nextRetryAt);
    } finally {
        clearInterval(renewInterval);
        // 7. ACK
        await redisQueue.ack(messageId);
    }
};

const startWorker = async () => {
    logger.info(`Starting Worker ${WORKER_ID}`);
    heartbeat.start();
    await redisQueue.initGroup();

    while (true) {
        try {
            const msg = await redisQueue.consume(WORKER_ID);
            if (msg) {
                await processTask(msg);
            } else {
                // No tasks, wait handled by BLOCK in consume
            }
        } catch (err) {
            logger.error('Worker loop error', err);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
};

if (require.main === module) {
    startWorker();
}
