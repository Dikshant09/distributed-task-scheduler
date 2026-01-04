# Refactored High-Level Design (V2)
## Distributed Task Scheduler - SRP Architecture

This is the refactored design following the Single Responsibility Principle with properly decoupled services and event-based leader election.

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph Frontend["🖥️ Frontend"]
        UI[React App]
    end

    subgraph API["🌐 API Layer"]
        REST[REST + WebSocket]
    end

    subgraph Coordinator["⚡ Scheduler Coordinator (LEADER ELECTED)"]
        Leader["👑 Leader<br/>campaign.on('elected')"]
        Standby1["⏸️ Standby"]
        Standby2["⏸️ Standby"]
        Planner["Schedule Planner<br/>PENDING → READY"]
    end

    subgraph Dispatcher["📤 Dispatcher (Stateless)"]
        Poller["Ready Job Poller<br/>READY → DISPATCHED"]
        Publisher[Redis Publisher]
    end

    subgraph Recovery["🔄 Recovery Service (Stateless)"]
        Retry[Retry Handler]
        DLQ[DLQ Handler]
        Lease[Lease Reaper]
    end

    subgraph Monitor["👁️ Worker Monitor (Stateless)"]
        Heartbeat[Heartbeat Checker]
    end

    subgraph Workers["👷 Worker Pool"]
        W1[Worker 1]
        W2[Worker N]
    end

    subgraph Storage["💾 Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis Streams)]
        Etcd[(Etcd)]
    end

    UI --> REST
    REST --> PG
    
    Leader --> Etcd
    Leader --> Planner
    Planner --> PG
    
    Poller --> PG
    Publisher --> Redis
    
    Retry --> PG
    DLQ --> PG
    Lease --> PG
    
    Heartbeat --> PG
    
    Redis --> W1
    Redis --> W2
    W1 --> PG
    W2 --> PG
```

---

## Leader Election - Event-Based Campaign Pattern

The Scheduler Coordinator uses **etcd3's event-based campaign** for reliable leader election:

```mermaid
sequenceDiagram
    participant C1 as Coordinator 1
    participant C2 as Coordinator 2
    participant Etcd as Etcd
    participant DB as PostgreSQL

    C1->>Etcd: election.campaign(id)
    C2->>Etcd: election.campaign(id)
    
    Etcd-->>C1: campaign.on('elected') ✅
    Note right of C1: Becomes Leader
    C1->>DB: updateSchedulerLeader(id, true)
    
    Note over C1: Leader crashes 💥
    
    Etcd-->>C2: campaign.on('elected')
    Note right of C2: Becomes New Leader
    C2->>DB: updateSchedulerLeader(id, true)
    
    Note over C1,C2: Failover complete (~10-15s)
```

### Key Implementation Details

```javascript
// leader-election.js - Event-based pattern
async _campaign() {
    this.campaign = this.election.campaign(this.electionKey);

    // Properly detects when THIS node becomes leader
    this.campaign.on('elected', () => {
        this.isLeader = true;
        this.emit('elected');
    });

    // Properly detects when THIS node loses leadership
    this.campaign.on('lost', () => {
        this.isLeader = false;
        this.emit('demoted');
        // Re-campaign after losing
        if (this.campaigning) {
            setTimeout(() => this._campaign(), 1000);
        }
    });
}
```

---

## Service Responsibilities

| Service | Leader? | State | Responsibility |
|---------|---------|-------|----------------|
| **Scheduler Coordinator** | ✅ Yes | Stateful | Mark PENDING → READY when `scheduled_at <= NOW()` |
| **Dispatcher** | ❌ No | Stateless | Poll READY tasks, push to Redis, mark DISPATCHED |
| **Recovery Service** | ❌ No | Stateless | Handle retries, DLQ, expired leases |
| **Worker Monitor** | ❌ No | Stateless | Check heartbeats, emit failure events |
| **Worker** | ❌ No | Stateless | Consume from Redis, execute tasks |

---

## Job Lifecycle (V2)

```mermaid
stateDiagram-v2
    [*] --> PENDING: Task Created
    
    PENDING --> READY: Coordinator marks ready
    READY --> DISPATCHED: Dispatcher pushes to Redis
    DISPATCHED --> RUNNING: Worker acquires lease
    
    RUNNING --> SUCCESS: Execution completes
    RUNNING --> FAILED: Execution fails
    RUNNING --> PENDING: Lease expired (Recovery)
    
    FAILED --> PENDING: Retry (Recovery)
    FAILED --> DLQ: Max retries (Recovery)
    
    SUCCESS --> [*]
    DLQ --> PENDING: Manual retry
```

---

## Data Flow

```
1. API → DB (PENDING)
2. Scheduler Coordinator → DB (PENDING → READY)  ← Leader-gated, event-based
3. Dispatcher → Redis (READY → Redis → DISPATCHED)  ← Stateless
4. Worker → Redis → DB (DISPATCHED → RUNNING → SUCCESS)
5. Recovery → DB (FAILED → PENDING or DLQ)  ← Stateless
```

---

## npm Scripts

```bash
# SRP Services (V2)
npm run start:coordinator   # Scheduler Coordinator (leader-elected)
npm run start:dispatcher    # Dispatcher (stateless)
npm run start:recovery      # Recovery Service (stateless)
npm run start:monitor       # Worker Monitor (stateless)

# Existing
npm run start:api           # API Server
npm run start:worker        # Worker
```

---

## Key Design Decisions

1. **Leader election only gates scheduling** - not dispatch or recovery
2. **Event-based campaign pattern** - Uses `campaign.on('elected')` / `campaign.on('lost')` for reliable leadership changes
3. **READY state** - Clean handoff between Coordinator and Dispatcher
4. **Atomic DB updates** - Transaction for leader status, `FOR UPDATE SKIP LOCKED` for tasks
5. **Stateless services** - Dispatcher, Recovery, Monitor can scale horizontally

---

## draw.io Diagram

See: [HLD_V2_SRP_Architecture.drawio](./HLD_V2_SRP_Architecture.drawio)
