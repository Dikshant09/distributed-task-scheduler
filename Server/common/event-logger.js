const logger = require('./logger');
const Redis = require('ioredis');

/**
 * Event logger for tracking system events
 * Uses Redis for cross-process event sharing
 */
class EventLogger {
    constructor() {
        // Support both REDIS_URL (production) and default (development)
        this.redis = process.env.REDIS_URL
            ? new Redis(process.env.REDIS_URL, {
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            })
            : new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            });
        this.eventsKey = 'system:events';
        this.maxEvents = 200; // Keep more events in Redis
    }

    /**
     * Log a system event
     * @param {string} type - Event type: 'LEADER_ELECTED', 'WORKER_FAILED', 'SCHEDULER_DISABLED', etc.
     * @param {string} message - Human-readable message
     * @param {object} metadata - Additional event data
     */
    async log(type, message, metadata = {}) {
        const event = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type,
            message,
            metadata,
            timestamp: new Date().toISOString()
        };

        try {
            // Add to Redis list (LPUSH adds to beginning)
            await this.redis.lpush(this.eventsKey, JSON.stringify(event));

            // Trim to keep only last N events
            await this.redis.ltrim(this.eventsKey, 0, this.maxEvents - 1);

            logger.info(`[EVENT] ${type}: ${message}`, metadata);
        } catch (err) {
            logger.error('Failed to log event to Redis', err);
        }
    }

    /**
     * Get recent events
     * @param {number} limit - Number of events to return
     * @returns {Array} Recent events
     */
    async getRecent(limit = 50) {
        try {
            const events = await this.redis.lrange(this.eventsKey, 0, limit - 1);
            return events.map(e => JSON.parse(e));
        } catch (err) {
            logger.error('Failed to get events from Redis', err);
            return [];
        }
    }

    /**
     * Get events by type
     * @param {string} type - Event type to filter
     * @param {number} limit - Number of events to return
     * @returns {Array} Filtered events
     */
    async getByType(type, limit = 50) {
        try {
            const allEvents = await this.getRecent(this.maxEvents);
            return allEvents.filter(e => e.type === type).slice(0, limit);
        } catch (err) {
            logger.error('Failed to filter events', err);
            return [];
        }
    }

    /**
     * Clear all events
     */
    async clear() {
        try {
            await this.redis.del(this.eventsKey);
            logger.info('[EVENT] Event log cleared');
        } catch (err) {
            logger.error('Failed to clear events', err);
        }
    }
}

module.exports = new EventLogger();
