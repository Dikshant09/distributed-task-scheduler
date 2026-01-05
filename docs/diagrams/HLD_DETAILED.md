# Detailed High-Level Design (HLD)
## Distributed Task Scheduler - Complete Architecture

---

## 1. System Architecture Overview

```mermaid
flowchart TB
    subgraph Frontend["🖥️ Frontend (React + Vite)"]
        UI[Dashboard UI]
        Jobs[Jobs Page]
        Admin[Admin Panel]
        Topology[System Topology]
    end

    subgraph API["🌐 API Layer (Express.js)"]
        REST[REST API]
        WS[WebSocket Server]
    end

    subgraph Scheduler["⚡ Scheduler Service"]
        Leader[Leader Election]
        Watcher[Watcher/Dispatcher]
        Monitor[Worker Monitor]
        DLQ[DLQ Handler]
    end

    subgraph Workers["👷 Worker Pool"]
        W1[Worker 1]
        W2[Worker 2]
        WN[Worker N]
    end

    subgraph Storage["💾 Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis Streams)]
        Etcd[(Etcd)]
    end

    UI --> REST
    Jobs --> REST
    Admin --> REST
    Topology --> WS

    REST --> PG
    WS --> PG
    
    Leader --> Etcd
    Watcher --> PG
    Watcher --> Redis
    Monitor --> PG
    DLQ --> PG

    Redis --> W1
    Redis --> W2
    Redis --> WN
    
    W1 --> PG
    W2 --> PG
    WN --> PG
```

---

## 2. Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant PostgreSQL
    participant Watcher
    participant Redis
    participant Worker

    User->>Frontend: Create Task
    Frontend->>API: POST /tasks
    API->>PostgreSQL: INSERT (status=PENDING)
    PostgreSQL-->>API: Task ID
    API-->>Frontend: Task Created
    
    loop Every 2 seconds
        Watcher->>PostgreSQL: SELECT pending tasks
        PostgreSQL-->>Watcher: Tasks due now
        Watcher->>Redis: XADD to stream
        Watcher->>PostgreSQL: UPDATE status=DISPATCHED
    end

    Worker->>Redis: XREADGROUP (consume)
    Redis-->>Worker: Task payload
    Worker->>PostgreSQL: Acquire lease (status=RUNNING)
    Worker->>Worker: Execute task
    Worker->>PostgreSQL: UPDATE status=SUCCESS/FAILED
    Worker->>Redis: XACK (acknowledge)
    
    Frontend->>API: GET /tasks (polling)
    API->>PostgreSQL: SELECT tasks
    PostgreSQL-->>API: Task list
    API-->>Frontend: Updated tasks
```

---

## 3. Frontend Pages & What They Show

| Page | URL | Data Source | Update Method |
|------|-----|-------------|---------------|
| **Dashboard** | `/` | System stats, queue depth | Polling (2s) |
| **Jobs** | `/jobs` | Task list with filters | Polling (2s) |
| **Job Detail** | `/jobs/:id` | Single task + history | Polling (3s) |
| **Schedule** | `/schedule` | Upcoming tasks | Polling (3s) |
| **Admin** | `/admin` | System controls, chaos | WebSocket |
| **Topology** | (component) | Live system topology | WebSocket |

---

## 4. Backend Services & Responsibilities

```mermaid
flowchart LR
    subgraph ControlPlane["Control Plane"]
        API["API Server<br/>Port 3000"]
        API --> |Creates| Tasks
        API --> |Serves| UI
    end

    subgraph SchedulerService["Scheduler Service"]
        Dispatcher["Dispatcher<br/>Polls every 2s"]
        Retry["Retry Handler<br/>Every 5s"]
        WorkerMon["Worker Monitor<br/>Every 15s"]
        DLQMon["DLQ Monitor<br/>Every 30s"]
    end

    subgraph ExecutionPlane["Execution Plane"]
        Worker1["Worker 1"]
        Worker2["Worker 2"]
        WorkerN["Worker N"]
    end

    Dispatcher --> |Dispatch| Redis[(Redis)]
    Redis --> Worker1
    Redis --> Worker2
    Redis --> WorkerN
```

---

## 5. Data Flow Diagram

```mermaid
flowchart TD
    subgraph UserActions["👤 User Actions"]
        Create[Create Task]
        View[View Tasks]
        RunNow[Run Now]
        Cancel[Cancel Task]
    end

    subgraph APIEndpoints["🌐 API Endpoints"]
        POST[POST /tasks]
        GET[GET /tasks]
        RUN[POST /tasks/:id/run-now]
        DEL[DELETE /tasks/:id]
    end

    subgraph Database["💾 PostgreSQL"]
        TasksTable[(tasks table)]
        EventsTable[(events table)]
        WorkersTable[(workers table)]
    end

    subgraph Queue["📨 Redis Streams"]
        TaskStream[task-queue stream]
        DLQStream[dlq stream]
    end

    subgraph Processing["⚙️ Processing"]
        Watcher[Watcher Service]
        Workers[Worker Pool]
    end

    Create --> POST --> TasksTable
    View --> GET --> TasksTable
    RunNow --> RUN --> TasksTable
    
    TasksTable --> |Poll PENDING| Watcher
    Watcher --> |XADD| TaskStream
    TaskStream --> |XREADGROUP| Workers
    Workers --> |Update Status| TasksTable
    Workers --> |Log Events| EventsTable
    
    Workers --> |Max Retries| DLQStream
```

---

## 6. Job Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Task Created
    
    PENDING --> DISPATCHED: Watcher picks up
    DISPATCHED --> RUNNING: Worker acquires lease
    
    RUNNING --> SUCCESS: Execution completes
    RUNNING --> FAILED: Execution fails
    
    FAILED --> PENDING: Retry (backoff)
    FAILED --> DLQ: Max retries exceeded
    
    SUCCESS --> [*]
    DLQ --> PENDING: Manual retry
    DLQ --> [*]: Discarded
```

---

## 7. Polling vs WebSocket Usage

```mermaid
flowchart TB
    subgraph BackendPolling["🔄 Backend Polling (setInterval)"]
        D1[Dispatcher: 2s - Fetch pending tasks]
        D2[Retry Loop: 5s - Requeue failed]
        D3[Worker Monitor: 15s - Check heartbeats]
        D4[DLQ Monitor: 30s - Process dead letters]
        D5[Heartbeat Sender: 5s - Worker alive signal]
    end

    subgraph FrontendPolling["🔄 Frontend Polling (HTTP)"]
        F1[Dashboard: 2s]
        F2[Jobs List: 2s]
        F3[Job Detail: 3s]
        F4[Events: 3s]
        F5[Header Status: 3s]
    end

    subgraph WebSocketRT["⚡ WebSocket Real-Time"]
        W1[System Topology: Live updates]
        W2[Admin Panel: Live events]
        W3[Instance status changes]
        W4[Worker connect/disconnect]
    end
```

---

## 8. Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite | SPA with modern UI |
| **Styling** | CSS + Glassmorphism | Dark theme, animations |
| **API** | Express.js | REST + WebSocket |
| **Real-time** | Socket.IO | Live updates |
| **Database** | PostgreSQL | Source of truth |
| **Queue** | Redis Streams | Task dispatch |
| **Coordination** | Etcd | Leader election |

---

## 9. Network Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (dev) | 5173 | HTTP |
| API Server | 3000 | HTTP + WS |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |
| Etcd | 2379 | gRPC |

---

## 10. Fault Tolerance

```mermaid
flowchart TD
    subgraph Failures["Failure Scenarios"]
        F1[Leader Crash]
        F2[Worker Crash]
        F3[Redis Down]
        F4[Task Failure]
    end

    subgraph Recovery["Recovery Mechanisms"]
        R1[Etcd lease expires → New leader elected]
        R2[Lease expires → Task re-executed]
        R3[Jobs in DB → Dispatch when Redis recovers]
        R4[Exponential backoff → DLQ after max retries]
    end

    F1 --> R1
    F2 --> R2
    F3 --> R3
    F4 --> R4
```
