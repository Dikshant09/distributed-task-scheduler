const eventLogger = require('../../common/event-logger');

/**
 * GET /events
 * Get recent system events
 */
const getEvents = async (req, res, next) => {
    try {
        const { limit = 50, type, taskId } = req.query;

        let events;
        if (taskId) {
            // Filter by taskId in metadata
            events = (await eventLogger.getRecent(1000)).filter(e =>
                e.metadata && e.metadata.taskId === taskId
            ).slice(0, parseInt(limit));
        } else if (type) {
            events = await eventLogger.getByType(type, parseInt(limit));
        } else {
            events = await eventLogger.getRecent(parseInt(limit));
        }

        res.json({
            status: 'success',
            data: { events }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEvents
};
