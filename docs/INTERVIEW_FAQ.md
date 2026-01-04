# Interview FAQ - Distributed Task Scheduler

A curated collection of senior-level interview Q&A for discussing this distributed task scheduler project.

> **Goal**: Answer with confidence, show intentional trade-offs, and demonstrate deep understanding.

---

## Table of Contents
1. [Infrastructure & SPOF](#infrastructure--spof)
2. [Leader Election](#leader-election)
3. [Distributed Systems Theory](#distributed-systems-theory)
4. [Scaling & Production](#scaling--production)
5. [Quick One-Liners](#quick-one-liners)

---

## Infrastructure & SPOF

### Q: "Are Redis and PostgreSQL single points of failure?"

**Short Answer (Start Here):**
> "Yes, in this demo Redis and Postgres are single points of failure by design. In production, both are deployed as replicated, highly available systems. For this project, I intentionally kept them single-instance to reduce cost and complexity, while keeping the architecture compatible with HA setups."

**Deep Dive (If They Push):**

#### PostgreSQL – Source of Truth

| Aspect | Details |
|--------|---------|
| Is it a SPOF? | Logically yes, physically no (in production) |
| Production solution | Primary + Read Replicas, Synchronous/async replication, Automatic failover |
| Examples | AWS RDS Multi-AZ, Azure Flexible Server HA, GCP Cloud SQL HA, Patroni + etcd |

**Why the design already supports HA:**
- Writes are limited and controlled (only scheduler leader writes)
- Leader election already exists (etcd)
- Read-heavy paths (dashboard, workers) can hit replicas
- No cross-DB transactions

**Key Point:**
> "The system assumes logical single-writer semantics, not physical single-node DB."

#### Redis – Task Queue

**Redis is NOT the source of truth**

If Redis goes down:
1. Tasks still exist in Postgres
2. Dispatcher can re-push READY tasks
3. Workers re-consume
4. At-least-once semantics handle duplicates

**So Redis failure = temporary delay, not data loss.**

Production solutions: Redis Sentinel, Redis Cluster, Managed Redis (ElastiCache / Azure Cache)

---

### Q: "What happens when Redis crashes?"

**Answer:**
- Dispatcher pauses (cannot push to queue)
- No tasks are lost (they're in PostgreSQL)
- Once Redis is back → dispatcher resumes
- System self-heals

> "This is why the database is the source of truth. If Redis dies, we can't dispatch, but no data is lost. Tasks remain PENDING in PostgreSQL. When Redis recovers, the scheduler resumes dispatching. The queue is just a delivery mechanism, not a storage system."

---

### Q: "What happens when PostgreSQL crashes?"

**Answer:**
- Entire system pauses (correct behavior)
- No inconsistent execution
- On recovery → resumes cleanly

> "Database failure halts the system—this is intentional. We prioritize data integrity over availability (CP in CAP). No tasks are lost; they just wait. When the DB recovers, everything resumes. For higher availability, we'd add read replicas and a primary failover."

**Key Phrase:**
> "Fail-fast and pause is better than corrupting state."

---

## Leader Election

### Q: "What if etcd fails?"

**Scenario Analysis:**

| Etcd State | Impact |
|------------|--------|
| Etcd unreachable | Current leader continues (lease still valid locally) |
| Etcd down for > TTL | Leader loses lease, stops dispatching |
| Etcd recovers | New election occurs, a coordinator becomes leader |

**Answer:**
> "If etcd goes down briefly, the current leader continues operating—its lease is still valid locally. If etcd is down longer than the 10-second TTL, the leader will stop dispatching because it can't confirm its leadership. When etcd recovers, a new election happens automatically."

---

### Q: "How does leader election actually work?"

**Event-Based Campaign Pattern:**

```javascript
// Start campaign - returns campaign object with event emitters
this.campaign = this.election.campaign(this.electionKey);

// Fires when THIS node becomes leader
this.campaign.on('elected', () => {
    this.isLeader = true;
    this.emit('elected');
});

// Fires when THIS node loses leadership
this.campaign.on('lost', () => {
    this.isLeader = false;
    this.emit('demoted');
    // Re-campaign after losing
    setTimeout(() => this._campaign(), 1000);
});
```

**Key Insight:**
> "We use etcd3's event-based campaign pattern. The `campaign.on('lost')` event properly detects when another node becomes leader, which is critical for re-election. A blocking `await campaign()` approach fails to detect leadership changes."

---

### Q: "Why 10-second lease TTL?"

| TTL | Failover Time | Keep-alive Frequency | Trade-off |
|-----|---------------|---------------------|-----------|
| 3s | ~3s | Every 1s | Fast but high overhead |
| 10s | ~10-15s | Every 3s | **Balanced (our choice)** |
| 30s | ~30s | Every 10s | Slow but low overhead |

**Answer:**
> "10 seconds balances fast failover against network overhead. In production, 30 seconds might be acceptable. For a demo, we want failover visible quickly but not so aggressive that network jitter causes false failures."

---

## Distributed Systems Theory

### Q: "Why not use DB as queue?"

**Answer:**
> "If I wanted to eliminate Redis entirely, I could run workers directly off the DB using `SELECT … FOR UPDATE SKIP LOCKED`, but I kept Redis to better visualize queueing and backpressure."

**This signals:**
- You know DB-only schedulers exist
- You chose Redis intentionally

**Full Rationale:**
- Redis Streams provide consumer groups (auto load-balancing)
- Visualizes queue concepts clearly for demos
- Separates concerns (DB = state, Queue = transport)
- Scales better under high throughput

---

### Q: "How would you do exactly-once?"

**The Truth:**
> "True exactly-once requires distributed transactions. We achieve effectively-once by combining at-least-once delivery with idempotent task execution."

**Our Approach:**
1. **Idempotency key** prevents duplicate job creation
2. **Lease acquisition** prevents duplicate execution
3. **ACK after execution** prevents re-delivery

**Key Phrase:**
> "The consumer is responsible for idempotency—if a task runs twice, it should produce the same result."

---

### Q: "What CAP trade-offs did you make?"

**Our Choice: CP (Consistency + Partition tolerance)**

| Component | Trade-off |
|-----------|-----------|
| Leader Election | CP → Only one leader, even if network partitions |
| Lease Acquisition | CP → Only one worker gets lease |
| Task State | CP → Strong consistency over availability |

**Answer:**
> "We choose consistency over availability. If there's a network partition, we'd rather have the system unavailable than risk two leaders dispatching duplicates. For a task scheduler, correctness trumps uptime."

---

## Scaling & Production

### Q: "How would you shard this?"

**Sharding Strategy:**

| Component | Sharding Approach |
|-----------|-------------------|
| Database | Partition by tenant_id or date |
| Redis | Redis Cluster (automatic sharding) |
| Workers | Consumer groups (self-distributing) |
| Scheduler | Shard by tenant → multiple leaders |

**Answer:**
> "For multi-tenant, I'd shard by tenant_id—each tenant gets its own partition. This means each tenant has its own scheduler leader, queue, and worker pool. This provides isolation and scales horizontally."

---

### Q: "How would this scale to millions of tasks?"

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

**Answer:**
> "Current architecture handles ~1000 tasks/sec on single instances. For millions, I'd partition the database by tenant or date, add read replicas, move to Redis Cluster, and potentially shard queues by task type. The worker pool scales linearly."

---

## Quick One-Liners

### Memorize These

| Question | One-Line Answer |
|----------|-----------------|
| **SPOF?** | "Redis and Postgres are single instances in the demo, but not SPOFs in the architecture. Redis is disposable, Postgres can be HA." |
| **Why queue?** | "Decoupling, load leveling, consumer groups" |
| **Why SQL?** | "ACID for atomic lease acquisition" |
| **Worker failure?** | "Lease expires, task reassigned" |
| **Leader failure?** | "Etcd re-election in ~15s via event-based campaign" |
| **Redis failure?** | "Tasks safe in DB, dispatched on recovery" |
| **DB failure?** | "System halts, resumes on recovery" |
| **Exactly-once?** | "At-least-once + idempotency" |
| **CAP trade-off?** | "CP—consistency over availability" |

---

### The Ultimate One-Liner

> "Redis and Postgres are single instances in the demo, but not single points of failure in the architecture. Redis is disposable, and Postgres can be made HA without changing any application logic."

That answer is **senior-level, calm, and convincing**.

---

### What NOT to Say

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| "Redis/Postgres won't fail" | "Intentional trade-off" |
| "We assume infra handles it" | "Production-compatible design" |
| "This is just a demo so it doesn't matter" | "Failure-safe by construction" |

---

*This document is optimized for interview preparation. Practice these answers out loud!*
