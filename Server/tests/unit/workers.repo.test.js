const workersRepo = require('../../db/repositories/workers.repo');
const db = require('../../db');

jest.mock('../../db');

describe('Workers Repository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('upsertHeartbeat', () => {
        it('should insert new worker heartbeat', async () => {
            const workerId = 'worker-123';

            // Mock count query (less than 10 workers)
            db.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
            // Mock upsert query
            db.query.mockResolvedValueOnce({ rows: [] });

            await workersRepo.upsertHeartbeat(workerId);

            expect(db.query).toHaveBeenCalledTimes(2);
        });

        it('should enforce 10-worker limit by removing oldest', async () => {
            const workerId = 'worker-new';

            // Mock: 10 workers exist
            db.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
            // Mock: Check if worker exists (it doesn't)
            db.query.mockResolvedValueOnce({ rows: [] });
            // Mock: Delete oldest worker (DELETE query has no parameters in the actual code)
            db.query.mockResolvedValueOnce({ rows: [] });
            // Mock: Upsert new worker
            db.query.mockResolvedValueOnce({ rows: [] });

            await workersRepo.upsertHeartbeat(workerId);

            expect(db.query).toHaveBeenCalledTimes(4);
            // Verify delete was called (3rd call)
            const deleteCall = db.query.mock.calls[2];
            expect(deleteCall[0]).toContain('DELETE FROM workers');
        });

        it('should update existing worker heartbeat', async () => {
            const workerId = 'worker-existing';

            db.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
            db.query.mockResolvedValueOnce({ rows: [] });

            await workersRepo.upsertHeartbeat(workerId);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT'),
                [workerId]
            );
        });
    });

    describe('getActiveWorkers', () => {
        it('should retrieve all active workers', async () => {
            const mockWorkers = [
                { worker_id: 'worker-1', last_heartbeat: new Date(), status: 'ALIVE' },
                { worker_id: 'worker-2', last_heartbeat: new Date(), status: 'ALIVE' }
            ];

            db.query.mockResolvedValue({ rows: mockWorkers });

            const result = await workersRepo.getActiveWorkers();

            expect(result).toEqual(mockWorkers);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE last_heartbeat >='),
                [15]
            );
        });
    });

    describe('getDeadWorkers', () => {
        it('should identify workers with stale heartbeats', async () => {
            const deadWorkers = [
                { worker_id: 'worker-dead-1' }
            ];

            db.query.mockResolvedValue({ rows: deadWorkers });

            const result = await workersRepo.getDeadWorkers();

            expect(result).toEqual(deadWorkers);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE last_heartbeat <'),
                [15]
            );
        });
    });
});
