# Distributed Task Scheduler - Interview Preparation

## Resume Bullet Points

```
Distributed Task Scheduler | Node.js, Redis, PostgreSQL, Etcd, Docker, React

• Designed and implemented a distributed task scheduling system with leader election, 
  fault tolerance, and automatic failover using Etcd (TTL-based leases, ~10s recovery).

• Built a lease-based task execution model ensuring at-least-once processing with 
  idempotency checks, inspired by production-grade schedulers.

• Implemented Redis Streams with Consumer Groups for scalable task dispatching and 
  parallel worker execution.

• Used PostgreSQL as the source of truth, decoupling persistence from task delivery 
  for reliability and recovery.

• Developed automatic failure recovery via worker heartbeats (5s interval) and 
  stalled-task reclamation with exponential backoff retry.

• Created a real-time visualization UI using React + WebSockets, displaying leader 
  changes, task flow animations, and system events.

• Containerized all services using Docker Compose and deployed on cloud VM (AWS/Azure) 
  with HTTPS via Let's Encrypt and custom domain configuration.

• Added chaos engineering controls to simulate leader crashes, worker failures, 
  and queue outages for resilience testing.
```

---

## Interview Q&A

### 1. Leader Election with Etcd

**Resume Point:**
> Designed and implemented a distributed task scheduling system with leader election, fault tolerance, and automatic failover using Etcd (TTL-based leases).

---

**Q: Explain how Etcd-based leader election works in your system.**

Each scheduler instance tries to acquire a **lease** (lock) on a specific key in Etcd. Only one can succeed—that becomes the leader. The lease has a **TTL (Time-To-Live)** of 10 seconds. The leader must continuously **renew the lease** (heartbeat). If it crashes or loses network connectivity, the lease expires, and another scheduler immediately attempts to acquire it—becoming the new leader within ~10 seconds.

**Implementation Details:**
- Election uses Etcd's `campaign()` method with event emitters
- `elected` event triggers scheduling loop start
- `lost` event triggers graceful demotion and re-campaign

---

**Q: Why Etcd over Redis or ZooKeeper for leader election?**

Etcd uses the **Raft consensus algorithm** providing strong consistency guarantees. Redis requires external implementations like Redlock which isn't true consensus. ZooKeeper works but is more complex. Etcd's lease-based primitives are purpose-built for leader election—simple API, battle-tested (used by Kubernetes), and lightweight.

---

**Q: How do you handle split-brain scenarios?**

Split-brain is prevented by Etcd's **consensus mechanism**. Only one node can hold the lease at any time. If a leader gets network-partitioned from Etcd, its lease expires (no renewal), and a new leader is elected. The old leader loses its lease and stops acting as leader. Additionally, task assignments in PostgreSQL are scoped to the active leader.

---

**Q: What's the tradeoff with TTL duration?**

| TTL | Pros | Cons |
|-----|------|------|
| Short (5s) | Faster failover | More heartbeat traffic; false positives on network hiccups |
| Long (30s) | Less traffic | Slower failover during real failures |
| **My choice (10s)** | Balanced recovery | Good tradeoff between speed and stability |

---

### 2. Lease-Based Task Execution & Idempotency

**Resume Point:**
> Built a lease-based task execution model ensuring at-least-once processing with idempotency, inspired by production-grade schedulers.

---

**Q: Explain lease-based task execution.**

When a worker picks up a task, it acquires a **lease** on that task (a 30-second time-limited lock). The worker must:
1. Complete execution before the lease expires, OR
2. **Renew the lease** every 10 seconds for long-running tasks

If the worker crashes, the lease expires, and the **Recovery Service** reclaims the task—marking it as FAILED and scheduling retry. This prevents tasks from being stuck forever.

**Implementation Details:**
```sql
-- Acquire Lease (atomic operation)
UPDATE tasks
SET assigned_worker_id = $1,
    lease_expiry = NOW() + INTERVAL '30 seconds',
    status = 'RUNNING'
WHERE id = $2
AND (lease_expiry IS NULL OR lease_expiry < NOW())
RETURNING *;
```

---

**Q: What's the difference between at-least-once and exactly-once?**

| Guarantee | Description |
|-----------|-------------|
| **At-least-once** | Task runs at least one time; may run twice if worker crashes after execution but before acknowledgment |
| **Exactly-once** | Task runs exactly one time (very hard to guarantee in distributed systems) |

My system uses **at-least-once with idempotency**—if a task runs twice, the second run detects it's already processed (via status check in DB) and skips execution.

---

**Q: How do you implement idempotency?**

Before processing each task:
1. Check PostgreSQL if `task.status === 'SUCCESS'`
2. If yes, ACK the Redis message and skip processing
3. If no, acquire lease and process task

This makes retries safe—duplicate messages don't cause duplicate executions.

```javascript
// Worker idempotency check
if (task.status === 'SUCCESS') {
    logger.info(`Task ${task_id} already SUCCESS. Acking.`);
    await redisQueue.ack(messageId);
    return;
}
```

---

**Q: What production schedulers inspired you?**

| Scheduler | Concept Borrowed |
|-----------|------------------|
| **Temporal/Cadence** | Lease-based workflow execution |
| **Celery** | Task queuing with acknowledgments |
| **SQS + Lambda** | Visibility timeout (similar to leases) |
| **Kubernetes Jobs** | Controller pattern with reconciliation loops |

---

### 3. Redis Streams with Consumer Groups

**Resume Point:**
> Implemented Redis Streams with Consumer Groups for scalable task dispatching and parallel worker execution.

---

**Q: Why Redis Streams over Pub/Sub or Lists?**

| Feature | Pub/Sub | Lists | Streams |
|---------|---------|-------|---------|
| Persistence | ❌ Fire-and-forget | ✅ | ✅ |
| Consumer Groups | ❌ | ❌ | ✅ |
| Message Acknowledgment | ❌ | ❌ | ✅ (XACK) |
| Replay/Recovery | ❌ | ❌ | ✅ (PEL) |

Streams provide all features needed for reliable task delivery with parallel consumption.

---

**Q: Explain Consumer Groups.**

A **Consumer Group** allows multiple consumers (workers) to share the workload:
- Each message is delivered to **only one consumer** in the group
- Consumers use `XREADGROUP` to read messages
- After processing, they call `XACK` to acknowledge
- Unacknowledged messages stay in the **Pending Entries List (PEL)** for recovery

```javascript
// Consume from stream
await redis.xreadgroup('GROUP', 'workers-group', consumerId, 
    'COUNT', 1, 'BLOCK', 2000, 'STREAMS', 'task-stream', '>');

// Acknowledge after processing
await redis.xack('task-stream', 'workers-group', messageId);
```

---

**Q: What happens to unacknowledged messages?**

They remain in the **PEL** (Pending Entries List). Another consumer can **claim** them using `XCLAIM` after a timeout. In my system, the Recovery Service monitors stale tasks and handles reprocessing via the database layer.

---

**Q: How do you scale workers horizontally?**

Just add more worker containers—they join the same Consumer Group automatically. Redis distributes messages across them.

```bash
docker compose up --scale worker=10
```

---

### 4. PostgreSQL as Source of Truth

**Resume Point:**
> Used PostgreSQL as the source of truth, decoupling persistence from task delivery for reliability and recovery.

---

**Q: Why not use Redis as the source of truth?**

Redis is **in-memory first**, optimized for speed, not durability:
- Data can be lost on crash (unless AOF/RDB persistence enabled, which hurts performance)
- Not ideal for complex queries (scheduling logic, priorities, deadlines)
- No ACID transactions for state consistency

PostgreSQL provides **durability, transactions, and queryability**—critical for task history and recovery.

---

**Q: Explain the decoupling pattern.**

```
PostgreSQL (Cold Path)         Redis (Hot Path)
─────────────────────          ────────────────────
• Task definition              • Real-time queue
• Task status/history          • Consumer Groups
• Audit logs                   • Fast pub/sub events
• Recovery queries             • Ephemeral state
```

Dispatcher reads pending tasks from Postgres, pushes to Redis. Workers read from Redis, update Postgres on completion. If Redis dies, we can rebuild the queue from Postgres.

---

**Q: What if Postgres and Redis get out of sync?**

The system uses **Postgres as truth**. If Redis loses a message:
1. Task remains in a stale state in Postgres
2. Recovery Service detects no progress (lease expired)
3. Marks task as FAILED, schedules retry
4. Dispatcher picks it up again

Eventual consistency is acceptable; tasks eventually complete.

---

### 5. Automatic Failure Recovery

**Resume Point:**
> Developed automatic failure recovery via worker heartbeats and stalled-task reclamation.

---

**Q: How do worker heartbeats work?**

Each worker sends a **heartbeat** every 5 seconds (timestamp update to PostgreSQL). The **Worker Monitor Service** checks:
1. When was the last heartbeat?
2. If > threshold, mark worker as **unhealthy**
3. Trigger task reclamation for that worker

---

**Q: What happens when a worker is marked unhealthy?**

1. Worker status updated to "unhealthy" in PostgreSQL
2. All tasks assigned to that worker are found
3. Tasks with expired leases are reset to "FAILED" with retry scheduled
4. Retry loop picks them up and resets to "PENDING"
5. Dispatcher pushes them to Redis again
6. A healthy worker gets the task

---

**Q: How do you handle partial failures (worker alive but slow)?**

This is where **leases** help. Even if the worker is alive but stuck:
- The 30-second lease expires
- Lease Reaper marks task as FAILED
- Retry is scheduled
- Another worker can take it

The original worker, if still running, will fail when it tries to complete (lease mismatch).

---

**Q: What's exponential backoff retry?**

If a task fails, we don't retry immediately. The delay doubles each time:

| Attempt | Delay |
|---------|-------|
| 0 | 1 second |
| 1 | 2 seconds |
| 2 | 4 seconds |
| 3 | 8 seconds |
| ... | Max 60 seconds |

```javascript
const nextRetryAt = new Date(Date.now() + 
    Math.min(1000 * Math.pow(2, task.attempt || 0), 60000));
```

This prevents overwhelming a failing downstream service.

---

### 6. Real-Time Visualization

**Resume Point:**
> Created a real-time visualization UI using React + WebSockets, displaying leader changes, task flow, and system events.

---

**Q: How does the real-time update work?**

```
Backend (Events)     →    Socket.IO    →    React State    →    UI Update
• task_created            WebSocket          useState           Animation
• leader_elected          emit()             useEffect          Rerender
• worker_joined                              Context
```

Backend emits events via Socket.IO. React subscribes using `useEffect` hooks and updates state, triggering re-renders with animations.

---

**Q: Why WebSockets over polling or SSE?**

| Method | Pros | Cons |
|--------|------|------|
| **Polling** | Simple | Wasteful; constant requests even when nothing changes |
| **SSE** | Simple, auto-reconnect | One-way only (server → client) |
| **WebSockets** | **Bidirectional**, low latency | More complex setup |

Socket.IO adds reconnection logic, fallback to polling, and room-based broadcasting on top of WebSockets.

---

**Q: What events does your system publish?**

| Event | Trigger |
|-------|---------|
| `TASK_PICKED` | Worker claims task from queue |
| `TASK_EXECUTING` | Worker starts execution |
| `TASK_COMPLETED` | Task finished successfully |
| `TASK_FAILED` | Task execution failed |
| `TASK_READY` | Scheduler marks task ready |
| `WORKER_KILLED` | Chaos control kills worker |
| `SCHEDULER_KILLED` | Chaos control kills scheduler |

---

### 7. Docker & Cloud Deployment

**Resume Point:**
> Containerized all services using Docker Compose and deployed on cloud VM (AWS/Azure) with predictable cost and controlled scaling.

---

**Q: Why Docker Compose over Kubernetes?**

For a demo/learning project, Docker Compose provides:
- **Simplicity**: Single `docker-compose.yml` file
- **Local parity**: Same setup works locally and on VM
- **Free tier fit**: Single VM deployment, no orchestrator overhead

Kubernetes would be overkill—worth it for production with auto-scaling, but not for a demo on a free-tier VM.

---

**Q: How do you handle service scaling?**

```bash
docker compose up --scale scheduler=3 --scale worker=5
```

This launches 3 scheduler instances (competing for leadership) and 5 workers (sharing the Consumer Group). Docker handles networking—they discover each other via Docker DNS.

---

**Q: What challenges did you face deploying to cloud VMs?**

| Challenge | Solution |
|-----------|----------|
| Memory constraints (1GB) | Added swap space for stability |
| Networking | Configured security groups for ports 80, 443 |
| HTTPS | Let's Encrypt with Certbot |
| Custom domain | DuckDNS (free) for dynamic DNS |
| Persistence | Docker volumes for PostgreSQL |

---

### 8. Chaos Engineering

**Resume Point:**
> Added chaos engineering controls to simulate leader crashes, worker failures, and queue outages for resilience testing.

---

**Q: What chaos scenarios can you simulate?**

| Control | What it Does | Expected Recovery |
|---------|-------------|-------------------|
| Kill Leader | Sends `KILL_SCHEDULER` signal via Redis pub/sub | New leader in ~10s |
| Kill Worker | Terminates a random worker | Tasks reassigned after lease expires |
| Pause Queue | Blocks task dispatching for 10 seconds | Resumes automatically |
| Disable Scheduler | Stops dispatcher from sending tasks | Manual re-enable |

---

**Q: How did you implement "Kill Leader"?**

The API endpoint:
1. Identifies the current leader from process registry
2. Publishes `KILL_SCHEDULER` signal via Redis pub/sub
3. Target scheduler receives signal and calls `shutdown()`
4. Remaining schedulers detect lease expiration and elect new leader

```javascript
// Publisher (API)
await chaosSignals.killScheduler(leaderId);

// Subscriber (Scheduler)
chaosSignals.onKillScheduler(myId, () => shutdown());
```

---

**Q: What did you learn from chaos testing?**

- **Leader election is robust**: Failover consistently happens within TTL + network round-trip
- **Task reassignment works**: No tasks were lost during worker kills
- **Queue resilience**: System pauses gracefully during outage and resumes
- **Importance of idempotency**: Duplicate deliveries are safely handled

---

**Q: How would you extend chaos testing for production?**

| Extension | Tool/Approach |
|-----------|---------------|
| Network partitions | `tc` (traffic control) for latency/packet loss |
| Disk failures | Fill disk on Postgres container |
| Gradual degradation | Slow down services incrementally |
| Automated chaos | Netflix Chaos Monkey, Gremlin, LitmusChaos |

---

## Quick Reference - Key Numbers

| Parameter | Value |
|-----------|-------|
| Leader Election TTL | 10 seconds |
| Worker Heartbeat Interval | 5 seconds |
| Task Lease Duration | 30 seconds |
| Lease Renewal Interval | 10 seconds |
| Retry Loop Interval | 5 seconds |
| Lease Reaper Interval | 15 seconds |
| DLQ Monitor Interval | 30 seconds |
| Max Retry Backoff | 60 seconds |

---

## Architecture Summary

```
User → API → PostgreSQL → Dispatcher → Redis Streams → Worker → PostgreSQL
              ↑                                            ↓
       Scheduler (Leader)                          Heartbeat Monitor
       (Etcd Election)                             (Recovery Service)
```

**Services:**
| Service | Responsibility | Leader-Elected? |
|---------|---------------|-----------------|
| API | REST + WebSocket | No |
| Scheduler | Mark PENDING → READY | Yes (only 1 active) |
| Dispatcher | Push READY → Redis | No (stateless) |
| Worker | Execute tasks | No (scaled) |
| Recovery | Retry + DLQ + Lease Reaper | No (stateless) |
