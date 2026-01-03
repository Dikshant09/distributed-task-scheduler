const eventLogger = require('../../common/event-logger');

/**
 * GET /events
 * Get recent system events
 */
const getEvents = async (req, res, next) => {
    try {
        const { limit = 50, type } = req.query;

        let events;
        if (type) {
            events = eventLogger.getByType(type, parseInt(limit));
        } else {
            events = eventLogger.getRecent(parseInt(limit));
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
