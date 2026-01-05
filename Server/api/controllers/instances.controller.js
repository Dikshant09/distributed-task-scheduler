const logger = require('../../common/logger');
const processRegistry = require('../../common/process-registry');

/**
 * GET /system/instances
 * Returns all registered scheduler and worker instances
 */
const getInstances = async (req, res, next) => {
    try {
        const instances = await processRegistry.getAll();

        res.json({
            status: 'success',
            data: {
                schedulers: instances.schedulers,
                workers: instances.workers,
                summary: {
                    totalSchedulers: instances.schedulers.length,
                    totalWorkers: instances.workers.length,
                    leaderCount: instances.schedulers.filter(s => s.isLeader).length
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInstances
};
