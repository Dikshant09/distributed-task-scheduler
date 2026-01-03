# Process Registry Architecture

## System Overview

```mermaid
graph TB
    subgraph "Process Instances"
        SCHED1["Scheduler 1<br/>PID: 38066<br/>Leader: true"]
        SCHED2["Scheduler 2<br/>PID: 38101<br/>Leader: false"]
        WORKER1["Worker 1<br/>PID: 38102<br/>Status: idle"]
        WORKER2["Worker 2<br/>PID: 38103<br/>Status: executing"]
        WORKER3["Worker 3<br/>PID: 38104<br/>Status: idle"]
    end

    subgraph "Process Registry"
        DB[("PostgreSQL<br/>process_instances")]
    end

    subgraph "Fault Injection"
        ADMIN["Admin Controller"]
        KILL_LEADER["Kill Leader"]
        KILL_WORKER["Kill Worker"]
    end

    subgraph "Instance API"
        INSTANCES["GET /instances"]
    end

    SCHED1 -->|"registerScheduler()"| DB
    SCHED2 -->|"registerScheduler()"| DB
    WORKER1 -->|"registerWorker()"| DB
    WORKER2 -->|"registerWorker()"| DB
    WORKER3 -->|"registerWorker()"| DB

    SCHED1 -->|"updateLeaderStatus(true)"| DB
    SCHED2 -->|"updateLeaderStatus(false)"| DB

    WORKER2 -->|"updateWorkerStatus('executing')"| DB

    DB --> INSTANCES
    DB --> ADMIN

    ADMIN --> KILL_LEADER
    ADMIN --> KILL_WORKER

    KILL_LEADER -->|"Find leader PID<br/>Send SIGTERM"| SCHED1
    KILL_WORKER -->|"Find worker PID<br/>Send SIGTERM"| WORKER2

    style DB fill:#ff6b6b
    style SCHED1 fill:#45b7d1
    style SCHED2 fill:#95a5a6
    style WORKER1 fill:#96ceb4
    style WORKER2 fill:#fdcb6e
    style WORKER3 fill:#96ceb4
    style KILL_LEADER fill:#d63031
    style KILL_WORKER fill:#d63031
```

## Database Schema

```sql
CREATE TABLE process_instances (
    id VARCHAR(255) PRIMARY KEY,           -- scheduler-abc123 or worker-xyz789
    type VARCHAR(50) NOT NULL,             -- 'scheduler' or 'worker'
    pid INTEGER NOT NULL,                  -- Process ID
    is_leader BOOLEAN DEFAULT FALSE,       -- For schedulers only
    status VARCHAR(50),                    -- For workers: 'idle' or 'executing'
    current_task_id VARCHAR(255),          -- For workers: current task
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Registration Flow

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant PR as Process Registry
    participant DB as PostgreSQL
    participant LE as Leader Election

    S->>PR: registerScheduler(id, pid)
    PR->>DB: INSERT INTO process_instances
    DB-->>PR: Success
    PR-->>S: Registered

    Note over S,LE: Leader Election Happens
    
    LE->>S: You are the leader!
    S->>PR: updateLeaderStatus(id, true)
    PR->>DB: UPDATE is_leader = true
    DB-->>PR: Success
    PR-->>S: Updated

    Note over S: Graceful Shutdown
    
    S->>PR: unregister(id)
    PR->>DB: DELETE FROM process_instances
    DB-->>PR: Success
    PR-->>S: Unregistered
```

## Fault Injection Flow

```mermaid
sequenceDiagram
    participant UI as Dashboard
    participant API as Admin API
    participant PR as Process Registry
    participant DB as PostgreSQL
    participant OS as Operating System
    participant S as Scheduler (Leader)

    UI->>API: POST /admin/faults/kill-leader
    API->>PR: getAllSchedulers()
    PR->>DB: SELECT * FROM process_instances WHERE type='scheduler'
    DB-->>PR: [scheduler1, scheduler2]
    PR-->>API: schedulers
    
    Note over API: Find leader (is_leader=true)
    
    API->>OS: process.kill(38066, 'SIGTERM')
    OS->>S: SIGTERM signal
    
    Note over S: Process terminates
    
    S->>PR: unregister(id)
    PR->>DB: DELETE FROM process_instances WHERE id='scheduler-1'
    
    API-->>UI: {status: 'success', message: 'Killed leader'}
    
    Note over S: New leader elected from remaining schedulers
```

## Key Features

### 1. Database-Based Tracking
- **Reliability**: PostgreSQL ensures data persistence
- **Atomic Operations**: ACID guarantees for concurrent updates
- **Query Flexibility**: Easy to filter by type, status, leader

### 2. Real-Time Updates
- **Leader Election**: `updateLeaderStatus()` called immediately
- **Worker Status**: `updateWorkerStatus()` on task start/end
- **Graceful Shutdown**: `unregister()` on process exit

### 3. Fault Injection Support
- **Targeted Killing**: Find exact PID by instance ID
- **Leader Targeting**: Kill current leader to trigger re-election
- **Worker Targeting**: Kill specific worker by ID

### 4. Automatic Cleanup
- **Startup**: `DELETE FROM process_instances` clears stale entries
- **Shutdown**: Each process unregisters itself
- **Crash Recovery**: Stale entries cleaned on next startup

## Integration Points

### Scheduler
```javascript
// On startup
await processRegistry.registerScheduler(SCHEDULER_ID, process.pid);

// On leader election
await processRegistry.updateLeaderStatus(SCHEDULER_ID, true);

// On leader loss
await processRegistry.updateLeaderStatus(SCHEDULER_ID, false);

// On shutdown
await processRegistry.unregister(SCHEDULER_ID);
```

### Worker
```javascript
// On startup
await processRegistry.registerWorker(WORKER_ID, process.pid);

// Before task execution
await processRegistry.updateWorkerStatus(WORKER_ID, 'executing', taskId);

// After task completion
await processRegistry.updateWorkerStatus(WORKER_ID, 'idle', null);

// On shutdown
await processRegistry.unregister(WORKER_ID);
```

### Admin API
```javascript
// Kill leader
const schedulers = await processRegistry.getAllSchedulers();
const leader = schedulers.find(s => s.isLeader);
process.kill(leader.pid, 'SIGTERM');

// Kill worker
const workers = await processRegistry.getAllWorkers();
const worker = workers.find(w => w.id === workerId);
process.kill(worker.pid, 'SIGTERM');
```

## Benefits

1. **100% Reliable**: Database-based, survives process crashes
2. **Real-Time**: Immediate updates on status changes
3. **Fault Injection**: Enables targeted process termination
4. **Dashboard Visibility**: Shows live instance status
5. **Multi-Instance Support**: Tracks 2 schedulers + 3 workers
6. **Clean Startup**: Automatic cleanup of stale entries
