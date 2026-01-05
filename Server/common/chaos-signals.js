/**
 * Chaos Signals - Simple Redis pub/sub for cross-container chaos testing
 * 
 * Usage:
 *   Publisher (API):     chaosSignals.killScheduler('scheduler-abc1')
 *   Subscriber (Sched):  chaosSignals.onKillScheduler(myId, () => process.exit(1))
 */
const Redis = require('ioredis');

const CHANNEL = 'chaos:signals';

class ChaosSignals {
    constructor() {
        // Lazy init - only create connections when needed
        this._pub = null;
        this._sub = null;
    }

    _getRedisUrl() {
        return process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    }

    _getPub() {
        if (!this._pub) {
            this._pub = new Redis(this._getRedisUrl());
        }
        return this._pub;
    }

    _getSub() {
        if (!this._sub) {
            this._sub = new Redis(this._getRedisUrl());
            this._sub.subscribe(CHANNEL);
        }
        return this._sub;
    }

    // === Publisher methods (called from API) ===

    async killScheduler(schedulerId) {
        await this._getPub().publish(CHANNEL, JSON.stringify({
            type: 'KILL_SCHEDULER',
            targetId: schedulerId
        }));
    }

    async killWorker(workerId) {
        await this._getPub().publish(CHANNEL, JSON.stringify({
            type: 'KILL_WORKER',
            targetId: workerId
        }));
    }

    // === Subscriber methods (called from services) ===

    onKillScheduler(myId, callback) {
        this._getSub().on('message', (channel, message) => {
            const signal = JSON.parse(message);
            if (signal.type === 'KILL_SCHEDULER' && signal.targetId === myId) {
                callback();
            }
        });
    }

    onKillWorker(myId, callback) {
        this._getSub().on('message', (channel, message) => {
            const signal = JSON.parse(message);
            if (signal.type === 'KILL_WORKER' && signal.targetId === myId) {
                callback();
            }
        });
    }
}

module.exports = new ChaosSignals();
