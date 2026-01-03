const db = require('../../db');

const getWorkers = async (req, res, next) => {
    try {
        // Show ALL workers with calculated status based on heartbeat age
        // Heartbeat interval is 5 seconds, so 15 seconds = 3 missed heartbeats
        const query = `
            SELECT 
                worker_id, 
                last_heartbeat,
                CASE 
                    WHEN last_heartbeat >= NOW() - INTERVAL '15 seconds' THEN 'ALIVE'
                    ELSE 'DEAD'
                END as status
            FROM workers
            ORDER BY 
                CASE 
                    WHEN last_heartbeat >= NOW() - INTERVAL '15 seconds' THEN 0
                    ELSE 1
                END,
                last_heartbeat DESC
        `;
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
