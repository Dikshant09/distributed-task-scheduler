const Redis = require('ioredis');
const config = require('../common/config');
const logger = require('../common/logger');

const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port
});

const STREAM_NAME = 'task-stream';
const CONSUMER_GROUP = 'workers-group';

const initGroup = async () => {
    try {
        await redis.xgroup('CREATE', STREAM_NAME, CONSUMER_GROUP, '0', 'MKSTREAM');
    } catch (err) {
        if (!err.message.includes('BUSYGROUP')) {
            logger.error('Error creating Redis consumer group', err);
        }
    }
};

const pushTask = async (taskId, metrics = { attempt: 0 }) => {
    // Add to stream with task_id and attempt
    await redis.xadd(STREAM_NAME, '*', 'task_id', taskId, 'attempt', metrics.attempt);
};

const consume = async (consumerName) => {
    try {
        // XREADGROUP
        // count: 1, block: 2000
        const results = await redis.xreadgroup(
            'GROUP', CONSUMER_GROUP, consumerName,
            'COUNT', 1,
            'BLOCK', 2000,
            'STREAMS', STREAM_NAME, '>'
        );

        if (!results) return null;

        // structure: [[streamName, [[messageId, [fields]]]]]
        const [streamData] = results;
        const metrics = streamData[1][0];
        const messageId = metrics[0];
        const fields = metrics[1];

        // Parse fields array ['task_id', '123', 'attempt', '0']
        const taskData = {};
        for (let i = 0; i < fields.length; i += 2) {
            taskData[fields[i]] = fields[i + 1];
        }

        return { messageId, ...taskData };
    } catch (err) {
        // Self-healing: recreate consumer group if it doesn't exist
        if (err.message.includes('NOGROUP')) {
            logger.warn('Consumer group not found, recreating...');
            await initGroup();
            return null; // Return null and retry on next iteration
        }
        throw err; // Re-throw other errors
    }
};

const ack = async (messageId) => {
    await redis.xack(STREAM_NAME, CONSUMER_GROUP, messageId);
};

const getPendingCount = async () => {
    try {
        const pending = await redis.xpending(STREAM_NAME, CONSUMER_GROUP);
        return { count: pending[0] || 0 };
    } catch (err) {
        logger.error('Error getting pending count', err);
        return { count: 0 };
    }
};

module.exports = {
    pushTask,
    consume,
    ack,
    initGroup,
    getPendingCount,
    redis // export client for clean shutdown if needed
};
