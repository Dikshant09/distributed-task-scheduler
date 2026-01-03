const logger = require('../../common/logger');
const axios = require('axios');
const { spawn } = require('child_process');

/**
 * Execute HTTP task
 */
const executeHttpTask = async (payload) => {
    const { method = 'GET', url, headers = {}, body, timeout_ms = 5000 } = payload;

    logger.info(`Executing HTTP ${method} ${url}`);

    try {
        const response = await axios({
            method,
            url,
            headers,
            data: body,
            timeout: timeout_ms
        });

        return {
            result: 'success',
            statusCode: response.status,
            data: response.data
        };
    } catch (error) {
        logger.error(`HTTP task failed: ${error.message}`);
        throw new Error(`HTTP ${method} ${url} failed: ${error.message}`);
    }
};

/**
 * Execute Shell command task
 * Safety: In production, this should be sandboxed and use command whitelist
 */
const executeShellTask = async (payload) => {
    const { command, timeout_ms = 15000 } = payload;

    logger.info(`Executing shell command: ${command}`);

    return new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', command]);
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error(`Shell command timed out after ${timeout_ms}ms`));
        }, timeout_ms);

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timeout);

            if (timedOut) return;

            if (code === 0) {
                resolve({ result: 'success', stdout, stderr });
            } else {
                reject(new Error(`Shell command exited with code ${code}: ${stderr}`));
            }
        });

        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`Shell command error: ${error.message}`));
        });
    });
};

/**
 * Execute Delay/No-op task
 * Perfect for testing retries, lease expiry, worker crashes
 */
const executeDelayTask = async (payload) => {
    const { duration_ms = 1000, fail_probability = 0 } = payload;

    logger.info(`Executing delay task: ${duration_ms}ms, fail probability: ${fail_probability}`);

    await new Promise(resolve => setTimeout(resolve, duration_ms));

    // Simulate random failure for testing
    if (Math.random() < fail_probability) {
        throw new Error(`Simulated failure (probability: ${fail_probability})`);
    }

    return { result: 'success', duration: duration_ms };
};

/**
 * Main task executor - routes to appropriate handler based on type
 */
const executeTask = async (task) => {
    logger.info(`Executing task ${task.id} (Type: ${task.type})`);

    // Add minimum delay for demo visibility (makes worker status change observable)
    // In production, remove this or set MIN_EXECUTION_DELAY_MS=0
    const MIN_EXECUTION_DELAY = parseInt(process.env.MIN_EXECUTION_DELAY_MS || '3000');
    if (MIN_EXECUTION_DELAY > 0) {
        logger.info(`Waiting ${MIN_EXECUTION_DELAY}ms for demo visibility...`);
        await new Promise(resolve => setTimeout(resolve, MIN_EXECUTION_DELAY));
    }

    try {
        let result;

        switch (task.type) {
            case 'HTTP':
                result = await executeHttpTask(task.payload);
                break;

            case 'SHELL':
                result = await executeShellTask(task.payload);
                break;

            case 'DELAY':
            case 'WAIT':  // Backward compatibility
                result = await executeDelayTask(task.payload);
                break;

            case 'FAIL':  // Backward compatibility - always fails
                throw new Error('Simulated Failure');

            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }

        logger.info(`Task ${task.id} completed successfully`);
        return result;

    } catch (error) {
        logger.error(`Task ${task.id} failed: ${error.message}`);
        throw error;
    }
};

module.exports = {
    executeTask
};
