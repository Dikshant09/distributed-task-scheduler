# Scheduler

Time-based dispatcher with leader election and retry management.

## Purpose

Bridge wall-clock time to asynchronous execution by:
1. Polling database for jobs where `scheduled_at <= NOW()`
2. Pushing eligible jobs to Redis Streams
3. Handling retry logic (FAILED → PENDING)
4. Monitoring Dead Letter Queue

## Structure

```
scheduler/
├── task-dispatcher/     # Dispatch & retry loops
├── leader-election/     # Etcd-based leader election
├── heartbeat/          # Worker monitoring
├── dead-letter/        # DLQ handler
└── index.js            # Scheduler entry point
```

## Components

### 1. Task Dispatcher (`task-dispatcher/`)

**File:** `dispatcher.js`

**Responsibilities:**
- **Dispatch Loop** (every 1s): Find PENDING jobs, push to Redis
- **Retry Loop** (every 5s): Reset FAILED jobs to PENDING when ready

**Key Methods:**
- `_dispatchLoop()` - Polls DB, pushes to queue, marks DISPATCHED
- `_retryLoop()` - Finds retryable tasks, resets or moves to DLQ

**Leader-Elected:** Only the leader runs these loops.

### 2. Leader Election (`leader-election/`)

**File:** `leader-election.js`

**Purpose:** Ensure only one scheduler instance dispatches jobs.

**Mechanism:**
- Uses Etcd for distributed coordination
- 10-second lease with auto-renewal
- Emits `elected` and `lost` events
- Automatic failover on leader crash

**Key Methods:**
- `start()` - Campaign for leadership
- `checkIsLeader()` - Check if this instance is leader
- `getLeaderEpoch()` - Get current leader's epoch

### 3. Heartbeat Monitor (`heartbeat/`)

**File:** `worker-monitor.js`

**Purpose:** Detect dead workers and release their leases.

**How it works:**
- Checks for workers with `last_heartbeat < NOW() - 15s`
- Releases leases held by dead workers
- Allows tasks to be re-executed

### 4. DLQ Handler (`dead-letter/`)

**File:** `dlq-handler.js`

**Purpose:** Monitor and manage Dead Letter Queue.

**Features:**
- Monitors DLQ every 30 seconds
- Logs DLQ tasks for alerting
- Alerts when DLQ size > 100
- Supports manual retry from DLQ
- Cleanup of old DLQ tasks

## Data Flow

```
Scheduler (Leader)
  ↓
1. Poll DB: SELECT * FROM tasks WHERE status='PENDING' AND scheduled_at <= NOW()
  ↓
2. Push to Redis: XADD tasks:pending
  ↓
3. Mark DB: UPDATE tasks SET status='DISPATCHED'
  ↓
Workers consume from Redis
```

## Retry Flow

```
Worker fails task
  ↓
UPDATE status='FAILED', next_retry_at=NOW()+backoff
  ↓
Retry Loop (every 5s)
  ↓
SELECT * FROM tasks WHERE status='FAILED' AND next_retry_at <= NOW()
  ↓
If attempt < max_attempts:
  UPDATE status='PENDING' (retry)
Else:
  UPDATE status='DLQ' (give up)
```

## Starting the Scheduler

```bash
# Development
npm run dev:scheduler

# Production
node scheduler/index.js
```

## Leader Election Flow

```
Instance 1 starts → Campaigns for leadership → Becomes leader
Instance 2 starts → Campaigns for leadership → Waits as standby
Instance 3 starts → Campaigns for leadership → Waits as standby

Instance 1 crashes → Lease expires → Instance 2 becomes leader
```

## Configuration

Environment variables:
- `DISPATCH_INTERVAL` - Dispatch loop interval (default: 1000ms)
- `RETRY_INTERVAL` - Retry loop interval (default: 5000ms)
- `ETCD_HOSTS` - Etcd connection string

## Observability

**Logs:**
- Dispatch events: "Dispatched N tasks"
- Retry events: "Task X reset for retry"
- DLQ events: "Task X moved to DLQ"
- Leader events: "Became Leader", "Lost leadership"

**Metrics:**
- Dispatch lag (time between scheduled_at and dispatch)
- Queue depth
- DLQ size

## Design Principles

1. **Leader-Elected** - Only one active dispatcher
2. **Batch Operations** - Process up to 100 tasks per loop
3. **Separation of Concerns** - Dispatch ≠ Execution
4. **Fault Tolerant** - Survives leader crashes
5. **Observable** - Comprehensive logging
