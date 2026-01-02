# Worker

Task executor with lease-based execution (Data Plane).

## Purpose

Execute tasks safely with:
- Lease-based execution (prevents duplicate work)
- Automatic retry on failure
- Heartbeat monitoring
- Support for multiple job types

## Structure

```
worker/
├── executor/         # Task execution logic
├── heartbeat/       # Heartbeat sender
└── index.js         # Worker entry point
```

## Components

### 1. Worker Loop (`index.js`)

**Main Process:**
```
1. Consume from Redis Streams (XREADGROUP)
2. Check if task already completed (idempotency)
3. Acquire database lease (atomic)
4. Start lease renewer (every 10s)
5. Execute task
6. Update status (SUCCESS/FAILED)
7. Stop lease renewer
8. ACK message in Redis
```

**Key Functions:**
- `processTask()` - Main task processing logic
- `startWorker()` - Worker loop

### 2. Task Executor (`executor/`)

**File:** `task-executor.js`

**Supported Job Types:**

#### HTTP Task
Execute HTTP requests with configurable method, headers, body, timeout.

**Payload:**
```json
{
  "method": "POST",
  "url": "https://api.example.com/webhook",
  "headers": {"Authorization": "Bearer token"},
  "body": {"event": "test"},
  "timeout_ms": 5000
}
```

#### Shell Task
Execute shell commands with timeout.

**Payload:**
```json
{
  "command": "echo 'Hello World'",
  "timeout_ms": 15000
}
```

#### Delay Task
Simulate work with configurable duration and failure probability (for testing).

**Payload:**
```json
{
  "duration_ms": 5000,
  "fail_probability": 0.1
}
```

### 3. Heartbeat Sender (`heartbeat/`)

**File:** `heartbeat-sender.js`

**Purpose:** Send periodic heartbeats to prove worker is alive.

**Mechanism:**
- Sends heartbeat every 5 seconds
- Updates `workers` table with `last_heartbeat = NOW()`
- Worker monitor detects dead workers (no heartbeat for 15s)

## Lease-Based Execution

### Why Leases?

Prevents duplicate execution when:
- Multiple workers consume same message
- Worker crashes mid-execution
- Network partitions occur

### How it Works

**Acquire Lease:**
```sql
UPDATE tasks
SET assigned_worker_id = 'worker-abc123',
    lease_expiry = NOW() + INTERVAL '30 seconds',
    status = 'RUNNING'
WHERE id = ?
AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

**Key Points:**
- Atomic operation (only one worker succeeds)
- Lease expires after 30 seconds
- Renewed every 10 seconds during execution

**Renew Lease:**
```sql
UPDATE tasks
SET lease_expiry = NOW() + INTERVAL '30 seconds'
WHERE id = ? AND assigned_worker_id = 'worker-abc123';
```

**If renewal fails:** Worker aborts execution.

## Failure Handling

### On Task Failure

1. Catch exception
2. Calculate exponential backoff:
   ```javascript
   nextRetryAt = NOW() + min(1000 * 2^attempt, 60000)
   ```
3. Update database:
   ```sql
   UPDATE tasks
   SET status = 'FAILED',
       attempt = attempt + 1,
       next_retry_at = ?
   ```
4. Retry loop picks it up later

### Retry Schedule

- Attempt 1: Immediate
- Attempt 2: +1 second
- Attempt 3: +2 seconds
- Attempt 4: +4 seconds
- Attempt 5: +8 seconds
- Attempt 6+: +60 seconds (capped)

After `max_attempts` (default: 5), task moves to DLQ.

## Starting a Worker

```bash
# Development
npm run dev:worker

# Production
node worker/index.js

# Multiple workers (scale horizontally)
node worker/index.js &
node worker/index.js &
node worker/index.js &
```

## Worker ID

Each worker generates a unique ID:
```javascript
const WORKER_ID = `worker-${generateId().substring(0, 8)}`;
// Example: worker-abc12345
```

## Scaling Workers

Workers are **stateless** and can scale horizontally:

```
Redis Streams (Consumer Group)
  ↓
├─ Worker 1 (consumes messages)
├─ Worker 2 (consumes messages)
├─ Worker 3 (consumes messages)
└─ Worker N (consumes messages)
```

**Benefits:**
- Load distribution via consumer groups
- Fault tolerance (if one worker dies, others continue)
- Linear scaling (add more workers = more throughput)

## Configuration

Environment variables:
- `LEASE_DURATION` - Lease expiry time (default: 30000ms)
- `HEARTBEAT_INTERVAL` - Heartbeat frequency (default: 5000ms)
- `REDIS_HOST`, `REDIS_PORT` - Redis connection

## Observability

**Logs:**
- Task received: "Received task X (Attempt: 2)"
- Lease acquired: "Acquired lease for task X"
- Execution: "Executing task X (Type: HTTP)"
- Success: "Task X SUCCEEDED"
- Failure: "Task X FAILED"

**Metrics:**
- Execution time per task
- Success/failure rates
- Lease acquisition failures

## Design Principles

1. **Lease-Based** - Prevents duplicate execution
2. **Idempotent** - Safe to retry
3. **Stateless** - Workers can scale horizontally
4. **Fail-Safe** - Lease expires if worker crashes
5. **Observable** - Comprehensive logging
