# Server (Backend)

The backend implementation of the Distributed Task Scheduler, following the **Single Responsibility Principle (SRP)** architecture.

## 📁 Structure

```
Server/
├── api/                           # REST API + WebSocket (Control Plane)
│   ├── controllers/               # Route handlers
│   ├── routes/                    # Express routes
│   └── server.js                  # Main API entry point
├── services/
│   ├── scheduler-coordinator/     # Leader election via Etcd
│   ├── dispatcher/                # Task dispatching to Redis
│   ├── recovery/                  # Heartbeat monitoring & lease recovery
│   └── worker-monitor/            # Worker health tracking
├── worker/                        # Task execution (Data Plane)
│   ├── index.js                   # Worker entry point
│   ├── executor/                  # Job execution logic
│   └── heartbeat/                 # Heartbeat sender
├── db/                            # Database layer
│   ├── index.js                   # PostgreSQL connection pool
│   └── migrations/                # Schema migrations
├── queue/                         # Redis queue utilities
│   └── redis.js                   # Redis client & Stream operations
├── common/                        # Shared utilities
│   ├── event-logger.js            # System event logging
│   ├── process-registry.js        # Process instance tracking
│   ├── scheduler-state.js         # Scheduler enable/disable state
│   └── logger.js                  # Winston logger
├── scripts/                       # Utility scripts
│   ├── init-db.js                 # Database initialization
│   └── session-cleanup.js         # Session cleanup job
└── infra/docker/                  # Service-specific Dockerfiles
```

## 🔧 Services

### 1. API Service (`api/`)

**Port:** 3000  
**Purpose:** REST API + WebSocket server (Control Plane)

**Features:**
- Job CRUD operations
- System status endpoints
- Admin controls (enable/disable scheduler)
- Failure simulation endpoints (chaos testing)
- WebSocket for real-time updates
- Event timeline API

**Start:** `npm run dev` or `node api/server.js`

**Key Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/tasks` | Create new job |
| `GET` | `/tasks` | List all jobs |
| `GET` | `/tasks/:id` | Get job details |
| `GET` | `/status` | System status & queue depth |
| `GET` | `/instances` | Active scheduler/worker instances |
| `GET` | `/events` | System event log |
| `GET` | `/health` | Health check |
| `POST` | `/admin/scheduler/enable` | Enable scheduler |
| `POST` | `/admin/scheduler/disable` | Disable scheduler |
| `POST` | `/admin/faults/kill-leader` | Kill leader (chaos) |
| `POST` | `/admin/faults/kill-worker` | Kill random worker (chaos) |
| `POST` | `/admin/faults/pause-queue` | Pause Redis queue (chaos) |
| `POST` | `/admin/reset/instances` | Restart killed instances |
| `POST` | `/admin/reset/system` | Full system reset |

---

### 2. Scheduler Coordinator (`services/scheduler-coordinator/`)

**Purpose:** Leader election and coordination

**Features:**
- Etcd-based leader election
- Only the leader actively coordinates
- Standby instances ready for failover
- Automatic re-election on leader failure (10-15 seconds)

**Start:** `node services/scheduler-coordinator/index.js`

**Behavior:**
- Registers with process registry
- Acquires Etcd lease for leader election
- Leader broadcasts its status via Redis pub/sub
- On leader death, a standby scheduler becomes leader

---

### 3. Dispatcher (`services/dispatcher/`)

**Purpose:** Stateless task dispatching

**Features:**
- Polls PostgreSQL for PENDING tasks
- Pushes tasks to Redis Streams
- Updates task status to DISPATCHED
- Runs continuously on a configurable interval

**Start:** `node services/dispatcher/index.js`

---

### 4. Worker (`worker/`)

**Purpose:** Task execution with lease-based concurrency

**Features:**
- Consumes tasks from Redis Streams (consumer group)
- Acquires database lease (prevents duplicate execution)
- Executes jobs (HTTP, Shell, Delay types)
- Reports results to database
- Sends periodic heartbeats
- Automatic retry on failure with exponential backoff

**Start:** `node worker/index.js`

**Execution Flow:**
1. Read task from Redis Stream
2. Acquire lease in PostgreSQL (atomic update)
3. Execute task
4. Update status (SUCCESS/FAILED)
5. Acknowledge message in Redis

---

### 5. Recovery Service (`services/recovery/`)

**Purpose:** Fault tolerance via heartbeat monitoring

**Features:**
- Monitors worker heartbeats (15-second timeout)
- Detects dead workers (missed heartbeats)
- Reclaims leases from stalled tasks
- Resets tasks to PENDING for re-execution
- Logs recovery events

**Start:** `node services/recovery/index.js`

---

### 6. Cleanup Service (`scripts/session-cleanup.js`)

**Purpose:** Data retention and cleanup

**Features:**
- Removes expired session entries
- Cleans up old process instances
- Runs periodically in production

**Start:** `node scripts/session-cleanup.js`

---

## ⚙️ Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=task_scheduler
DATABASE_URL=postgres://user:password@postgres:5432/task_scheduler

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379

# Etcd
ETCD_HOSTS=etcd:2379

# Scheduler Config
LEADER_ELECTION_TTL=15          # Seconds before leader lease expires
DISPATCH_INTERVAL_MS=1000       # Task dispatch polling interval
MIN_EXECUTION_DELAY_MS=3000     # Artificial delay for demo visibility

# Session Config
MAX_SESSIONS=50
SESSION_TTL_MINUTES=30

# Instance Configuration
NUM_SCHEDULERS=3                # Number of scheduler instances
NUM_WORKERS=5                   # Number of worker instances (max: 5)
```

---

## 🗄️ Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Job definitions and execution state |
| `task_executions` | Execution history per task |
| `workers` | Worker heartbeats and status |
| `process_instances` | Scheduler/worker process registry |

### Key Columns

**tasks:**
- `id` - UUID primary key
- `name` - Job name
- `type` - `HTTP`, `SHELL`, or `DELAY`
- `status` - `PENDING`, `DISPATCHED`, `RUNNING`, `SUCCESS`, `FAILED`, `DLQ`
- `payload` - JSON job configuration
- `lease_owner` - Worker ID holding the lease
- `lease_expiry` - Timestamp when lease expires
- `attempt` - Current retry attempt
- `max_attempts` - Maximum retries before DLQ

**workers:**
- `worker_id` - UUID primary key
- `hostname` - Container/process hostname
- `last_heartbeat` - Last heartbeat timestamp
- `status` - `ACTIVE`, `DEAD`

**process_instances:**
- `instance_id` - UUID primary key
- `type` - `SCHEDULER` or `WORKER`
- `hostname` - Container hostname
- `is_leader` - Boolean (for schedulers)
- `status` - `ACTIVE`, `INACTIVE`

---

## 📢 Event System

Events are logged to Redis (`system:events` key) for real-time UI updates.

### Event Types

| Event | Description |
|-------|-------------|
| `TASK_CREATED` | New task created |
| `TASK_DISPATCHED` | Task pushed to Redis queue |
| `TASK_STARTED` | Worker started executing |
| `TASK_COMPLETED` | Task succeeded |
| `TASK_FAILED` | Task failed |
| `LEADER_ELECTED` | New leader scheduler elected |
| `LEADER_KILLED` | Leader was killed (chaos) |
| `WORKER_REGISTERED` | New worker joined |
| `WORKER_FAILED` | Worker heartbeat timeout |
| `WORKER_RECOVERED` | Worker came back online |
| `WORKER_KILLED` | Worker was killed (chaos) |
| `SCHEDULER_ENABLED` | Scheduler enabled |
| `SCHEDULER_DISABLED` | Scheduler disabled |
| `SYSTEM_RESET` | System was reset |

### Event Storage

- Stored in Redis list (last 200 events)
- Volatile (cleared on Redis restart)
- Accessible via `GET /events` API

---

## 💪 Fault Tolerance

### Leader Election (Etcd)

- Etcd-based distributed consensus
- Leader holds a lease with TTL (15 seconds default)
- If leader dies, lease expires and a standby takes over
- Automatic failover in 10-15 seconds

### Worker Failure Recovery

- Workers send heartbeats every 5 seconds
- Recovery service checks for missed heartbeats (15-second timeout)
- Dead workers' tasks have leases reclaimed
- Tasks reset to PENDING for re-execution

### Lease-Based Execution

- Workers acquire a database lease before execution
- Lease has an expiry timestamp
- Prevents duplicate execution if worker dies mid-task
- If worker dies, lease expires and task can be picked up again

### Retry Logic

- Exponential backoff: 1s, 2s, 4s, 8s, 16s...
- Configurable `max_attempts` per task
- After max attempts exceeded → moved to Dead Letter Queue (DLQ)

---

## 📊 Monitoring

### View Logs

```bash
# Docker
docker compose logs -f api
docker compose logs -f scheduler
docker compose logs -f worker

# Local
tail -f logs/api.log
tail -f logs/scheduler.log
```

### System Status

```bash
# Overall status
curl http://localhost:3000/status | jq

# Active instances
curl http://localhost:3000/instances | jq

# Event log
curl http://localhost:3000/events | jq
```

### Health Check

```bash
curl http://localhost:3000/health
# Returns: "OK"
```

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
# From project root
docker compose up -d --scale scheduler=3 --scale worker=5
```

### Local Development

```bash
# Install dependencies
cd Server && npm install

# Start API (Terminal 1)
npm run dev

# Start Scheduler (Terminal 2)
node services/scheduler-coordinator/index.js

# Start Dispatcher (Terminal 3)
node services/dispatcher/index.js

# Start Worker (Terminal 4)
node worker/index.js

# Start Recovery (Terminal 5)
node services/recovery/index.js
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Chaos testing via API
curl -X POST http://localhost:3000/admin/faults/kill-leader
curl -X POST http://localhost:3000/admin/faults/kill-worker
curl -X POST http://localhost:3000/admin/faults/pause-queue
```

---

## 🧪 Chaos Signals

The system uses Redis Pub/Sub for chaos engineering signals:

| Channel | Effect |
|---------|--------|
| `chaos:kill-leader` | Terminates the current leader scheduler |
| `chaos:kill-worker` | Terminates a random worker |
| `chaos:pause-queue` | Pauses Redis queue consumption (10s) |

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `express` | REST API framework |
| `socket.io` | WebSocket real-time updates |
| `pg` | PostgreSQL client |
| `ioredis` | Redis client |
| `etcd3` | Etcd consensus client |
| `winston` | Logging |
| `uuid` | ID generation |
