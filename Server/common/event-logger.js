const db = require('../db');
const logger = require('./logger');

/**
 * Event logger for tracking system events
 * Events are stored in memory (last 100) and can be extended to database
 */
class EventLogger {
    constructor() {
        this.events = [];
        this.maxEvents = 100;
    }

    /**
     * Log a system event
     * @param {string} type - Event type: 'LEADER_ELECTED', 'WORKER_FAILED', 'SCHEDULER_DISABLED', etc.
     * @param {string} message - Human-readable message
     * @param {object} metadata - Additional event data
     */
    log(type, message, metadata = {}) {
        const event = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type,
            message,
            metadata,
            timestamp: new Date().toISOString()
        };

        this.events.unshift(event); // Add to beginning

        // Keep only last N events
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }

        logger.info(`[EVENT] ${type}: ${message}`, metadata);
    }

    /**
     * Get recent events
     * @param {number} limit - Number of events to return
     * @returns {Array} Recent events
     */
    getRecent(limit = 50) {
        return this.events.slice(0, limit);
    }

    /**
     * Get events by type
     * @param {string} type - Event type to filter
     * @param {number} limit - Number of events to return
     * @returns {Array} Filtered events
     */
    getByType(type, limit = 50) {
        return this.events.filter(e => e.type === type).slice(0, limit);
    }

    /**
     * Clear all events
     */
    clear() {
        this.events = [];
        logger.info('[EVENT] Event log cleared');
    }
}

module.exports = new EventLogger();
