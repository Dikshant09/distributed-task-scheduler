const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Shared state manager for scheduler enabled/disabled status
 * Uses a simple file-based approach for cross-process communication
 */
class SchedulerState {
    constructor() {
        this.statePath = path.join(__dirname, '../../.scheduler-state.json');
        this.cache = { enabled: true };
    }

    async _load() {
        try {
            const data = await fs.readFile(this.statePath, 'utf8');
            this.cache = JSON.parse(data);
        } catch (err) {
            // File doesn't exist yet, use default
            this.cache = { enabled: true };
        }
    }

    async _save() {
        try {
            await fs.writeFile(this.statePath, JSON.stringify(this.cache, null, 2));
        } catch (err) {
            logger.error('Failed to save scheduler state', err);
        }
    }

    async setEnabled(enabled) {
        this.cache.enabled = enabled;
        await this._save();
        logger.info(`Scheduler state set to: ${enabled ? 'enabled' : 'disabled'}`);
    }

    async isEnabled() {
        await this._load();
        return this.cache.enabled;
    }
}

module.exports = new SchedulerState();
