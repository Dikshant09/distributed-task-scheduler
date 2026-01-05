const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Shared state manager for scheduler enabled/disabled status
 * Uses a simple file-based approach for cross-process communication
 * 
 * Two independent states:
 * - enabled: Controls the entire scheduler (coordinator + dispatcher)
 * - queuePaused: Only pauses the dispatcher (coordinator continues marking READY)
 */
class SchedulerState {
    constructor() {
        this.statePath = path.join(__dirname, '../../.scheduler-state.json');
        this.cache = { enabled: true, queuePaused: false };
    }

    async _load() {
        try {
            const data = await fs.readFile(this.statePath, 'utf8');
            this.cache = JSON.parse(data);
            // Ensure queuePaused exists for backward compatibility
            if (this.cache.queuePaused === undefined) {
                this.cache.queuePaused = false;
            }
        } catch (err) {
            // File doesn't exist yet, use default
            this.cache = { enabled: true, queuePaused: false };
        }
    }

    async _save() {
        try {
            await fs.writeFile(this.statePath, JSON.stringify(this.cache, null, 2));
        } catch (err) {
            logger.error('Failed to save scheduler state', err);
        }
    }

    // ============ Scheduler Enable/Disable ============
    // Affects BOTH coordinator and dispatcher

    async setEnabled(enabled) {
        await this._load();
        this.cache.enabled = enabled;
        await this._save();
        logger.info(`Scheduler state set to: ${enabled ? 'enabled' : 'disabled'}`);
    }

    async isEnabled() {
        await this._load();
        return this.cache.enabled;
    }

    // ============ Queue Pause/Resume ============
    // Only affects the dispatcher (coordinator continues marking READY)

    async setQueuePaused(paused) {
        await this._load();
        this.cache.queuePaused = paused;
        await this._save();
        logger.info(`Queue state set to: ${paused ? 'paused' : 'running'}`);
    }

    async isQueuePaused() {
        await this._load();
        return this.cache.queuePaused;
    }
}

module.exports = new SchedulerState();

