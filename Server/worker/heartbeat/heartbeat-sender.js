const workersRepo = require('../../db/repositories/workers.repo');
const logger = require('../../common/logger');

class HeartbeatSender {
    constructor(workerId, intervalMs = 5000) {
        this.workerId = workerId;
        this.intervalMs = intervalMs;
        this.timer = null;
    }

    start() {
        this._send();
        this.timer = setInterval(() => this._send(), this.intervalMs);
        logger.info(`Heartbeat sender started for worker ${this.workerId}`);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async _send() {
        try {
            await workersRepo.upsertHeartbeat(this.workerId);
        } catch (err) {
            logger.error('Failed to send heartbeat', err);
        }
    }
}

module.exports = HeartbeatSender;
