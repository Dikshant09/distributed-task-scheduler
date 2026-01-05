const etcd = require('./etcd-client');
const logger = require('../logger');
const config = require('../config');
const { EventEmitter } = require('events');

/**
 * LeaderElection class for managing distributed leader election via etcd
 * 
 * SRP: This class ONLY handles leader election mechanics.
 * It emits 'elected' and 'demoted' events that consumers (e.g., SchedulerCoordinator) handle.
 * 
 * Uses etcd3's campaign event-based pattern for proper leadership change detection.
 */
class LeaderElection extends EventEmitter {
    constructor(nodeId) {
        super();
        this.nodeId = nodeId;
        this.isLeader = false;
        this.electionKey = nodeId || `scheduler-${process.pid}`;
        this.election = null;
        this.campaign = null;
        this.campaigning = false;
        this.leadershipStart = null;
    }

    async startElection() {
        this.campaigning = true;
        logger.info(`Starting leader election for ${this.electionKey}`);

        try {
            // Create election with 10-second TTL for faster failover
            this.election = etcd.election('/scheduler/leader', 10);
            await this._campaign();
        } catch (err) {
            logger.error('Leader election error', err);
            if (this.campaigning) setTimeout(() => this._campaign(), 5000);
        }
    }

    async _campaign() {
        if (!this.campaigning) return;

        logger.info(`Starting campaign for leadership as ${this.electionKey}`);

        try {
            // Start campaign - returns a Campaign object with event emitters
            this.campaign = this.election.campaign(this.electionKey);

            // Listen for election events from the campaign
            this.campaign.on('elected', () => {
                this.isLeader = true;
                this.leadershipStart = Date.now();
                logger.info(`Elected as leader: ${this.electionKey}`);
                this.emit('elected');
            });

            this.campaign.on('lost', () => {
                const wasLeader = this.isLeader;
                this.isLeader = false;
                this.leadershipStart = null;
                logger.warn(`Lost leadership: ${this.electionKey}`);

                if (wasLeader) {
                    this.emit('demoted');
                }

                // Re-campaign after losing leadership
                if (this.campaigning) {
                    setTimeout(() => this._campaign(), 1000);
                }
            });

            this.campaign.on('error', (err) => {
                logger.error('Leader election campaign error', err);
                if (this.campaigning) {
                    setTimeout(() => this._campaign(), 2000);
                }
            });

        } catch (err) {
            logger.error('Campaign start error', err);
            if (this.campaigning) setTimeout(() => this._campaign(), 2000);
        }
    }

    async resignLeadership() {
        this.campaigning = false;

        if (this.campaign) {
            try {
                await this.campaign.resign();
            } catch (err) {
                logger.warn('Error resigning campaign', err.message);
            }
        }

        this.isLeader = false;
        this.leadershipStart = null;
        logger.info('Resigned leadership');
    }

    getIsLeader() {
        return this.isLeader;
    }

    getLeaderUptime() {
        return this.isLeader ? Math.round((Date.now() - this.leadershipStart) / 1000) : 0;
    }
}

module.exports = LeaderElection;

