const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Simple file-based process registry to track scheduler and worker instances
 * Format: JSON file with { schedulers: [], workers: [] }
 */
class ProcessRegistry {
    constructor() {
        this.registryPath = path.join(__dirname, '../../.process-registry.json');
        this.cache = { schedulers: [], workers: [] };
    }

    async _load() {
        try {
            const data = await fs.readFile(this.registryPath, 'utf8');
            this.cache = JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                // File doesn't exist yet, use empty cache
                this.cache = { schedulers: [], workers: [] };
            } else {
                logger.error('Failed to load process registry', err);
                // Return empty cache on error to be safe
                this.cache = { schedulers: [], workers: [] };
            }
        }
    }

    async _save() {
        // Retry with exponential backoff to handle concurrent writes
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await fs.writeFile(this.registryPath, JSON.stringify(this.cache, null, 2));
                return; // Success
            } catch (err) {
                if (attempt === maxRetries - 1) {
                    logger.error('Failed to save process registry after retries', err);
                } else {
                    // Exponential backoff with jitter: 10ms, 20ms, 40ms + random
                    const delay = Math.pow(2, attempt) * 10 + Math.random() * 10;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }

    /**
     * Register a scheduler instance
     * @param {string} id - Scheduler ID
     * @param {number} pid - Process ID
     * @param {boolean} isLeader - Whether this is the leader
     */
    async registerScheduler(id, pid, isLeader = false) {
        await this._load();

        // Remove existing entry if present
        this.cache.schedulers = this.cache.schedulers.filter(s => s.id !== id);

        this.cache.schedulers.push({
            id,
            pid,
            isLeader,
            startedAt: new Date().toISOString()
        });

        await this._save();
        logger.info(`Registered scheduler ${id} (PID: ${pid}, Leader: ${isLeader})`);
    }

    /**
     * Register a worker instance
     * @param {string} id - Worker ID
     * @param {number} pid - Process ID
     */
    async registerWorker(id, pid) {
        // Add small random delay to reduce simultaneous writes
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

        await this._load();

        // Remove existing entry if present
        this.cache.workers = this.cache.workers.filter(w => w.id !== id);

        this.cache.workers.push({
            id,
            pid,
            status: 'active',
            startedAt: new Date().toISOString()
        });

        await this._save();
        logger.info(`Registered worker ${id} (PID: ${pid})`);
    }

    /**
     * Update scheduler leader status
     * @param {string} id - Scheduler ID
     * @param {boolean} isLeader - Whether this is the leader
     */
    async updateSchedulerLeader(id, isLeader) {
        await this._load();

        // Update all schedulers: new leader becomes true, others become false
        this.cache.schedulers = this.cache.schedulers.map(s => ({
            ...s,
            isLeader: s.id === id ? isLeader : false
        }));

        await this._save();
        logger.info(`Updated scheduler ${id} leader status: ${isLeader}`);
    }

    /**
     * Unregister a scheduler
     * @param {string} id - Scheduler ID
     */
    async unregisterScheduler(id) {
        await this._load();
        this.cache.schedulers = this.cache.schedulers.filter(s => s.id !== id);
        await this._save();
        logger.info(`Unregistered scheduler ${id}`);
    }

    /**
     * Unregister a worker
     * @param {string} id - Worker ID
     */
    async unregisterWorker(id) {
        await this._load();
        this.cache.workers = this.cache.workers.filter(w => w.id !== id);
        await this._save();
        logger.info(`Unregistered worker ${id}`);
    }

    /**
     * Get all registered instances
     */
    async getAll() {
        await this._load();

        // Clean up dead processes
        await this._cleanupDeadProcesses();

        return this.cache;
    }

    /**
     * Get current leader scheduler
     */
    async getLeader() {
        await this._load();
        return this.cache.schedulers.find(s => s.isLeader);
    }

    /**
     * Get all schedulers
     */
    async getSchedulers() {
        await this._load();
        await this._cleanupDeadProcesses();
        return this.cache.schedulers;
    }

    /**
     * Get all workers
     */
    async getWorkers() {
        await this._load();
        await this._cleanupDeadProcesses();
        return this.cache.workers;
    }

    /**
     * Clean up processes that are no longer running
     */
    async _cleanupDeadProcesses() {
        let changed = false;

        // Check schedulers
        this.cache.schedulers = this.cache.schedulers.filter(s => {
            if (!this._isProcessAlive(s.pid)) {
                logger.info(`Removing dead scheduler ${s.id} (PID: ${s.pid})`);
                changed = true;
                return false;
            }
            return true;
        });

        // Check workers
        this.cache.workers = this.cache.workers.filter(w => {
            if (!this._isProcessAlive(w.pid)) {
                logger.info(`Removing dead worker ${w.id} (PID: ${w.pid})`);
                changed = true;
                return false;
            }
            return true;
        });

        if (changed) {
            await this._save();
        }
    }

    /**
     * Check if a process is still alive
     * @param {number} pid - Process ID
     */
    _isProcessAlive(pid) {
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Clear all registrations (for testing)
     */
    async clear() {
        this.cache = { schedulers: [], workers: [] };
        await this._save();
        logger.info('Cleared process registry');
    }
}

module.exports = new ProcessRegistry();
