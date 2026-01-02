const logger = require('../../common/logger');
const { AppError } = require('../../common/errors/custom-errors');

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (err.statusCode === 500) {
        logger.error('Unhandled Exception:', err);
    } else {
        logger.warn(`Operational Error: ${err.message}`, { statusCode: err.statusCode });
    }

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
