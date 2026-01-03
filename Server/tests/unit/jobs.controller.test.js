const jobsController = require('../../api/controllers/jobs.controller');
const tasksRepo = require('../../db/repositories/tasks.repo');

jest.mock('../../db/repositories/tasks.repo');

describe('Jobs Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {},
            params: {},
            query: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('createJob', () => {
        it('should create HTTP job successfully', async () => {
            req.body = {
                type: 'HTTP',
                payload: {
                    method: 'GET',
                    url: 'https://api.example.com'
                }
            };

            const mockTask = {
                id: 'task-123',
                type: 'HTTP',
                status: 'PENDING'
            };

            tasksRepo.createTask.mockResolvedValue(mockTask);

            await jobsController.createJob(req, res, next);

            expect(tasksRepo.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'HTTP',
                    payload: req.body.payload
                })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                data: { task: mockTask }
            });
        });

        it('should handle repository errors', async () => {
            req.body = {
                type: 'HTTP',
                payload: { url: 'https://example.com' }
            };

            tasksRepo.createTask.mockRejectedValue(new Error('Database error'));

            await jobsController.createJob(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('getJob', () => {
        it('should retrieve job with execution history', async () => {
            req.params.id = 'task-123';

            const mockTask = {
                id: 'task-123',
                type: 'HTTP',
                status: 'SUCCESS'
            };

            const mockExecutions = [
                { id: 'exec-1', attempt: 1, status: 'SUCCESS' }
            ];

            tasksRepo.getTaskById.mockResolvedValue(mockTask);
            tasksRepo.getExecutionHistory.mockResolvedValue(mockExecutions);

            await jobsController.getJob(req, res, next);

            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                data: {
                    task: mockTask,
                    executions: mockExecutions
                }
            });
        });

        it('should return 404 for non-existent job', async () => {
            req.params.id = 'non-existent';

            tasksRepo.getTaskById.mockResolvedValue(null);

            await jobsController.getJob(req, res, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('not found')
                })
            );
        });
    });
});
