const { ValidationError } = require('../../common/errors/custom-errors');
const { isExpired } = require('../../common/utils/time');

const validateJob = (req, res, next) => {
    const { type, payload, scheduledAt, idempotencyKey } = req.body;

    if (!type || typeof type !== 'string') {
        return next(new ValidationError('Task type is required and must be a string'));
    }

    if (!payload || typeof payload !== 'object') {
        return next(new ValidationError('Task payload is required and must be an object'));
    }

    if (scheduledAt && isNaN(Date.parse(scheduledAt))) {
        return next(new ValidationError('Invalid scheduledAt date format'));
    }

    // Optional: check if scheduledAt is in the past? No, maybe we want to schedule immediately.
    // Actually, if it's in the past, it just runs immediately.

    if (!idempotencyKey) {
        // Generate one or require it? LLD says "Enforce idempotency", usually implies client sends it.
        // But we can generate if missing, but then we lose client-side retry safety.
        // Let's require it for strictness, or auto-generate. Let's require it.
        // return next(new ValidationError('idempotencyKey is required'));
    }

    next();
};

module.exports = validateJob;
