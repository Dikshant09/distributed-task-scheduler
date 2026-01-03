# Design Tradeoffs & Decisions

A comprehensive guide to the architectural decisions made in this distributed task scheduler, with interview-ready explanations.

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

## Summary: Key Talking Points

### The One-Liner
> "I built a distributed task scheduler that demonstrates leader election, lease-based execution, and fault tolerance—with a real-time UI that visualizes failures and recovery."

### Top 5 Design Decisions to Highlight

1. **Database as source of truth** → "Jobs survive queue outages"
2. **Lease-based execution** → "Prevents duplicate processing, enables crash recovery"
3. **Leader election** → "Single dispatcher prevents duplicate dispatch"
4. **At-least-once + idempotency** → "Reliable delivery without distributed transactions"
5. **Real-time visualization** → "See failures and recovery live"

### Questions They Might Ask

| Question | Key Point |
|----------|-----------|
| "What if Redis dies?" | Jobs safe in DB, dispatched on recovery |
| "What if leader dies mid-dispatch?" | New leader resumes, idempotency prevents duplicates |
| "What if worker dies mid-execution?" | Lease expires, task reassigned |
| "How do you prevent duplicate execution?" | Atomic lease acquisition in Postgres |
| "Why not Kafka?" | Redis Streams simpler, sufficient for scale |
| "Why not exactly-once?" | At-least-once + idempotency is simpler, equally effective |

---

*This document is optimized for interview preparation. Study the "Interview Answer" sections for quick recall.*
