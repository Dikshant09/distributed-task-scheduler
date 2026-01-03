# Server

Backend services for the Distributed Task Scheduler with fault tolerance and leader election.

## Structure

```
Server/
├── api/              # REST API + WebSocket (Control Plane)
├── scheduler/        # Dispatcher & Coordination (Leader-Elected)
├── worker/           # Task Executor (Data Plane)
├── db/               # Database layer (PostgreSQL)
├── queue/            # Redis Streams queue
├── common/           # Shared utilities
│   ├── event-logger.js      # System event logging
│   ├── process-registry.js  # Process tracking
│   ├── scheduler-state.js   # Scheduler enable/disable state
│   └── logger.js            # Winston logger
└── tests/            # Test suites
```

## Services

### 1. API Service (`api/`)
**Port:** 3000  
**Purpose:** REST API + WebSocket server

**Features:**
- Job CRUD operations
- System status endpoints
- Admin controls (enable/disable scheduler)
- Failure simulation endpoints (chaos testing)
- WebSocket for real-time updates
- Event timeline API

**Start:** `npm run dev:api` or `node api/server.js`

**Key Endpoints:**
- `POST /tasks` - Create job
- `GET /tasks` - List jobs
- `GET /tasks/:id` - Job details
- `GET /status` - System status
- `GET /instances` - Scheduler/worker instances
- `GET /events` - System events
- `POST /admin/scheduler/enable` - Enable scheduler
- `POST /admin/scheduler/disable` - Disable scheduler
- `POST /admin/faults/kill-leader` - Kill leader (chaos)
- `POST /admin/faults/kill-worker` - Kill worker (chaos)

### 2. Scheduler Service (`scheduler/`)
**Purpose:** Time-based dispatcher with Etcd leader election

**Features:**
- Leader election (Etcd-based)
- Polls database for pending jobs
- Dispatches jobs to Redis queue
- Retry loop (FAILED → PENDING with exponential backoff)
- Worker heartbeat monitoring
- Dead Letter Queue (DLQ) management
- Event logging

**Start:** `npm run dev:scheduler` or `node scheduler/index.js`

**Components:**
- `leader-election/` - Etcd-based consensus
- `task-dispatcher/` - Job dispatching logic
- `heartbeat/` - Worker health monitoring
- `dead-letter/` - DLQ handler

### 3. Worker Service (`worker/`)
**Purpose:** Execute jobs with lease-based execution

**Features:**
- Consumes from Redis Streams
- Acquires database lease (prevents duplicate execution)
- Executes jobs (HTTP, Shell, Delay)
- Reports results to database
- Sends heartbeats to scheduler
- Automatic retry on failure

**Start:** `npm run dev:worker` or `node worker/index.js`

**Components:**
- `executor/` - Job execution logic
- `heartbeat/` - Heartbeat sender
- `queue-consumer/` - Redis consumer

## Configuration

### Environment Variables (`.env`)
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=task_scheduler

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Etcd
ETCD_HOSTS=localhost:2379

# Scheduler Config
LEADER_ELECTION_TTL=15
DISPATCH_INTERVAL_MS=1000

# Instance Configuration
NUM_SCHEDULERS=3  # Number of scheduler instances
NUM_WORKERS=5     # Number of worker instances (max: 5)
```

## Quick Start

```bash
# Install dependencies
npm install

# Start all services (from project root)
./run.sh          # Development mode (with auto-restart)
./run_prod.sh     # Production mode (no auto-restart)

# Or start services individually
npm run dev:api        # API server
npm run dev:scheduler  # Scheduler (start multiple instances)
npm run dev:worker     # Worker (start multiple instances)
```

## Architecture

### 3-Service Separation Pattern

1. **API** - Accept user intent (Control Plane)
   - Validates and persists jobs
   - Provides system observability
   - Does NOT dispatch jobs

2. **Scheduler** - Bridge time to execution (Coordination)
   - Leader-elected (only one active)
   - Polls database for pending jobs
   - Dispatches to Redis queue
   - Monitors worker health

3. **Worker** - Execute jobs (Data Plane)
   - Stateless execution
   - Lease-based concurrency control
   - Automatic retry with backoff

### Data Flow

```
User → API → PostgreSQL → Scheduler (Leader) → Redis → Worker → PostgreSQL
                                ↓                           ↓
                            Etcd (Leader Election)    Heartbeat Monitor
```

## Database Schema

**Tables:**
- `tasks` - Job definitions and execution state
- `workers` - Worker heartbeats and status
- `process_instances` - Scheduler/worker process registry

**Key Columns:**
- `tasks.status` - PENDING, DISPATCHED, RUNNING, SUCCESS, FAILED, DLQ
- `tasks.lease_expiry` - Prevents duplicate execution
- `workers.last_heartbeat` - Worker health tracking

## Event System

Events are logged to Redis (`system:events` key) and include:
- `TASK_CREATED`, `TASK_DISPATCHED`, `TASK_COMPLETED`, `TASK_FAILED`
- `LEADER_ELECTED`, `LEADER_KILLED`
- `WORKER_FAILED`, `WORKER_RECOVERED`, `WORKER_KILLED`
- `SCHEDULER_ENABLED`, `SCHEDULER_DISABLED`

Events are:
- Stored in Redis (last 200 events)
- Volatile (cleared on Redis restart)
- Accessible via `/events` API

## Fault Tolerance

### Leader Election
- Etcd-based consensus
- Automatic failover (10-15 seconds)
- Standby schedulers ready to take over

### Worker Failure
- Heartbeat monitoring (15-second timeout)
- Automatic task reassignment
- Lease expiry prevents duplicate execution

### Retry Logic
- Exponential backoff (1s, 2s, 4s, 8s, ...)
- Configurable max attempts
- Dead Letter Queue for failed tasks

## Monitoring

**Logs:**
```bash
tail -f logs/api.log
tail -f logs/scheduler1.log
tail -f logs/worker1.log
```

**System Status:**
```bash
curl http://localhost:3000/status | jq
curl http://localhost:3000/instances | jq
curl http://localhost:3000/events | jq
```

## Testing

```bash
# Run tests
npm test

# Chaos testing (via UI or API)
curl -X POST http://localhost:3000/admin/faults/kill-leader
curl -X POST http://localhost:3000/admin/faults/kill-worker
```

See `../docs/` for detailed architecture documentation.
