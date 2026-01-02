const client = require('./etcd-client');
const config = require('../../common/config');
const logger = require('../../common/logger');
const { EventEmitter } = require('events');

class LeaderElection extends EventEmitter {
    constructor() {
        super();
        this.key = '/scheduler/leader';
        this.id = config.server.host || `scheduler-${Math.random().toString(36).substr(2, 9)}`;
        this.lease = null;
        this.election = null;
        this.isLeader = false;
    }

    async start() {
        this.election = client.election(this.key);
        this._campaign();
    }

    async _campaign() {
        logger.info(`Starting campaign for leadership as ${this.id}`);
        try {
            // Create a campaign
            const campaign = this.election.campaign(this.id);

            campaign.on('elected', () => {
                this.isLeader = true;
                logger.info(`I am the leader (${this.id})`);
                this.emit('elected');
            });

            campaign.on('lost', () => {
                this.isLeader = false;
                logger.info(`Lost leadership (${this.id})`);
                this.emit('lost');
                // Retry campaign
                setTimeout(() => this._campaign(), 1000);
            });

            campaign.on('error', (err) => {
                logger.error('Election error', err);
            });

        } catch (err) {
            logger.error('Campaign start error', err);
            setTimeout(() => this._campaign(), 2000);
        }
    }

    async getLeaderEpoch() {
        // Ideally we store a revision or epoch in Etcd. 
        // For simplicity, we can use the cluster revision.
        // This is needed for fencing.
        // We can just use a timestamp or a counter we increment in Etcd manually on election.
        // Let's assume we read a global counter.
        return Date.now(); // Simplified epoch
    }

    // Helper methods for system status API
    checkIsLeader() {
        return this.isLeader;
    }

    getLeaderId() {
        return this.id;
    }

    getLeaderUptime() {
        // Return uptime in seconds since becoming leader
        // For now, simplified - would track actual election time
        return this.isLeader ? Math.floor(process.uptime()) : 0;
    }
}

module.exports = new LeaderElection();
