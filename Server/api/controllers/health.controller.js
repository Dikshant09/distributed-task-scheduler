const db = require('../../db');

const checkHealth = async (req, res, next) => {
    try {
        // Check DB connection
        await db.query('SELECT 1');

        res.status(200).json({
            status: 'success',
            message: 'Service is healthy',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'Service unavailable',
            details: error.message
        });
    }
};

module.exports = {
    checkHealth
};
