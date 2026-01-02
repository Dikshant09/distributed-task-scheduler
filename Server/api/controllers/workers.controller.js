const db = require('../../db');

const getWorkers = async (req, res, next) => {
    try {
        const query = 'SELECT * FROM workers ORDER BY last_heartbeat DESC';
        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: { workers: result.rows }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWorkers
};
