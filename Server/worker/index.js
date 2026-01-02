const config = require('../common/config');
const logger = require('../common/logger');
const redisQueue = require('../queue/redis-queue');
const tasksRepo = require('../db/repositories/tasks.repo');
const HeartbeatSender = require('./heartbeat/heartbeat-sender');
const { executeTask } = require('./executor/task-executor');
const { generateId } = require('../common/utils/uuid');

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

    // 4. Execute
    try {
        const result = await executeTask(leasedTask);

        // 5. Report Success
        await tasksRepo.updateStatus(task_id, 'SUCCESS', result);
        logger.info(`Task ${task_id} SUCCEEDED`);
    } catch (err) {
        logger.error(`Task ${task_id} FAILED`, err);

        // 6. Report Failure
        // Calculate backoff in dispatcher, or here?
        // LLD says "Dispatcher handles retries & DLQ transitions".
        // But Worker ResultReporter: "Update tasks set status='FAILED', next_retry_at=..."
        // Let's set it to FAILED. Dispatcher 'RetryLoop' will pick it up and re-dispatch.
        // We just set status FAILED.
        // Update: LLD says "FAILED -> retry window -> RETRY_WAIT".
        // We can compute next_retry_at here if we want worker to do it, or let Dispatcher do it.
        // LLD Section 2.6: Worker updates status='FAILED', attempt=attempt+1, next_retry_at=...

        const nextRetryAt = new Date(Date.now() + Math.min(1000 * Math.pow(2, task.attempt || 0), 60000));
        // Determine max attempts
        if ((task.attempt || 0) + 1 >= (task.max_attempts || 5)) {
            // DLQ logic in Worker or Dispatcher? 
            // LLD 2.6 says Worker updates to FAILED. LLD 5.5 mentions RetryLoop.
            // Let's stick to simple: Worker marks FAILED. Dispatcher RetryLoop handles logic.
        }

        // Let's calculate next retry so RetryLoop picks it up correct time.
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
