# Low-Level Design (LLD)
## Distributed Task Scheduler - Implementation Details

---

## 1. Database Schema

### 1.1 Tasks Table

```sql
CREATE TABLE tasks (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    
    -- Payload & Scheduling
    payload JSONB NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,
    
    -- Status Tracking
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    next_retry_at TIMESTAMP,
    
    -- Execution Tracking
    assigned_worker_id VARCHAR(50),
    lease_expiry TIMESTAMP,
    leader_epoch BIGINT,
    
    -- Failure Handling
    dlq_reason TEXT,
    
    -- Idempotency & Audit
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_status_scheduled ON tasks(status, scheduled_at);
CREATE INDEX idx_tasks_idempotency ON tasks(idempotency_key);
CREATE INDEX idx_tasks_worker_running ON tasks(assigned_worker_id) WHERE status = 'RUNNING';
CREATE INDEX idx_tasks_retry ON tasks(status, next_retry_at) WHERE status = 'FAILED';
```

**Status Values:**
- `PENDING` - Created, waiting for dispatch
- `DISPATCHED` - Pushed to queue
- `RUNNING` - Worker executing
- `SUCCESS` - Completed successfully
- `FAILED` - Failed, will retry
- `DLQ` - Dead letter queue (max retries exceeded)

### 1.2 Workers Table

```sql
CREATE TABLE workers (
    worker_id VARCHAR(50) PRIMARY KEY,
    last_heartbeat TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL
);
```

### 1.3 Task Executions Table

**Purpose:** Store bounded execution output for observability and debugging.

```sql
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP NOT NULL,
    duration_ms INT,
    
    output JSONB,
    error TEXT,
    truncated BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_task_executions_status ON task_executions(status);
```

**Design Principles:**
- **Separate table** - Keeps core `tasks` table lean
- **Per-attempt records** - Full execution history
- **Bounded output** - Max 16KB per execution
- **Truncatable** - Large outputs truncated with flag

**Output Schema by Job Type:**

**HTTP Tasks:**
```json
{
  "status_code": 200,
  "headers": {"content-type": "application/json"},
  "body": "{\"success\": true}",
  "response_size_bytes": 1234
}
```

**Shell Tasks:**
```json
{
  "stdout": "job completed",
  "stderr": "",
  "exit_code": 0
}
```

**Delay Tasks:**
```json
{
  "message": "Completed delay",
  "duration_ms": 20000
}
```

**Size Limits:**
- Max output size: 16KB
- Outputs beyond limit are truncated
- `truncated=true` flag set when truncation occurs

> **Interview Point:** "Execution output is bounded and truncatable to protect storage and availability."

---

## 2. API Implementation

### 2.1 Job Creation Endpoint

**Route:** `POST /tasks`

**Request:**
```json
{
  "type": "HTTP" | "SHELL" | "DELAY",
  "payload": {
    // Type-specific payload
  },
  "scheduledAt": "2024-01-01T12:00:00Z",  // Optional, defaults to NOW()
  "idempotencyKey": "unique-key"           // Optional
}
```

**Implementation:**
```javascript
const createJob = async (req, res, next) => {
    const { type, payload, scheduledAt, idempotencyKey } = req.body;
    
    // Validate
    validateJob(type, payload);
    
    // Generate ID
    const id = generateId();
    const key = idempotencyKey || `${type}-${id}`;
    
    // Persist
    const task = await tasksRepo.createTask({
        id,
        type,
        payload,
        scheduledAt: scheduledAt || new Date(),
        idempotencyKey: key
    });
    
    res.status(201).json({ status: 'success', data: { task } });
};
```

**Idempotency Handling:**
```javascript
try {
    await db.query('INSERT INTO tasks (...) VALUES (...)');
} catch (err) {
    if (err.code === '23505') { // Unique violation
        const existing = await db.query(
            'SELECT * FROM tasks WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        return existing.rows[0]; // Return existing task
    }
    throw err;
}
```

---

## 3. Watcher/Dispatcher Implementation

### 3.1 Dispatch Loop

**File:** `Server/scheduler/task-dispatcher/dispatcher.js`

```javascript
class Dispatcher {
    start() {
        this.dispatchInterval = setInterval(
            () => this._dispatchLoop(),
            1000  // Every 1 second
        );
        this.retryInterval = setInterval(
            () => this._retryLoop(),
            5000  // Every 5 seconds
        );
    }
    
    async _dispatchLoop() {
        // Only leader dispatches
        if (!leaderElection.isLeader) return;
        
        // Get pending tasks
        const tasks = await tasksRepo.getPendingTasks(100);
        if (tasks.length === 0) return;
        
        const leaderEpoch = await leaderElection.getLeaderEpoch();
        const dispatchedIds = [];
        
        // Push to Redis
        for (const task of tasks) {
            await redisQueue.pushTask(task.id, { attempt: task.attempt });
            dispatchedIds.push(task.id);
        }
        
        // Mark as dispatched
        await tasksRepo.markDispatched(dispatchedIds, leaderEpoch);
    }
}
```

**Query:**
```sql
SELECT id, attempt
FROM tasks
WHERE status = 'PENDING'
AND scheduled_at <= NOW()
LIMIT 100;
```

**Batch Update:**
```sql
UPDATE tasks
SET status = 'DISPATCHED',
    leader_epoch = $1,
    updated_at = NOW()
WHERE id = ANY($2::uuid[])
RETURNING id;
```

### 3.2 Retry Loop

```javascript
async _retryLoop() {
    if (!leaderElection.isLeader) return;
    
    // Find tasks ready for retry
    const tasks = await tasksRepo.getRetryableTasks();
    
    for (const task of tasks) {
        if (task.attempt >= task.max_attempts) {
            // Move to DLQ
            await tasksRepo.moveToDLQ(task.id, 'Max retry attempts exceeded');
        } else {
            // Reset to PENDING
            await tasksRepo.resetForRetry(task.id);
        }
    }
}
```

**Query:**
```sql
SELECT id, attempt, max_attempts, type
FROM tasks
WHERE status = 'FAILED'
AND next_retry_at IS NOT NULL
AND next_retry_at <= NOW()
LIMIT 100;
```

---

## 4. Redis Streams Implementation

### 4.1 Queue Operations

**File:** `Server/queue/redis-queue.js`

```javascript
class RedisQueue {
    async initGroup() {
        try {
            await redis.xgroup('CREATE', 'tasks:pending', 'workers', '0', 'MKSTREAM');
        } catch (err) {
            // Group already exists
        }
    }
    
    async pushTask(taskId, metadata) {
        await redis.xadd(
            'tasks:pending',
            '*',  // Auto-generate ID
            'task_id', taskId,
            'attempt', metadata.attempt
        );
    }
    
    async consume(workerId) {
        const messages = await redis.xreadgroup(
            'GROUP', 'workers', workerId,
            'BLOCK', 5000,  // Block for 5s
            'COUNT', 1,
            'STREAMS', 'tasks:pending', '>'
        );
        
        if (!messages || messages.length === 0) return null;
        
        const [stream, entries] = messages[0];
        const [messageId, fields] = entries[0];
        
        return {
            messageId,
            task_id: fields[1],
            attempt: parseInt(fields[3])
        };
    }
    
    async ack(messageId) {
        await redis.xack('tasks:pending', 'workers', messageId);
    }
}
```

---

## 5. Worker/Executor Implementation

### 5.1 Task Processing

**File:** `Server/worker/index.js`

```javascript
const processTask = async (msg) => {
    const { messageId, task_id, attempt } = msg;
    
    // 1. Idempotency check
    const task = await tasksRepo.getTaskById(task_id);
    if (!task || task.status === 'SUCCESS') {
        await redisQueue.ack(messageId);
        return;
    }
    
    // 2. Acquire lease
    const leasedTask = await tasksRepo.acquireLease(task_id, WORKER_ID);
    if (!leasedTask) {
        // Another worker got it
        return;
    }
    
    // 3. Start lease renewer
    const renewInterval = setInterval(async () => {
        await tasksRepo.renewLease(task_id, WORKER_ID);
    }, 10000);  // Renew every 10s
    
    try {
        // 4. Execute
        const result = await executeTask(leasedTask);
        
        // 5. Report success
        await tasksRepo.updateStatus(task_id, 'SUCCESS', result);
        
    } catch (err) {
        // 6. Report failure
        const nextRetryAt = new Date(
            Date.now() + Math.min(1000 * Math.pow(2, task.attempt), 60000)
        );
        await tasksRepo.updateStatus(task_id, 'FAILED', null, nextRetryAt);
        
    } finally {
        clearInterval(renewInterval);
        await redisQueue.ack(messageId);
    }
};
```

### 5.2 Lease Acquisition

**Query:**
```sql
UPDATE tasks
SET assigned_worker_id = $1,
    lease_expiry = NOW() + INTERVAL '30 seconds',
    status = 'RUNNING',
    updated_at = NOW()
WHERE id = $2
AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

**Key Points:**
- Atomic update prevents duplicate execution
- Lease expires after 30s
- Only acquires if no active lease

### 5.3 Lease Renewal

**Query:**
```sql
UPDATE tasks
SET lease_expiry = NOW() + INTERVAL '30 seconds'
WHERE id = $1 AND assigned_worker_id = $2
RETURNING lease_expiry;
```

**Renewal Strategy:**
- Renew every 10s (lease is 30s)
- Provides 20s buffer for network issues
- If renewal fails, worker aborts execution

---

## 6. Task Executors

### 6.1 HTTP Task

**Payload:**
```json
{
  "method": "POST",
  "url": "https://api.example.com/webhook",
  "headers": { "Authorization": "Bearer token" },
  "body": { "data": "value" },
  "timeout_ms": 5000
}
```

**Implementation:**
```javascript
const executeHttpTask = async (payload) => {
    const { method, url, headers, body, timeout_ms } = payload;
    
    const response = await axios({
        method,
        url,
        headers,
        data: body,
        timeout: timeout_ms
    });
    
    return {
        result: 'success',
        statusCode: response.status,
        data: response.data
    };
};
```

### 6.2 Shell Task

**Payload:**
```json
{
  "command": "echo 'Hello World'",
  "timeout_ms": 15000
}
```

**Implementation:**
```javascript
const executeShellTask = async (payload) => {
    const { command, timeout_ms } = payload;
    
    return new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', command]);
        let stdout = '';
        let stderr = '';
        
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('Timeout'));
        }, timeout_ms);
        
        child.stdout.on('data', (data) => stdout += data);
        child.stderr.on('data', (data) => stderr += data);
        
        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve({ result: 'success', stdout, stderr });
            } else {
                reject(new Error(`Exit code ${code}: ${stderr}`));
            }
        });
    });
};
```

### 6.3 Delay Task

**Payload:**
```json
{
  "duration_ms": 5000,
  "fail_probability": 0.1
}
```

**Implementation:**
```javascript
const executeDelayTask = async (payload) => {
    const { duration_ms, fail_probability } = payload;
    
    await new Promise(resolve => setTimeout(resolve, duration_ms));
    
    if (Math.random() < fail_probability) {
        throw new Error('Simulated failure');
    }
    
    return { result: 'success', duration: duration_ms };
};
```

---

## 7. Leader Election

### 7.1 Etcd-based Election

**File:** `Server/scheduler/leader-election/leader-election.js`

```javascript
class LeaderElection extends EventEmitter {
    async start() {
        const lease = this.client.lease(10);  // 10s TTL
        await lease.grant();
        
        const election = this.client.election('scheduler-leader');
        
        try {
            await election.campaign(this.id, lease);
            this.isLeader = true;
            this.emit('elected');
            
            // Keep-alive
            lease.on('lost', () => {
                this.isLeader = false;
                this.emit('lost');
            });
            
        } catch (err) {
            // Lost election
            this.isLeader = false;
        }
    }
}
```

**Key Points:**
- 10s lease TTL
- Auto-renewal via keep-alive
- Events: `elected`, `lost`
- Only one leader at a time

---

## 8. Heartbeat & Worker Monitoring

### 8.1 Heartbeat Sender

**File:** `Server/worker/heartbeat/heartbeat-sender.js`

```javascript
class HeartbeatSender {
    start() {
        this.interval = setInterval(async () => {
            await workersRepo.upsertHeartbeat(this.workerId);
        }, 5000);  // Every 5s
    }
}
```

**Query:**
```sql
INSERT INTO workers (worker_id, last_heartbeat, status)
VALUES ($1, NOW(), 'ALIVE')
ON CONFLICT (worker_id)
DO UPDATE SET last_heartbeat = NOW(), status = 'ALIVE';
```

### 8.2 Worker Monitor

**File:** `Server/scheduler/heartbeat/worker-monitor.js`

```javascript
class WorkerMonitor {
    async _monitorLoop() {
        const deadWorkers = await workersRepo.getDeadWorkers(15);  // 15s timeout
        
        for (const worker of deadWorkers) {
            // Release leases held by dead worker
            await tasksRepo.releaseLeases(worker.worker_id);
        }
    }
}
```

**Query:**
```sql
SELECT worker_id
FROM workers
WHERE last_heartbeat < NOW() - INTERVAL '15 seconds';
```

---

## 9. DLQ Handler

### 9.1 Monitoring

**File:** `Server/scheduler/dead-letter/dlq-handler.js`

```javascript
class DLQHandler {
    async _monitorDLQ() {
        const dlqTasks = await tasksRepo.getDLQTasks();
        
        if (dlqTasks.length > 0) {
            logger.warn(`DLQ contains ${dlqTasks.length} failed tasks`);
            
            for (const task of dlqTasks) {
                logger.warn(
                    `DLQ Task: ${task.id}, Type: ${task.type}, ` +
                    `Reason: ${task.dlq_reason}, Attempts: ${task.attempt}`
                );
            }
        }
        
        if (dlqTasks.length > 100) {
            logger.error('⚠️  DLQ size critical!');
        }
    }
}
```

---

## 10. Configuration

### 10.1 Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_scheduler
DB_USER=user
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Etcd
ETCD_HOSTS=http://localhost:2379

# Scheduler
DISPATCH_INTERVAL=1000      # ms
RETRY_INTERVAL=5000         # ms
LEASE_DURATION=30000        # ms
HEARTBEAT_INTERVAL=5000     # ms
WORKER_TIMEOUT=15000        # ms

# API
API_PORT=3000
```

---

## 11. Error Handling

### 11.1 Retry Strategy

**Exponential Backoff:**
```javascript
const nextRetryAt = new Date(
    Date.now() + Math.min(
        1000 * Math.pow(2, attempt),  // Exponential
        60000                          // Max 60s
    )
);
```

**Retry Schedule:**
- Attempt 1: Immediate
- Attempt 2: +1s
- Attempt 3: +2s
- Attempt 4: +4s
- Attempt 5: +8s
- Attempt 6+: +60s (capped)

### 11.2 DLQ Criteria

Task moves to DLQ when:
- `attempt >= max_attempts` (default: 5)
- Manual move via admin API
- Specific error types (optional)

---

## 12. Performance Optimizations

### 12.1 Batch Operations

- **Dispatch:** Process 100 tasks per loop
- **Retry:** Process 100 tasks per loop
- **Database:** Batch updates with `ANY($1::uuid[])`

### 12.2 Indexing Strategy

```sql
-- Dispatch query
CREATE INDEX idx_tasks_status_scheduled ON tasks(status, scheduled_at);

-- Retry query
CREATE INDEX idx_tasks_retry ON tasks(status, next_retry_at) WHERE status = 'FAILED';

-- Worker lease lookup
CREATE INDEX idx_tasks_worker_running ON tasks(assigned_worker_id) WHERE status = 'RUNNING';
```

### 12.3 Connection Pooling

```javascript
const pool = new Pool({
    max: 20,              // Max connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});
```

---

## 13. Testing Strategy

### 13.1 Unit Tests
- Task executor logic
- Retry calculation
- Lease acquisition

### 13.2 Integration Tests
- End-to-end job flow
- Leader failover
- Worker crash recovery

### 13.3 Chaos Tests
- Kill leader during dispatch
- Kill worker during execution
- Redis outage
- Database outage

---

## 14. Deployment Considerations

### 14.1 Process Model

```
┌─────────────┐
│   API       │  Port 3000
└─────────────┘

┌─────────────┐
│ Scheduler   │  Leader-elected
└─────────────┘

┌─────────────┐
│  Worker     │  Scalable
└─────────────┘
```

### 14.2 Resource Requirements

| Component | CPU | Memory | Disk |
|-----------|-----|--------|------|
| API | 0.5 core | 512MB | Minimal |
| Scheduler | 0.5 core | 512MB | Minimal |
| Worker | 1 core | 1GB | Depends on jobs |
| PostgreSQL | 2 cores | 4GB | 100GB+ |
| Redis | 1 core | 2GB | 10GB |
| Etcd | 1 core | 1GB | 10GB |

---

## 15. Security Considerations

- **API Authentication:** JWT tokens (not implemented in POC)
- **Job Payload Validation:** Schema validation per job type
- **Shell Command Sandboxing:** Whitelist commands in production
- **Rate Limiting:** Per-user limits (future enhancement)
- **Audit Logging:** All job creation/execution logged
