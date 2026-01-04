# Design Tradeoffs & Decisions

A comprehensive guide to the architectural decisions made in this distributed task scheduler, with interview-ready explanations.

> **Important**: This project is a **distributed systems visualizer and learning tool**, not a production scheduler. Design decisions optimize for **clarity, demonstration, and low-cost hosting** rather than maximum throughput or enterprise features.

---

## Table of Contents
1. [Technology Choices](#technology-choices)
2. [Architecture Decisions](#architecture-decisions)
3. [Consistency & Reliability](#consistency--reliability)
4. [Real-time Communication](#real-time-communication)
5. [Operational Decisions](#operational-decisions)

---

## Technology Choices

### Why Redis Streams over Kafka?

| Factor | Redis Streams | Kafka |
|--------|--------------|-------|
| **Complexity** | Simple, single binary | Complex, requires ZooKeeper/KRaft |
| **Setup** | `brew install redis` | Multi-node cluster needed |
| **Consumer Groups** | ✅ Native support | ✅ Native support |
| **Persistence** | ✅ AOF/RDB | ✅ Log-based |
| **Throughput** | ~100K msg/sec | ~1M msg/sec |
| **Use Case** | Task queue, caching | Event streaming, log aggregation |

**Our Decision:** Redis Streams

**Why:**
- **Simplicity**: Single service handles both queue and caching needs
- **Demo-friendly**: Easy local setup, no cluster management
- **Sufficient scale**: 100K msg/sec exceeds our requirements
- **Consumer groups**: Built-in load balancing across workers
- **Already using Redis**: No additional infrastructure

**Interview Answer:**
> "We chose Redis Streams because it provides Kafka-like consumer group semantics with significantly lower operational complexity. For a task scheduler doing ~1000 jobs/sec, Redis Streams is more than sufficient, and having a single Redis instance for both queuing and event storage simplifies our architecture."

---

### Why PostgreSQL over Cassandra/DynamoDB?

| Factor | PostgreSQL | Cassandra/DynamoDB |
|--------|-----------|-------------------|
| **Consistency** | Strong (ACID) | Eventual |
| **Transactions** | ✅ Full support | ❌ Limited |
| **Schema** | Fixed, relational | Flexible, wide-column |
| **Query flexibility** | ✅ Full SQL, JOINs | Limited (partition key) |
| **Scaling** | Vertical + Read replicas | Horizontal |
| **Lease locking** | ✅ Atomic UPDATE | Complex (LWT) |

**Our Decision:** PostgreSQL

**Why:**
- **ACID guarantees**: Critical for task state transitions
- **Atomic lease acquisition**: Single UPDATE statement prevents duplicate execution
- **Familiar tooling**: psql, pgAdmin, standard SQL
- **Sufficient scale**: Vertical scaling handles 1M+ tasks easily
- **JSONB support**: Flexible payload storage

**Interview Answer:**
> "PostgreSQL gives us ACID transactions which are essential for preventing duplicate task execution. When a worker acquires a lease, we use an atomic UPDATE...RETURNING to ensure only one worker can claim a task. Cassandra would require lightweight transactions (LWT) which are slower and more complex."

---

### Why Etcd over ZooKeeper/Consul?

| Factor | Etcd | ZooKeeper | Consul |
|--------|------|-----------|--------|
| **Consensus** | Raft | ZAB | Raft |
| **API** | gRPC + HTTP | Custom | HTTP |
| **Leader Election** | ✅ Native API | Manual recipes | ✅ Sessions |
| **Watch/Subscribe** | ✅ Efficient | ✅ Efficient | ✅ Blocking queries |
| **Kubernetes** | ✅ Native | Deprecated | External |

**Our Decision:** Etcd

**Why:**
- **Native election API**: Built-in `election.campaign()` method
- **Modern protocol**: gRPC with efficient watches
- **Kubernetes alignment**: Same consensus system as K8s
- **Simple deployment**: Single binary, no cluster setup for dev

**Interview Answer:**
> "Etcd provides a first-class leader election API which simplifies our implementation. We just call `campaign()` and the library handles lease renewal, leadership transfer, and failure detection. ZooKeeper would require implementing election recipes manually."

---

### Why Node.js over Go/Java?

| Factor | Node.js | Go | Java |
|--------|---------|----|----|
| **I/O Model** | Async, non-blocking | Goroutines | Threads |
| **Speed** | Good for I/O | Excellent | Good |
| **Ecosystem** | npm (massive) | Smaller | Maven (massive) |
| **Learning curve** | Low | Medium | High |
| **Frontend sharing** | ✅ Same language | ❌ | ❌ |

**Our Decision:** Node.js

**Why:**
- **Async I/O**: Natural fit for scheduler polling and queue consumption
- **Rapid development**: Quick iteration for demo/interview project
- **Full-stack JS**: Shared language with React frontend
- **npm ecosystem**: Rich libraries for Redis, PostgreSQL, Etcd

**Interview Answer:**
> "Node.js is ideal for I/O-bound workloads like queue consumption and database polling. The async model means we can handle many concurrent connections without thread management overhead. For CPU-bound task execution, we'd consider Go or worker threads."

---

## Architecture Decisions

### Why 3-Service Split (API / Scheduler / Worker)?

```
API (Control Plane) → Scheduler (Coordination) → Worker (Data Plane)
```

**Why not monolithic?**
- **Independent scaling**: Workers scale with load, API scales with requests
- **Fault isolation**: Worker crash doesn't affect API
- **Single responsibility**: Each service has clear purpose

**Why not 2-service (API + Worker)?**
- **Leader election**: Scheduler needs coordination for single-dispatcher
- **Time-based dispatch**: Separating scheduler allows scheduled execution
- **Retry management**: Scheduler handles retry loop centrally

**Interview Answer:**
> "We separate concerns: API accepts intent and persists to DB, Scheduler bridges time and dispatches to queue, Workers execute. This means a worker crash doesn't affect job creation, and we can scale workers independently of the API."

---

### Why Database as Source of Truth (not Queue)?

**Alternative:** Queue-first with eventual DB sync

**Our Approach:** Database-first, queue as transport

| Scenario | Queue-first | DB-first (ours) |
|----------|------------|-----------------|
| Queue dies | Data loss | ✅ Jobs safe in DB |
| Job replay | Complex | ✅ Re-dispatch from DB |
| Audit trail | Separate system | ✅ Built into DB |
| Consistency | Eventual | ✅ Strong |

**Interview Answer:**
> "The database is our single source of truth. If Redis dies, jobs are already persisted and will be dispatched when Redis recovers. The queue is just a delivery mechanism, not a storage system. This eliminates dual-write problems."

---

### Why Lease-Based Execution?

**Problem:** How to prevent two workers from executing the same task?

**Options:**
1. **Database lock**: `SELECT ... FOR UPDATE` (blocking)
2. **Optimistic lock**: Version column (retries on conflict)
3. **Lease-based**: Time-limited ownership (our choice)

**Why lease?**
```sql
UPDATE tasks
SET status = 'RUNNING',
    assigned_worker_id = $1,
    lease_expiry = NOW() + INTERVAL '30 seconds'
WHERE id = $2
AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

- **Non-blocking**: No waiting for locks
- **Crash recovery**: Lease expires, task becomes available
- **Atomic**: Single statement, no race conditions

**Interview Answer:**
> "Leases give us crash recovery without coordination. If a worker dies mid-execution, the lease expires in 30 seconds and another worker can pick up the task. We renew leases every 10 seconds for long-running tasks."

---

## Consistency & Reliability

### Why At-Least-Once (not Exactly-Once)?

**Exactly-once is a myth** in distributed systems without:
- Distributed transactions (2PC)
- Idempotent consumers
- Single-point bottleneck

**Our Guarantee:** At-least-once with idempotency

| Guarantee | Meaning | Complexity |
|-----------|---------|------------|
| At-most-once | Fire and forget | Simple |
| At-least-once | Retry until ACK | Medium |
| Exactly-once | Idempotent + at-least-once | Complex |

**Why not exactly-once?**
- Requires distributed transactions
- Performance overhead
- Complexity not justified for task scheduler

**Interview Answer:**
> "True exactly-once requires distributed transactions. We achieve effectively-once by combining at-least-once delivery with idempotent task execution. The consumer is responsible for idempotency—if a task runs twice, it should produce the same result."

---

### How Do We Achieve Idempotency?

**Three layers of idempotency:**

**1. Job Creation (API):**
```javascript
// Idempotency key prevents duplicate jobs
INSERT INTO tasks (idempotency_key, ...)
VALUES ($1, ...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

**2. Task Dispatch (Scheduler):**
```javascript
// Leader epoch prevents duplicate dispatch after failover
UPDATE tasks
SET status = 'DISPATCHED', leader_epoch = $1
WHERE id = $2 AND leader_epoch IS NULL;
```

**3. Task Execution (Worker):**
```javascript
// Lease acquisition is atomic
UPDATE tasks SET status = 'RUNNING', assigned_worker_id = $1
WHERE id = $2 AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

**Interview Answer:**
> "We have idempotency at three levels: API uses idempotency keys to prevent duplicate job creation, the scheduler uses leader epochs to prevent double-dispatch, and workers use atomic lease acquisition to prevent concurrent execution."

---

### Why Exponential Backoff for Retries?

**Alternative:** Fixed delay (e.g., retry every 5 seconds)

**Problem with fixed delay:**
- Downstream service is overloaded
- Retrying every 5s worsens the problem
- "Thundering herd" effect

**Exponential backoff:**
```javascript
const delay = Math.min(
  1000 * Math.pow(2, attempt),  // 1s, 2s, 4s, 8s, 16s...
  60000                          // Cap at 60s
);
```

**With jitter (even better):**
```javascript
const delay = Math.min(
  1000 * Math.pow(2, attempt) * (0.5 + Math.random()),
  60000
);
```

**Interview Answer:**
> "Exponential backoff prevents overwhelming failing services. If an API is returning 503s, we wait 1s, then 2s, then 4s. This gives the service time to recover. We also cap retries and move to DLQ after 5 attempts."

---

### Why Dead Letter Queue (DLQ)?

**Problem:** What happens to permanently failing tasks?

**Without DLQ:**
- Infinite retries block queue
- Manual intervention required
- No visibility into failures

**With DLQ:**
- Failed tasks isolated after max attempts
- Queue stays healthy
- Failures visible for debugging
- Manual retry possible

**Interview Answer:**
> "DLQ isolates bad tasks so they don't block the main queue. After 5 failed attempts, a task moves to DLQ where it can be inspected, fixed, and manually retried. This keeps the system healthy while preserving failed work."

---

## Real-time Communication

### Why WebSockets over Polling?

| Factor | Polling | WebSocket |
|--------|---------|-----------|
| **Latency** | Poll interval (e.g., 2s) | ~100ms |
| **Server load** | High (repeated requests) | Low (persistent connection) |
| **Complexity** | Simple | Medium |
| **Scalability** | Good (stateless) | Requires sticky sessions |

**Our Decision:** WebSocket for real-time, polling as fallback

**Why WebSocket:**
- **Instant updates**: Leader election visible immediately
- **Demo impact**: Interviewers see changes in real-time
- **Reduced server load**: One connection vs repeated HTTP calls

**Interview Answer:**
> "WebSockets give us sub-100ms updates for system state changes. When you kill a leader, the UI shows the new leader immediately. With polling, there'd be a 2-5 second delay which hurts the demo experience."

---

### Why Socket.IO over Raw WebSocket?

| Factor | Raw WebSocket | Socket.IO |
|--------|--------------|-----------|
| **Reconnection** | Manual | ✅ Automatic |
| **Fallback** | None | ✅ Long-polling |
| **Rooms/namespaces** | Manual | ✅ Built-in |
| **Binary support** | Yes | Yes |

**Our Decision:** Socket.IO

**Why:**
- **Auto-reconnect**: Handles network blips gracefully
- **Fallback**: Works even if WebSocket blocked
- **Room broadcasting**: Easy to emit to all clients

**Interview Answer:**
> "Socket.IO handles reconnection automatically and falls back to long-polling if WebSocket is blocked. For a demo that might run on various networks, this resilience is valuable."

---

## Operational Decisions

### Why 5 Workers Maximum?

**Technical reasons:**
- UI topology visualization becomes cluttered
- Demo scope is bounded
- Local development resource limits

**Practical reasons:**
- 5 workers demonstrate horizontal scaling
- More workers don't add interview value
- Prevents accidental resource exhaustion

**Interview Answer:**
> "We cap at 5 workers for demo purposes. The architecture supports unlimited workers—they're just Redis consumer group members. The cap keeps the UI clean and prevents accidental resource exhaustion during demos."

---

### Why Leader Election TTL of 10 Seconds?

**Tradeoff:** Shorter TTL = faster failover, more network traffic

| TTL | Failover Time | Keep-alive Frequency |
|-----|---------------|---------------------|
| 3s | ~3s | Every 1s |
| 10s | ~10s | Every 3s |
| 30s | ~30s | Every 10s |

**Our Decision:** 10-second TTL

**Why:**
- **Fast enough**: 10-15s failover is acceptable
- **Low overhead**: Keep-alive every ~3s
- **Network tolerance**: Survives brief network blips

**Interview Answer:**
> "10 seconds balances fast failover against network overhead. In production, 30 seconds might be acceptable. For a demo, we want failover visible quickly but not so aggressive that network jitter causes false failures."

---

### Why Volatile Events (Redis, not Database)?

**Alternative:** Store events in PostgreSQL for persistence

**Our Decision:** Redis list (volatile)

**Why:**
- Events are operational, not business data
- Demo resets between sessions
- Lower write load on database
- Faster event retrieval

**When to use DB events:**
- Compliance/audit requirements
- Long-term analytics
- Production systems

**Interview Answer:**
> "Events are ephemeral operational data, not business records. Storing in Redis keeps our DB lean and event retrieval fast. For production with audit requirements, we'd add a separate events table or use a dedicated logging system."

---

## Comprehensive Interview Q&A

### Fundamentals

#### Q: Why do you need a queue at all? Can't you just poll the database?

**Short Answer:** Decoupling, load leveling, and reliability.

**Detailed Answer:**
> "Without a queue, workers would poll the database constantly, creating contention. The queue decouples dispatch from execution:
> - **Decoupling**: Scheduler and workers don't need to be online simultaneously
> - **Load leveling**: Bursts of tasks don't overwhelm workers
> - **Consumer groups**: Redis Streams automatically load-balance across workers
> - **Retry semantics**: Built-in ACK/NACK for reliable delivery
> 
> The database could work for low throughput, but queues are the industry standard for task distribution."

---

#### Q: SQL or NoSQL? Why PostgreSQL?

**Short Answer:** ACID transactions for lease acquisition and strong consistency.

**Why SQL (PostgreSQL):**
| Requirement | PostgreSQL | NoSQL (MongoDB/DynamoDB) |
|-------------|-----------|-------------------------|
| Atomic lease acquisition | ✅ Single UPDATE | ❌ Requires optimistic locking |
| Consistent reads | ✅ Guaranteed | ⚠️ Eventually consistent |
| Complex queries | ✅ Full SQL | ❌ Limited |
| Transactions | ✅ ACID | ⚠️ Limited |
| JSONB flexibility | ✅ Yes | ✅ Native |

**Interview Answer:**
> "PostgreSQL gives us ACID transactions which are critical for lease-based execution. When a worker acquires a task, we use `UPDATE...RETURNING` atomically—this guarantees only one worker gets the lease. With DynamoDB, we'd need conditional writes with version checks, which is more complex and has higher latency."

---

#### Q: Do you need an API Gateway or Load Balancer?

**For This Demo:** No—single API instance is sufficient.

**For Production:**

| Component | Purpose | When Needed |
|-----------|---------|-------------|
| **Load Balancer** | Distribute traffic across API instances | Multiple API pods |
| **API Gateway** | Rate limiting, auth, routing | Multi-service architecture |
| **Reverse Proxy** | SSL termination, static files | Production deployment |

**Interview Answer:**
> "For the demo, a single API instance handles everything. In production, I'd add an ALB/NLB for horizontal scaling and health checks. An API gateway would add rate limiting and authentication. For this visualizer, that complexity isn't needed."

---

### Failure Scenarios

#### Q: What happens when a worker fails mid-execution?

**Scenario:** Worker crashes while processing a task.

**Recovery Flow:**
```
1. Worker acquires lease (30-second expiry)
2. Worker starts executing task
3. Worker crashes (no heartbeat, no lease renewal)
4. 30 seconds pass → lease expires
5. Scheduler's worker monitor detects dead worker
6. Task status reset to PENDING (lease_expiry < NOW())
7. Another worker picks up task from queue
8. Task completes successfully
```

**Interview Answer:**
> "The lease expires in 30 seconds. When the worker monitor detects a dead worker (no heartbeat for 15s), it releases all leases held by that worker. The tasks return to PENDING and are re-dispatched. The key insight is that lease expiry is the safety net—we don't need complex distributed coordination."

---

#### Q: What happens when the leader fails mid-dispatch?

**Scenario:** Leader scheduler crashes while dispatching tasks.

**Recovery Flow:**
```
1. Leader is dispatching tasks to Redis
2. Leader crashes
3. Etcd lease expires (10 seconds)
4. Standby schedulers detect leadership vacancy
5. New leader elected within ~15 seconds
6. New leader resumes dispatch loop
7. Idempotency key prevents duplicate jobs
```

**What about in-flight dispatches?**
- Tasks already in Redis → Workers process normally
- Tasks marked DISPATCHED but not in Redis → Stay DISPATCHED (orphaned)
- Solution: Periodic cleanup resets old DISPATCHED tasks to PENDING

**Interview Answer:**
> "Etcd's lease expires in 10 seconds, triggering re-election. A standby becomes leader and resumes dispatching. Tasks already in the queue complete normally. For tasks that were being dispatched mid-crash, we have a cleanup job that resets stale DISPATCHED tasks back to PENDING."

---

#### Q: How do you handle network partitions?

**Scenario:** Network splits between scheduler and database/Redis.

**Split-Brain Prevention:**
```
Scheduler ←✗→ Etcd
    ↓
Scheduler loses Etcd connection
    ↓
Lease cannot be renewed
    ↓
Lease expires (10s)
    ↓
Scheduler stops dispatching (no longer leader)
    ↓
Another scheduler on the healthy partition becomes leader
```

**Why This Works:**
- Leader MUST maintain Etcd connection to keep lease
- If leader is partitioned from Etcd, it automatically demotes itself
- New leader on healthy side takes over

**Interview Answer:**
> "We use Etcd leases as a heartbeat. If a scheduler can't reach Etcd, it loses its lease and stops dispatching. This prevents split-brain where two leaders dispatch simultaneously. The CAP theorem trade-off here is: we choose consistency over availability."

---

#### Q: What if Redis goes down?

**Scenario:** Redis becomes unavailable.

**Impact:**
- Scheduler cannot push to queue → Dispatch fails
- Workers cannot consume → Execution stalls
- BUT: Tasks remain safe in PostgreSQL

**Recovery:**
```
1. Redis dies
2. Scheduler dispatch loop fails (catches error)
3. Tasks stay PENDING in database
4. Redis recovers
5. Scheduler resumes dispatching
6. Tasks flow through normally
```

**Interview Answer:**
> "This is why the database is the source of truth. If Redis dies, we can't dispatch, but no data is lost. Tasks remain PENDING in PostgreSQL. When Redis recovers, the scheduler resumes dispatching. The queue is just a delivery mechanism, not a storage system."

---

#### Q: What if the database goes down?

**Scenario:** PostgreSQL becomes unavailable.

**Impact:**
- API cannot create tasks → 503 errors
- Scheduler cannot query pending tasks → Dispatch stops
- Workers cannot acquire leases → Execution stops
- System effectively halts

**Recovery:**
```
1. PostgreSQL dies
2. All services detect connection failure
3. System halts gracefully
4. PostgreSQL recovers
5. Connections re-established
6. System resumes from where it left off
```

**Interview Answer:**
> "Database failure halts the system—this is intentional. We prioritize data integrity over availability (CP in CAP). No tasks are lost; they just wait. When the DB recovers, everything resumes. For higher availability, we'd add read replicas and a primary failover."

---

### Lease Mechanics

#### Q: How exactly does the lease work?

**Lease Acquisition (Atomic):**
```sql
UPDATE tasks
SET status = 'RUNNING',
    assigned_worker_id = 'worker-123',
    lease_expiry = NOW() + INTERVAL '30 seconds'
WHERE id = 'task-abc'
AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

**Why This Works:**
- Single atomic statement (no race conditions)
- `WHERE lease_expiry < NOW()` prevents stealing active leases
- RETURNING confirms acquisition (empty = lease stolen)

**Lease Renewal (Long-running tasks):**
```sql
UPDATE tasks
SET lease_expiry = NOW() + INTERVAL '30 seconds'
WHERE id = 'task-abc'
AND assigned_worker_id = 'worker-123';
```

**Lease Expiry (Worker death):**
- If worker dies, no renewal happens
- After 30 seconds, `lease_expiry < NOW()` becomes true
- Any worker can now acquire the task

**Interview Answer:**
> "The lease is a database column with an expiry timestamp. Workers acquire it atomically—only one can succeed. Long tasks renew every 10 seconds (30s lease, 10s renewal = 20s buffer). If the worker dies, the lease expires naturally and another worker takes over."

---

#### Q: Why 30-second lease? Why not shorter/longer?

| Lease Duration | Pros | Cons |
|---------------|------|------|
| **5 seconds** | Fast recovery | High renewal overhead |
| **30 seconds** | Balanced | Our choice |
| **5 minutes** | Low overhead | Slow recovery |

**Our Choice:** 30 seconds with 10-second renewal

**Why:**
- **20-second buffer** for network issues
- **Reasonable recovery time** for demos
- **Low overhead** (renewal every 10s, not every 1s)

**Interview Answer:**
> "30 seconds balances quick recovery against renewal overhead. If a worker dies, another picks up within 30 seconds—acceptable for most use cases. For time-critical systems, you'd shorten it, but that increases database load."

---

### Architecture Deep Dives

#### Q: Why separate API, Scheduler, and Worker?

**3-Service Split Benefits:**

| Service | Responsibility | Scaling | Failure Mode |
|---------|---------------|---------|--------------|
| **API** | Accept user intent | Stateless, horizontal | Lose writes |
| **Scheduler** | Time-based dispatch | Leader-elected (1 active) | Lose dispatch temporarily |
| **Worker** | Execute tasks | Horizontal, auto-distributing | Lose execution capacity |

**Why Not Monolithic?**
- Worker crash shouldn't affect API
- Scheduler crash shouldn't prevent task creation
- Each scales independently

**Interview Answer:**
> "Each service has a single responsibility. API doesn't care about execution—it just persists intent. Scheduler bridges time to execution. Workers just execute. If workers crash, API still accepts jobs. If scheduler crashes, workers still finish current tasks. Blast radius is contained."

---

#### Q: How do you handle poison messages (tasks that always fail)?

**Problem:** A task that always throws an exception would retry forever.

**Solution: Dead Letter Queue (DLQ)**

```javascript
if (task.attempt >= task.max_attempts) {
    await tasksRepo.moveToDLQ(task.id, 'Max retry attempts exceeded');
} else {
    await tasksRepo.resetForRetry(task.id);
}
```

**DLQ Flow:**
```
Task fails → Retry 1 → Fails → Retry 2 → ... → Retry 5 → DLQ
```

**What's in DLQ:**
- Task ID
- Original payload
- Error message
- Attempt count
- DLQ reason

**Interview Answer:**
> "After 5 failed attempts, tasks move to DLQ. This isolates poison messages so they don't block the queue. Operators can inspect DLQ tasks, fix the issue, and manually retry. The system stays healthy while bad tasks are quarantined."

---

#### Q: How would you add priority queues?

**Current State:** Single queue (FIFO)

**Adding Priorities:**

**Option 1: Multiple Redis Streams**
```
tasks:high   → Priority workers (dedicated)
tasks:normal → Regular workers
tasks:low    → Background workers
```

**Option 2: Priority field + sorting**
```sql
SELECT * FROM tasks
WHERE status = 'PENDING'
ORDER BY priority DESC, scheduled_at ASC
LIMIT 100;
```

**Interview Answer:**
> "For priorities, I'd use separate Redis Streams (high/normal/low) with dedicated worker pools. Workers on the high-priority stream only consume from that stream. This provides true priority without complex sorting logic."

---

#### Q: How would you implement rate limiting?

**Problem:** Prevent users from overwhelming the system.

**Approaches:**

**1. API-level (Express middleware):**
```javascript
const rateLimit = require('express-rate-limit');
app.use('/tasks', rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 100              // 100 requests/minute
}));
```

**2. Token bucket (Redis-based):**
```javascript
const key = `rate:${userId}`;
const current = await redis.incr(key);
if (current === 1) await redis.expire(key, 60);
if (current > 100) throw new Error('Rate limited');
```

**3. Per-task-type limits:**
- HTTP tasks: 50/minute
- Shell tasks: 10/minute (more expensive)

**Interview Answer:**
> "At the API layer, I'd use express-rate-limit for simple request throttling. For more sophisticated limits, a Redis-based token bucket allows per-user or per-task-type rate limiting. The demo doesn't need this, but production would."

---

### Distributed Systems Theory

#### Q: What CAP theorem trade-offs did you make?

**CAP Theorem:** Consistency, Availability, Partition tolerance—pick 2.

**Our Choice: CP (Consistency + Partition tolerance)**

| Component | Trade-off |
|-----------|-----------|
| **Leader Election** | CP → Only one leader, even if network partitions |
| **Lease Acquisition** | CP → Only one worker gets lease |
| **Task State** | CP → Strong consistency over availability |

**Why Not AP?**
- Duplicate execution is worse than temporary unavailability
- Task state must be consistent
- Leader must be unique

**Interview Answer:**
> "We choose consistency over availability. If there's a network partition, we'd rather have the system unavailable than risk two leaders dispatching duplicates. For a task scheduler, correctness trumps uptime."

---

#### Q: Is this exactly-once or at-least-once?

**Answer: At-least-once with idempotency**

| Guarantee | Meaning | Our Implementation |
|-----------|---------|-------------------|
| At-most-once | Fire and forget | ❌ Not acceptable |
| At-least-once | Retry until ACK | ✅ Our base guarantee |
| Exactly-once | Once and only once | ✅ Via idempotency |

**How We Achieve "Effectively Exactly-Once":**
1. Idempotency key prevents duplicate job creation
2. Lease prevents duplicate execution
3. ACK after execution prevents re-delivery

**Interview Answer:**
> "Technically at-least-once, but effectively exactly-once through idempotency. The consumer is responsible for making tasks idempotent—if a task runs twice, it should produce the same result. True exactly-once requires distributed transactions, which we avoid for simplicity."

---

#### Q: How would this scale to millions of tasks?

**Bottlenecks and Solutions:**

| Bottleneck | Solution |
|------------|----------|
| Database writes | Partitioning by tenant/date |
| Database reads | Read replicas |
| Redis throughput | Redis Cluster |
| Worker capacity | Add more workers |
| Leader dispatch rate | Batch dispatch, multiple queues |

**Scaling Numbers:**
- PostgreSQL: ~10K writes/sec (single instance)
- Redis: ~100K ops/sec (single instance)
- Workers: Linear scaling

**Interview Answer:**
> "Current architecture handles ~1000 tasks/sec on single instances. For millions, I'd partition the database by tenant or date, add read replicas, move to Redis Cluster, and potentially shard queues by task type. The worker pool scales linearly."

---

## Single Point of Failure (SPOF) Analysis

> **Key Interview Insight**: "Redis and Postgres are single instances in the demo, but not single points of failure in the architecture. Redis is disposable, and Postgres can be made HA without changing any application logic."

### Are Redis and PostgreSQL SPOFs?

**Short, Confident Answer:**

> "Yes, in this demo Redis and Postgres are single points of failure by design. In production, both are deployed as replicated, highly available systems. For this project, I intentionally kept them single-instance to reduce cost and complexity, while keeping the architecture compatible with HA setups."

That framing is important: **intentional trade-off, not ignorance.**

---

### PostgreSQL – Source of Truth

| Question | Answer |
|----------|--------|
| Is it a SPOF? | Logically yes, physically no (in production) |
| Production solution | Primary + Read Replicas with automatic failover |
| Examples | AWS RDS Multi-AZ, Azure Flexible Server HA, GCP Cloud SQL HA, Patroni + etcd |

**Why the design already supports HA:**
- Writes are limited and controlled (only scheduler leader writes)
- Leader election already exists (etcd)
- Read-heavy paths (dashboard, workers) can hit replicas
- No cross-DB transactions

**Key Point:**
> "The system assumes logical single-writer semantics, not physical single-node DB."

---

### Redis – Task Queue

| Question | Answer |
|----------|--------|
| Is it a SPOF? | Only if you deploy it incorrectly |
| Production solutions | Redis Sentinel, Redis Cluster, Managed Redis (ElastiCache / Azure Cache) |

**Why failure is survivable in this design:**

> **Redis is NOT the source of truth**

If Redis goes down:
1. Tasks still exist in Postgres
2. Dispatcher can re-push READY tasks
3. Workers re-consume
4. At-least-once semantics handle duplicates

**So Redis failure = temporary delay, not data loss.**

This is a very strong design decision.

---

### Failure Scenarios Summary

| Component | What Happens | Data Loss? | Recovery |
|-----------|--------------|------------|----------|
| **Redis crashes** | Dispatcher pauses, no tasks dispatched | ❌ No | Self-heals when Redis returns |
| **PostgreSQL crashes** | Entire system pauses (correct behavior) | ❌ No | Resumes cleanly when DB returns |
| **Etcd crashes** | Leader election fails, current leader continues | ❌ No | New elections when Etcd returns |

**Design Philosophy:**
> "Fail-fast and pause is better than corrupting state."

---

### Why This Is Acceptable for Public Demo

> "For the public demo, we accept single-instance Redis and DB because:
> - Sessions are ephemeral
> - No persistence guarantee is required
> - Failure is actually educational — users can see recovery in action"

That's a **feature**, not a bug.

---

### Extra Credit: Show You Thought Ahead

> "If I wanted to eliminate Redis entirely, I could run workers directly off the DB using `SELECT … FOR UPDATE SKIP LOCKED`, but I kept Redis to better visualize queueing and backpressure."

That answer signals:
- You know DB-only schedulers
- You chose Redis intentionally

---

### What NOT to Say

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| "Redis/Postgres won't fail" | "Intentional trade-off" |
| "We assume infra handles it" | "Production-compatible design" |
| "This is just a demo so it doesn't matter" | "Failure-safe by construction" |

---

## Summary: Key Talking Points


### The One-Liner
> "I built a distributed task scheduler visualizer that demonstrates leader election, lease-based execution, and fault tolerance—with a real-time UI that shows failures and recovery live."

### Top 5 Design Decisions to Highlight

1. **Database as source of truth** → "Jobs survive queue outages"
2. **Lease-based execution** → "Prevents duplicate processing, enables crash recovery"
3. **Leader election** → "Single dispatcher prevents duplicate dispatch"
4. **At-least-once + idempotency** → "Reliable delivery without distributed transactions"
5. **Real-time visualization** → "See failures and recovery live"

### Quick Reference Table

| Question | One-Line Answer |
|----------|-----------------|
| Why queue? | Decoupling, load leveling, consumer groups |
| Why SQL? | ACID for atomic lease acquisition |
| Why not Kafka? | Redis Streams simpler, sufficient scale |
| Worker failure? | Lease expires, task reassigned |
| Leader failure? | Etcd re-election in ~15s |
| Network partition? | Scheduler loses lease, stops dispatching |
| Redis failure? | Tasks safe in DB, dispatched on recovery |
| DB failure? | System halts, resumes on recovery |
| How leases work? | Atomic UPDATE with expiry timestamp |
| Exactly-once? | At-least-once + idempotency |
| CAP trade-off? | CP—consistency over availability |

---

*This document is optimized for interview preparation. Study the "Interview Answer" sections for quick recall.*
