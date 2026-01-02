const logger = require('../../common/logger');
const { addSeconds } = require('../../common/utils/time');

const executeTask = async (task) => {
    logger.info(`Executing task ${task.id} (Type: ${task.type})`);

    // Simulate execution time
    // In real world, switch(task.type) -> call handler

    if (task.type === 'WAIT') {
        const duration = task.payload.duration || 1000;
        await new Promise(resolve => setTimeout(resolve, duration));
    } else if (task.type === 'FAIL') {
        throw new Error('Simulated Failure');
    }

    logger.info(`Task ${task.id} completed successfully`);
    return { result: 'ok' };
};

module.exports = {
    executeTask
};
