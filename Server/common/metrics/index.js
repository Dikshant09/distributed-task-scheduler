const client = require('prom-client');

// Collect default metrics (CPU, Memory, etc.)
client.collectDefaultMetrics();

// Custom Metrics
const dispatchLag = new client.Histogram({
    name: 'task_dispatch_lag_seconds',
    help: 'Time difference between scheduled_at and dispatch time',
    buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const leaseContention = new client.Counter({
    name: 'task_lease_contention_total',
    help: 'Number of times lease acquisition failed due to race condition'
});

const retryCount = new client.Counter({
    name: 'task_retry_total',
    help: 'Total number of task retries',
    labelNames: ['status']
});

const dlqSize = new client.Gauge({
    name: 'task_dlq_size',
    help: 'Current number of tasks in the Dead Letter Queue'
});

const activeWorkers = new client.Gauge({
    name: 'active_workers',
    help: 'Number of currently active workers'
});

module.exports = {
    client,
    dispatchLag,
    leaseContention,
    retryCount,
    dlqSize,
    activeWorkers
};
