# Event Logging System Architecture

## Event Flow Diagram

```mermaid
graph TB
    subgraph "Event Sources"
        API["API Server<br/>(jobs.controller.js)"]
        SCHED1["Scheduler 1<br/>(dispatcher.js)"]
        SCHED2["Scheduler 2<br/>(dispatcher.js)"]
        WORKER1["Worker 1<br/>(index.js)"]
        WORKER2["Worker 2<br/>(index.js)"]
        WORKER3["Worker 3<br/>(index.js)"]
    end

    subgraph "Event Storage"
        REDIS[("Redis<br/>system:events<br/>(List)")]
    end

    subgraph "Event Retrieval"
        EVENTS_API["Events API<br/>(events.controller.js)"]
    end

    subgraph "UI Display"
        DASHBOARD["Dashboard<br/>(System Events)"]
        JOBDETAIL["Job Detail<br/>(Task Events)"]
        ADMIN["Admin Panel<br/>(All Events)"]
    end

    API -->|"TASK_CREATED"| REDIS
    SCHED1 -->|"TASK_DISPATCHED<br/>LEADER_ELECTED"| REDIS
    SCHED2 -->|"LEADER_ELECTED"| REDIS
    WORKER1 -->|"TASK_PICKED<br/>TASK_EXECUTING<br/>TASK_COMPLETED"| REDIS
    WORKER2 -->|"TASK_PICKED<br/>TASK_EXECUTING<br/>TASK_COMPLETED"| REDIS
    WORKER3 -->|"TASK_PICKED<br/>TASK_EXECUTING<br/>TASK_COMPLETED"| REDIS

    REDIS --> EVENTS_API
    
    EVENTS_API -->|"Filter: System Events"| DASHBOARD
    EVENTS_API -->|"Filter: taskId"| JOBDETAIL
    EVENTS_API -->|"No Filter"| ADMIN

    style REDIS fill:#ff6b6b
    style API fill:#4ecdc4
    style SCHED1 fill:#45b7d1
    style SCHED2 fill:#45b7d1
    style WORKER1 fill:#96ceb4
    style WORKER2 fill:#96ceb4
    style WORKER3 fill:#96ceb4
    style DASHBOARD fill:#ffeaa7
    style JOBDETAIL fill:#dfe6e9
    style ADMIN fill:#74b9ff
```

## Event Types by Source

### API Server
- `TASK_CREATED` - When task is created via POST /tasks

### Scheduler (Leader Only)
- `TASK_DISPATCHED` - When task is pushed to Redis queue
- `LEADER_ELECTED` - When scheduler becomes leader

### Workers
- `TASK_PICKED` - When worker consumes task from Redis
- `TASK_EXECUTING` - When worker starts task execution
- `TASK_COMPLETED` - When task finishes successfully
- `TASK_FAILED` - When task execution fails

### Admin Controller
- `SCHEDULER_ENABLED` - When scheduler is enabled
- `SCHEDULER_DISABLED` - When scheduler is disabled

## Data Flow

1. **Event Logging**: Each process calls `eventLogger.log(type, message, metadata)`
2. **Redis Storage**: Event is pushed to Redis list (`LPUSH system:events`)
3. **Event Retrieval**: API endpoint queries Redis (`LRANGE system:events`)
4. **UI Filtering**: Frontend filters events based on scope (dashboard/task/admin)

## Key Design Decisions

### Why Redis?
- **Cross-Process**: All processes (API, 2 schedulers, 3 workers) share the same event log
- **Fast**: In-memory storage with O(1) push/pop operations
- **Simple**: No complex database schema needed
- **Ephemeral**: Events are temporary (last 200 events), perfect for demo/debugging

### Why 3-Tier Display?
- **Dashboard**: Users want high-level system health, not task noise
- **Job Detail**: Users debugging a specific task need its complete lifecycle
- **Admin**: Administrators need full visibility for troubleshooting

### Why Absolute Timestamps?
- **Performance**: Relative time ("5s ago") requires re-rendering every second
- **Precision**: Absolute timestamps are more useful for debugging
- **Simplicity**: No complex time calculation logic
