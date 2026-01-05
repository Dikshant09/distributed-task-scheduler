const tasksRepo = require('../../db/repositories/tasks.repo');
const db = require('../../db');

jest.mock('../../db');

describe('Tasks Repository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createTask', () => {
        it('should create a new task successfully', async () => {
            const task = {
                id: 'test-id',
                type: 'HTTP',
                payload: { url: 'https://example.com' },
                scheduledAt: new Date(),
                idempotencyKey: 'test-key'
            };

            const mockResult = { rows: [{ ...task, status: 'PENDING' }] };
            db.query.mockResolvedValue(mockResult);

            const result = await tasksRepo.createTask(task);

            expect(result).toEqual(mockResult.rows[0]);
            expect(db.query).toHaveBeenCalled();
        });

        it('should handle duplicate idempotency key', async () => {
            const task = {
                id: 'test-id',
                type: 'HTTP',
                payload: { url: 'https://example.com' },
                scheduledAt: new Date(),
                idempotencyKey: 'duplicate-key'
            };

            const duplicateError = new Error('Duplicate');
            duplicateError.code = '23505';

            db.query
                .mockRejectedValueOnce(duplicateError)
                .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

            const result = await tasksRepo.createTask(task);

            expect(result.id).toBe('existing-id');
            expect(db.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('getPendingTasks', () => {
        it('should retrieve pending tasks', async () => {
            const mockTasks = [
                { id: 'task-1', attempt: 0 },
                { id: 'task-2', attempt: 1 }
            ];

            db.query.mockResolvedValue({ rows: mockTasks });

            const result = await tasksRepo.getPendingTasks(10);

            expect(result).toEqual(mockTasks);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('PENDING'),
                [10]
            );
        });
    });

    describe('acquireLease', () => {
        it('should acquire lease for available task', async () => {
            const taskId = 'task-123';
            const workerId = 'worker-456';

            db.query.mockResolvedValue({ rows: [{ id: taskId, assigned_worker_id: workerId }] });

            const result = await tasksRepo.acquireLease(taskId, workerId);

            expect(result).toBeDefined();
            expect(result.id).toBe(taskId);
        });

        it('should fail to acquire lease if task is already leased', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const result = await tasksRepo.acquireLease('task-id', 'worker-id');

            expect(result).toBeUndefined();
        });
    });

    describe('updateStatus', () => {
        it('should update task status to SUCCESS', async () => {
            db.query.mockResolvedValue({ rows: [{ id: 'task-1', status: 'SUCCESS' }] });

            await tasksRepo.updateStatus('task-1', 'SUCCESS');

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tasks'),
                expect.arrayContaining(['SUCCESS', 'task-1'])
            );
        });

        it('should increment attempts on FAILED status', async () => {
            const nextRetry = new Date();
            db.query.mockResolvedValue({ rows: [{ id: 'task-1', status: 'FAILED', attempt: 1 }] });

            await tasksRepo.updateStatus('task-1', 'FAILED', null, nextRetry);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('attempt = attempt + 1'),
                expect.arrayContaining(['FAILED', 'task-1', nextRetry])
            );
        });
    });
});
