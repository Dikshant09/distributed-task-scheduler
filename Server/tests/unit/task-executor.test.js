const { executeTask } = require('../../worker/executor/task-executor');
const axios = require('axios');

jest.mock('axios');

describe('Task Executor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should export executeTask function', () => {
        expect(executeTask).toBeDefined();
        expect(typeof executeTask).toBe('function');
    });

    describe('HTTP Task Execution', () => {
        it('should execute HTTP GET task successfully', async () => {
            const task = {
                id: 'task-1',
                type: 'HTTP',
                payload: {
                    method: 'GET',
                    url: 'https://api.example.com/data'
                }
            };

            const mockResponse = {
                status: 200,
                data: { result: 'success' }
            };

            axios.mockResolvedValue(mockResponse);

            const result = await executeTask(task);

            expect(result.result).toBe('success');
            expect(result.statusCode).toBe(200);
        });

        it('should handle HTTP errors', async () => {
            const task = {
                id: 'task-2',
                type: 'HTTP',
                payload: {
                    method: 'GET',
                    url: 'https://api.example.com/error'
                }
            };

            axios.mockRejectedValue(new Error('Network error'));

            await expect(executeTask(task)).rejects.toThrow();
        });
    });

    describe('DELAY Task Execution', () => {
        it('should complete delay task', async () => {
            const task = {
                id: 'task-3',
                type: 'DELAY',
                payload: {
                    seconds: 0.1 // 100ms for testing
                }
            };

            const startTime = Date.now();
            const result = await executeTask(task);
            const endTime = Date.now();

            expect(result.result).toBe('success');
            expect(endTime - startTime).toBeGreaterThanOrEqual(100);
        });
    });

    describe('Unknown Task Type', () => {
        it('should reject unknown task types', async () => {
            const task = {
                id: 'task-4',
                type: 'UNKNOWN',
                payload: {}
            };

            await expect(executeTask(task)).rejects.toThrow('Unknown task type');
        });
    });
});
