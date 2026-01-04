const systemController = require('../../api/controllers/system.controller');
const etcdClient = require('../../common/leader-election/etcd-client');
const workersRepo = require('../../db/repositories/workers.repo');
const db = require('../../db');

jest.mock('../../common/leader-election/etcd-client');
jest.mock('../../db/repositories/workers.repo');
jest.mock('../../db');

describe('System Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = {};
        res = {
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('getSystemStatus', () => {
        it('should return system status successfully', async () => {
            // Mock leader election
            const mockElection = {
                leader: jest.fn().mockResolvedValue('scheduler-abc123')
            };
            etcdClient.election = jest.fn().mockReturnValue(mockElection);

            // Mock workers
            workersRepo.getActiveWorkers.mockResolvedValue([
                { worker_id: 'worker-1' },
                { worker_id: 'worker-2' }
            ]);

            // Mock database queries
            db.query
                .mockResolvedValueOnce({ rows: [{ total: 100, success: 90, failed: 10, total_retries: 5 }] })
                .mockResolvedValueOnce({ rows: [{ lag_seconds: 0 }] });

            await systemController.getSystemStatus(req, res, next);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'success',
                    data: expect.any(Object)
                })
            );
        });

        it('should handle errors gracefully', async () => {
            etcdClient.election = jest.fn().mockImplementation(() => {
                throw new Error('Etcd error');
            });

            workersRepo.getActiveWorkers.mockResolvedValue([]);
            db.query
                .mockResolvedValueOnce({ rows: [{ total: 0, success: 0, failed: 0, total_retries: 0 }] })
                .mockResolvedValueOnce({ rows: [{ lag_seconds: 0 }] });

            await systemController.getSystemStatus(req, res, next);

            expect(res.json).toHaveBeenCalled();
        });
    });
});
