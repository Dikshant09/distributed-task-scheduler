const logger = require('../../common/logger');
const { generateId } = require('../../common/utils/uuid');

const requestLogger = (req, res, next) => {
    req.id = req.headers['x-request-id'] || generateId();
    res.setHeader('X-Request-Id', req.id);

    logger.info(`Incoming Request: ${req.method} ${req.url}`, {
        requestId: req.id,
        ip: req.ip
    });

    next();
};

module.exports = requestLogger;
