const { exec } = require('child_process');
const axios = require('axios');

describe('Chaos Test: Leader Failure', () => {
    const API_URL = 'http://localhost:3000';

    test('System should recover after leader is killed', async () => {
        // 1. Submit a long running task
        const taskRes = await axios.post(`${API_URL}/tasks`, {
            type: 'WAIT',
            payload: { duration: 10000 }, // 10s wait
            scheduledAt: new Date().toISOString(),
            idempotencyKey: `chaos-test-${Date.now()}`
        });
        const taskId = taskRes.data.data.task.id;
        console.log(`Submitted task ${taskId}`);

        // 2. Kill Leader
        console.log('Killing leader...');
        await new Promise((resolve) => {
            exec('../../scripts/kill-leader.sh', (err, stdout, stderr) => {
                if (err) console.error(err);
                console.log(stdout);
                resolve();
            });
        });

        // 3. Wait for Re-election
        await new Promise(r => setTimeout(r, 10000));

        // 4. Check Task Status
        const checkRes = await axios.get(`${API_URL}/tasks/${taskId}`);
        const status = checkRes.data.data.task.status;
        console.log(`Task Status after failure: ${status}`);

        // Task shold eventually succeed or be retried
        expect(['RUNNING', 'SUCCESS', 'DISPATCHED']).toContain(status);
    }, 30000);
});
