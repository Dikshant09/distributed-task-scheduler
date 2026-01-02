# Flow Diagrams
## Distributed Task Scheduler - Visual Flows

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        UI[React UI]
        User[User/API Client]
    end
    
    subgraph "Control Plane"
        API[Scheduler API<br/>Port 3000]
        DB[(PostgreSQL<br/>Source of Truth)]
    end
    
    subgraph "Coordination Layer"
        Etcd[(Etcd<br/>Leader Election)]
        Leader[Leader Election<br/>Service]
    end
    
    subgraph "Dispatch Layer"
        Dispatcher[Watcher/Dispatcher<br/>Leader-Elected]
        Redis[(Redis Streams<br/>Durable Queue)]
    end
    
    subgraph "Execution Layer"
        W1[Worker 1]
        W2[Worker 2]
        WN[Worker N...]
    end
    
    subgraph "Monitoring"
        DLQ[DLQ Handler]
        Monitor[Worker Monitor]
    end
    
    User --> UI
    UI --> API
    User --> API
    API --> DB
    
    Leader --> Etcd
    Dispatcher --> Leader
    Dispatcher --> DB
    Dispatcher --> Redis
    
    Redis --> W1
    Redis --> W2
    Redis --> WN
    
    W1 --> DB
    W2 --> DB
    WN --> DB
    
    DLQ --> DB
    Monitor --> DB
    
    style API fill:#4CAF50
    style Dispatcher fill:#2196F3
    style W1 fill:#FF9800
    style W2 fill:#FF9800
    style WN fill:#FF9800
    style DB fill:#9C27B0
    style Redis fill:#F44336
    style Etcd fill:#607D8B
```

---

## 2. Job Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Job Created
    
    PENDING --> DISPATCHED: Watcher polls<br/>(scheduled_at <= NOW)
    
    DISPATCHED --> RUNNING: Worker acquires lease
    
    RUNNING --> SUCCESS: Execution succeeds
    RUNNING --> FAILED: Execution fails
    
    FAILED --> PENDING: Retry ready<br/>(next_retry_at <= NOW)
    FAILED --> DLQ: Max attempts exceeded
    
    DLQ --> PENDING: Manual retry<br/>(Admin action)
    
    SUCCESS --> [*]
    DLQ --> [*]: Archived/Deleted
    
    note right of PENDING
        Status: PENDING
        Worker: NULL
        Lease: NULL
    end note
    
    note right of RUNNING
        Status: RUNNING
        Worker: worker-abc123
        Lease: NOW() + 30s
    end note
    
    note right of FAILED
        Status: FAILED
        Attempt: attempt + 1
        Next Retry: NOW() + backoff
    end note
```

---

## 3. End-to-End Job Flow

```mermaid
sequenceDiagram
    participant User
    participant API as Scheduler API
    participant DB as PostgreSQL
    participant Watcher as Dispatcher
    participant Redis as Redis Streams
    participant Worker
    
    User->>API: POST /tasks
    API->>API: Validate payload
    API->>DB: INSERT (status='PENDING')
    DB-->>API: Task created
    API-->>User: 201 Created
    
    Note over Watcher: Every 1 second
    Watcher->>DB: SELECT WHERE status='PENDING'<br/>AND scheduled_at <= NOW()
    DB-->>Watcher: [task1, task2, ...]
    
    Watcher->>Redis: XADD tasks:pending
    Watcher->>DB: UPDATE status='DISPATCHED'
    
    Note over Worker: Consumer group
    Worker->>Redis: XREADGROUP (BLOCK 5s)
    Redis-->>Worker: {task_id, attempt}
    
    Worker->>DB: UPDATE (acquire lease)<br/>SET status='RUNNING'<br/>assigned_worker_id=?<br/>lease_expiry=NOW()+30s
    DB-->>Worker: Lease acquired
    
    Worker->>Worker: Execute task
    
    alt Success
        Worker->>DB: UPDATE status='SUCCESS'
        Worker->>Redis: XACK
    else Failure
        Worker->>DB: UPDATE status='FAILED'<br/>attempt=attempt+1<br/>next_retry_at=NOW()+backoff
        Worker->>Redis: XACK
    end
```

---

## 4. Dispatch Loop Flow

```mermaid
flowchart TD
    Start([Dispatcher Loop<br/>Every 1s]) --> CheckLeader{Is Leader?}
    
    CheckLeader -->|No| End([Sleep 1s])
    CheckLeader -->|Yes| QueryDB[Query DB:<br/>SELECT * FROM tasks<br/>WHERE status='PENDING'<br/>AND scheduled_at <= NOW()]
    
    QueryDB --> HasTasks{Tasks found?}
    HasTasks -->|No| End
    HasTasks -->|Yes| GetEpoch[Get Leader Epoch]
    
    GetEpoch --> LoopTasks[For each task]
    LoopTasks --> PushRedis[XADD to Redis Streams]
    PushRedis --> AddToList[Add to dispatchedIds]
    AddToList --> MoreTasks{More tasks?}
    
    MoreTasks -->|Yes| LoopTasks
    MoreTasks -->|No| BatchUpdate[Batch UPDATE:<br/>SET status='DISPATCHED'<br/>WHERE id IN (...)]
    
    BatchUpdate --> LogSuccess[Log: Dispatched N tasks]
    LogSuccess --> End
    
    style Start fill:#4CAF50
    style CheckLeader fill:#FFC107
    style PushRedis fill:#F44336
    style BatchUpdate fill:#9C27B0
```

---

## 5. Worker Execution Flow

```mermaid
flowchart TD
    Start([Worker Loop]) --> Consume[XREADGROUP from Redis<br/>BLOCK 5s]
    
    Consume --> GotMsg{Message?}
    GotMsg -->|No| Start
    GotMsg -->|Yes| CheckDB[Query DB:<br/>Get task by ID]
    
    CheckDB --> AlreadyDone{Status = SUCCESS?}
    AlreadyDone -->|Yes| Ack[XACK message]
    Ack --> Start
    
    AlreadyDone -->|No| AcquireLease[UPDATE tasks<br/>SET status='RUNNING'<br/>assigned_worker_id=?<br/>lease_expiry=NOW()+30s<br/>WHERE lease_expiry < NOW()]
    
    AcquireLease --> GotLease{Lease acquired?}
    GotLease -->|No| Start
    GotLease -->|Yes| StartRenew[Start lease renewer<br/>Every 10s]
    
    StartRenew --> Execute[Execute task]
    Execute --> Success{Success?}
    
    Success -->|Yes| UpdateSuccess[UPDATE status='SUCCESS']
    UpdateSuccess --> StopRenew[Stop lease renewer]
    StopRenew --> Ack
    
    Success -->|No| CalcBackoff[Calculate backoff:<br/>min(1000 * 2^attempt, 60000)]
    CalcBackoff --> UpdateFailed[UPDATE status='FAILED'<br/>attempt=attempt+1<br/>next_retry_at=NOW()+backoff]
    UpdateFailed --> StopRenew
    
    style Start fill:#4CAF50
    style Execute fill:#FF9800
    style UpdateSuccess fill:#4CAF50
    style UpdateFailed fill:#F44336
```

---

## 6. Retry Loop Flow

```mermaid
flowchart TD
    Start([Retry Loop<br/>Every 5s]) --> CheckLeader{Is Leader?}
    
    CheckLeader -->|No| End([Sleep 5s])
    CheckLeader -->|Yes| QueryRetry[Query DB:<br/>SELECT * FROM tasks<br/>WHERE status='FAILED'<br/>AND next_retry_at <= NOW()]
    
    QueryRetry --> HasRetry{Tasks found?}
    HasRetry -->|No| End
    HasRetry -->|Yes| LoopRetry[For each task]
    
    LoopRetry --> CheckAttempts{attempt >= max_attempts?}
    
    CheckAttempts -->|Yes| MoveDLQ[UPDATE status='DLQ'<br/>dlq_reason='Max attempts']
    MoveDLQ --> LogDLQ[Log: Task moved to DLQ]
    LogDLQ --> MoreRetry{More tasks?}
    
    CheckAttempts -->|No| ResetPending[UPDATE status='PENDING'<br/>next_retry_at=NULL<br/>assigned_worker_id=NULL]
    ResetPending --> LogRetry[Log: Task reset for retry]
    LogRetry --> MoreRetry
    
    MoreRetry -->|Yes| LoopRetry
    MoreRetry -->|No| End
    
    style Start fill:#4CAF50
    style MoveDLQ fill:#F44336
    style ResetPending fill:#2196F3
```

---

## 7. Leader Election Flow

```mermaid
sequenceDiagram
    participant S1 as Scheduler 1
    participant S2 as Scheduler 2
    participant S3 as Scheduler 3
    participant Etcd
    
    Note over S1,S3: All schedulers start
    
    S1->>Etcd: Campaign for leadership<br/>(lease TTL: 10s)
    S2->>Etcd: Campaign for leadership
    S3->>Etcd: Campaign for leadership
    
    Etcd-->>S1: ✅ You are leader
    Etcd-->>S2: ❌ Wait
    Etcd-->>S3: ❌ Wait
    
    Note over S1: Start dispatcher
    S1->>S1: Dispatch loop active
    
    Note over S1: Keep-alive every 5s
    S1->>Etcd: Renew lease
    Etcd-->>S1: Lease renewed
    
    Note over S1: Leader crashes
    S1-xEtcd: ❌ No keep-alive
    
    Note over Etcd: Lease expires (10s)
    Etcd->>S2: ✅ You are leader
    
    Note over S2: Start dispatcher
    S2->>S2: Dispatch loop active
    
    Note over S2,S3: S2 is now leader
```

---

## 8. Lease-based Execution

```mermaid
sequenceDiagram
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant DB as PostgreSQL
    
    Note over W1,W2: Both workers consume same task
    
    W1->>DB: UPDATE tasks<br/>SET assigned_worker_id='worker-1'<br/>lease_expiry=NOW()+30s<br/>WHERE id=? AND lease_expiry < NOW()
    
    W2->>DB: UPDATE tasks<br/>SET assigned_worker_id='worker-2'<br/>lease_expiry=NOW()+30s<br/>WHERE id=? AND lease_expiry < NOW()
    
    DB-->>W1: ✅ 1 row updated (lease acquired)
    DB-->>W2: ❌ 0 rows updated (lease already held)
    
    Note over W1: Execute task
    W1->>W1: Start execution
    
    Note over W2: Abort (no lease)
    W2->>W2: Skip task
    
    loop Every 10s
        W1->>DB: UPDATE lease_expiry=NOW()+30s<br/>WHERE id=? AND assigned_worker_id='worker-1'
        DB-->>W1: Lease renewed
    end
    
    W1->>DB: UPDATE status='SUCCESS'
    DB-->>W1: Task completed
```

---

## 9. DLQ Monitoring Flow

```mermaid
flowchart TD
    Start([DLQ Handler<br/>Every 30s]) --> CheckLeader{Is Leader?}
    
    CheckLeader -->|No| End([Sleep 30s])
    CheckLeader -->|Yes| QueryDLQ[Query DB:<br/>SELECT * FROM tasks<br/>WHERE status='DLQ']
    
    QueryDLQ --> HasDLQ{DLQ tasks?}
    HasDLQ -->|No| End
    HasDLQ -->|Yes| LogCount[Log: DLQ contains N tasks]
    
    LogCount --> LoopDLQ[For each DLQ task]
    LoopDLQ --> LogDetails[Log: Task ID, Type,<br/>Reason, Attempts]
    LogDetails --> MoreDLQ{More tasks?}
    
    MoreDLQ -->|Yes| LoopDLQ
    MoreDLQ -->|No| CheckCritical{Count > 100?}
    
    CheckCritical -->|Yes| AlertCritical[⚠️ Log: DLQ size critical!]
    AlertCritical --> End
    CheckCritical -->|No| End
    
    style Start fill:#4CAF50
    style AlertCritical fill:#F44336
    style LogDetails fill:#FF9800
```

---

## 10. Failure Recovery Scenarios

### 10.1 Leader Failure

```mermaid
sequenceDiagram
    participant L1 as Leader 1
    participant L2 as Standby
    participant Etcd
    participant DB
    participant Redis
    
    Note over L1: Dispatching tasks
    L1->>DB: SELECT pending tasks
    L1->>Redis: XADD task1
    
    Note over L1: ❌ Crashes
    L1-xEtcd: No keep-alive
    
    Note over Etcd: Lease expires
    Etcd->>L2: ✅ You are leader
    
    Note over L2: Resume dispatch
    L2->>DB: SELECT pending tasks
    L2->>Redis: XADD task2
    
    Note over L2: No duplicate dispatch<br/>(task1 already DISPATCHED)
```

### 10.2 Worker Failure

```mermaid
sequenceDiagram
    participant W as Worker
    participant DB
    participant Monitor as Worker Monitor
    
    Note over W: Executing task
    W->>DB: UPDATE status='RUNNING'<br/>lease_expiry=NOW()+30s
    
    Note over W: ❌ Crashes
    W-xDB: No lease renewal
    
    Note over DB: Lease expires (30s)
    
    Note over Monitor: Every 15s
    Monitor->>DB: SELECT * FROM workers<br/>WHERE last_heartbeat < NOW()-15s
    DB-->>Monitor: [worker-abc123]
    
    Monitor->>DB: UPDATE tasks<br/>SET assigned_worker_id=NULL<br/>lease_expiry=NULL<br/>WHERE assigned_worker_id='worker-abc123'
    
    Note over DB: Task available for retry
```

---

## 11. Data Flow Summary

```mermaid
graph LR
    A[User] -->|POST /tasks| B[API]
    B -->|INSERT| C[(PostgreSQL)]
    C -->|Poll| D[Dispatcher]
    D -->|XADD| E[(Redis)]
    E -->|XREADGROUP| F[Worker]
    F -->|Execute| G[Job]
    G -->|UPDATE| C
    
    style A fill:#4CAF50
    style B fill:#2196F3
    style C fill:#9C27B0
    style D fill:#FF9800
    style E fill:#F44336
    style F fill:#607D8B
    style G fill:#FFC107
```

---

## 12. Component Interaction Matrix

| Component | Interacts With | Purpose |
|-----------|---------------|---------|
| **API** | PostgreSQL | Persist jobs |
| **Dispatcher** | PostgreSQL, Redis, Etcd | Poll & dispatch jobs |
| **Worker** | PostgreSQL, Redis | Execute jobs |
| **DLQ Handler** | PostgreSQL | Monitor failed jobs |
| **Worker Monitor** | PostgreSQL | Detect dead workers |
| **Leader Election** | Etcd | Coordinate dispatcher |

---

## 13. Request Flow Examples

### Example 1: Create HTTP Job

```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB
    
    User->>API: POST /tasks<br/>{type: "HTTP", payload: {...}}
    API->>API: Validate HTTP payload
    API->>DB: INSERT INTO tasks<br/>(id, type, payload, status='PENDING')
    DB-->>API: Task created
    API-->>User: 201 {task: {...}}
```

### Example 2: View Job Status

```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB
    
    User->>API: GET /tasks/abc-123
    API->>DB: SELECT * FROM tasks<br/>WHERE id='abc-123'
    DB-->>API: {status: 'SUCCESS', attempt: 2, ...}
    API-->>User: 200 {task: {...}, executionHistory: {...}}
```

### Example 3: Manual DLQ Retry

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant DB
    
    Admin->>API: POST /admin/dlq/abc-123/retry
    API->>DB: UPDATE tasks<br/>SET status='PENDING'<br/>attempt=0<br/>dlq_reason=NULL<br/>WHERE id='abc-123' AND status='DLQ'
    DB-->>API: 1 row updated
    API-->>Admin: 200 {message: "Task reset"}
```

---

## 14. Time-based Scheduling

```mermaid
gantt
    title Job Scheduling Timeline
    dateFormat HH:mm:ss
    axisFormat %H:%M:%S
    
    section Job Creation
    POST /tasks (scheduled_at=12:05:00) :done, create, 12:00:00, 1s
    
    section Waiting
    Status: PENDING :active, wait, 12:00:01, 4m59s
    
    section Dispatch
    Watcher polls (12:05:00) :crit, dispatch, 12:05:00, 1s
    Push to Redis :crit, push, 12:05:01, 1s
    
    section Execution
    Worker consumes :done, consume, 12:05:02, 1s
    Acquire lease :done, lease, 12:05:03, 1s
    Execute task :active, exec, 12:05:04, 5s
    Update SUCCESS :done, success, 12:05:09, 1s
```

---

## 15. Scalability Patterns

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Nginx/ALB]
    end
    
    subgraph "API Layer (Stateless)"
        API1[API Instance 1]
        API2[API Instance 2]
        API3[API Instance 3]
    end
    
    subgraph "Dispatch Layer (Leader-Elected)"
        D1[Dispatcher 1<br/>LEADER]
        D2[Dispatcher 2<br/>STANDBY]
        D3[Dispatcher 3<br/>STANDBY]
    end
    
    subgraph "Execution Layer (Horizontal)"
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
        WN[Worker N...]
    end
    
    LB --> API1
    LB --> API2
    LB --> API3
    
    D1 -.->|Failover| D2
    D2 -.->|Failover| D3
    
    style D1 fill:#4CAF50
    style D2 fill:#FFC107
    style D3 fill:#FFC107
```

---

## Legend

- 🟢 **Active/Running** - Component is operational
- 🟡 **Standby** - Component is ready for failover
- 🔴 **Failed** - Component has crashed
- ⚠️ **Critical** - Requires attention
- ✅ **Success** - Operation completed
- ❌ **Failure** - Operation failed
