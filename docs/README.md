# Distributed Task Scheduler - Complete Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Phase Implementations](#phase-implementations)
4. [API Reference](#api-reference)
5. [Deployment Guide](#deployment-guide)
6. [Troubleshooting](#troubleshooting)

---

## System Overview

A production-ready distributed task scheduler with fault tolerance, leader election, real-time monitoring, and visual observability.

### Key Features
- ✅ Distributed leader election (Etcd)
- ✅ Task queue with Redis
- ✅ PostgreSQL for persistent storage
- ✅ Multi-instance schedulers (active-standby)
- ✅ Multi-instance workers (horizontal scaling)
- ✅ Real-time WebSocket updates
- ✅ Interactive system topology visualization
- ✅ Comprehensive fault injection
- ✅ Event logging and timeline
- ✅ Production and development modes

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  - Dashboard  - Jobs  - Admin Panel  - System Topology      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP + WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                      API Server (Express)                    │
│  - REST API  - WebSocket Server  - Fault Injection          │
└─────┬──────────────┬──────────────┬────────────────────────┘
      │              │              │
      ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│Scheduler1│  │Scheduler2│  │PostgreSQL│
│ (Leader) │  │(Standby) │  │  (Tasks) │
└────┬─────┘  └────┬─────┘  └──────────┘
     │             │
     └──────┬──────┘
            ▼
      ┌──────────┐
      │   Etcd   │
      │(Election)│
      └──────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌─────────┐   ┌─────────┐
│  Redis  │   │ Workers │
│ (Queue) │◄──┤  (1-3)  │
└─────────┘   └─────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React + Vite | UI dashboard |
| API | Node.js + Express | REST API |
| Schedulers | Node.js | Task dispatching |
| Workers | Node.js | Task execution |
| Database | PostgreSQL | Task persistence |
| Queue | Redis | Task distribution |
| Leader Election | Etcd | Distributed consensus |
| Real-time | Socket.io | WebSocket updates |

---

## Phase Implementations

### Phase A: Core Functionality
- [x] Task creation and storage
- [x] Basic scheduler
- [x] Worker execution
- [x] PostgreSQL integration
- [x] Redis queue

**Documentation**: `docs/PHASE_A_IMPLEMENTATION.md`

### Phase B: Enhanced Fault Injection
- [x] Process registry
- [x] Multi-instance tracking
- [x] Targeted fault injection
- [x] Leader/worker kill endpoints

**Documentation**: `docs/PHASE_B_IMPLEMENTATION.md`

### Phase C: Demo Mode
- [x] Event logging system
- [x] 3-tier event display
- [x] Scheduler enable/disable
- [x] Worker status tracking
- [x] Execution delays

**Documentation**: `docs/PHASE_C_IMPLEMENTATION.md`

### Phase D: Real-Time Updates & Visualization
- [x] WebSocket real-time updates
- [x] System topology visualization
- [x] Enhanced event logging
- [x] Redis-based state management
- [x] Production mode support

**Documentation**: `docs/PHASE_D_IMPLEMENTATION.md`

---

## Quick Start

### Prerequisites

```bash
# Install infrastructure services
brew install redis etcd postgresql@14

# Start services
brew services start redis
brew services start etcd
brew services start postgresql@14

# Create database
createdb -U user task_scheduler
psql -U user -d task_scheduler -f Server/db/schema.sql
```

### Development Mode (Auto-Restart)

```bash
# Install dependencies
cd Server && npm install
cd ../Client && npm install

# Start system
cd ..
./run.sh

# Access
# Frontend: http://localhost:5173
# API: http://localhost:3000
```

### Production Mode (No Auto-Restart)

```bash
# Start system
./run_prod.sh

# Workers stay dead when killed
# Demonstrates true fault tolerance
```

### Stop System

```bash
./stop.sh
```

---

## API Reference

### Tasks

#### Create Task
```http
POST /tasks
Content-Type: application/json

{
  "type": "SHELL",
  "payload": {
    "command": "echo 'Hello World'"
  }
}
```

#### Get Task
```http
GET /tasks/:id
```

#### List Tasks
```http
GET /tasks?status=PENDING&limit=50
```

### System

#### Get System Status
```http
GET /system/status
```

Response:
```json
{
  "status": "success",
  "data": {
    "scheduler": {
      "enabled": true,
      "leader": "scheduler-abc123"
    },
    "redis": {
      "connected": true,
      "queueDepth": 5
    },
    "database": {
      "connected": true
    }
  }
}
```

#### Get Instances
```http
GET /instances
```

Response:
```json
{
  "status": "success",
  "data": {
    "schedulers": [
      {
        "id": "scheduler-abc123",
        "pid": 12345,
        "isLeader": true,
        "startedAt": "2026-01-03T12:00:00Z"
      }
    ],
    "workers": [
      {
        "id": "worker-def456",
        "pid": 12346,
        "status": "idle",
        "currentTaskId": null,
        "startedAt": "2026-01-03T12:00:01Z"
      }
    ]
  }
}
```

### Admin / Fault Injection

#### Kill Leader
```http
POST /admin/faults/kill-leader
```

#### Kill Worker
```http
POST /admin/faults/kill-worker
Content-Type: application/json

{
  "workerId": "worker-abc123"  // Optional, random if not specified
}
```

#### Enable Scheduler
```http
POST /admin/scheduler/enable
```

#### Disable Scheduler
```http
POST /admin/scheduler/disable
```

### Events

#### Get Events
```http
GET /events?limit=50&taskId=task-123
```

---

## WebSocket Events

### Client → Server
None (client only listens)

### Server → Client

#### system:update
Broadcast every 2 seconds with complete system state.

```javascript
{
  schedulers: [...],
  workers: [...],
  events: [...],
  timestamp: "2026-01-03T12:00:00Z"
}
```

#### instances:update
Emitted when instances change (fault injection, startup, shutdown).

```javascript
{
  schedulers: [...],
  workers: [...],
  timestamp: "2026-01-03T12:00:00Z"
}
```

#### event:new
Emitted when new event is logged.

```javascript
{
  type: "WORKER_KILLED",
  data: {...},
  timestamp: "2026-01-03T12:00:00Z"
}
```

---

## Deployment Guide

### Environment Variables

Create `.env` file in `Server/`:

```env
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

# Server
PORT=3000
NODE_ENV=production
```

### Production Deployment

```bash
# Build frontend
cd Client
npm run build

# Serve frontend with nginx/apache
# Point to Client/dist/

# Start backend with PM2
cd Server
pm2 start ecosystem.config.js
```

### PM2 Configuration

**File**: `Server/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'api/server.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'scheduler',
      script: 'scheduler/index.js',
      instances: 2,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker',
      script: 'worker/index.js',
      instances: 3,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

---

## Troubleshooting

### Redis Connection Failed

```bash
# Check if Redis is running
redis-cli ping

# Should return: PONG

# If not running
brew services start redis
```

### Etcd Connection Failed

```bash
# Check if Etcd is running
etcdctl endpoint health

# Or
curl http://localhost:2379/health

# If not running
brew services start etcd
```

### PostgreSQL Connection Failed

```bash
# Check if PostgreSQL is running
psql -U user -d task_scheduler -c "SELECT 1"

# If not running
brew services start postgresql@14

# If database doesn't exist
createdb -U user task_scheduler
psql -U user -d task_scheduler -f Server/db/schema.sql
```

### Workers Not Picking Up Tasks

1. Check Redis queue:
```bash
redis-cli XLEN task_queue
```

2. Check worker logs:
```bash
tail -f logs/worker1.log
```

3. Check if scheduler is enabled:
```bash
curl http://localhost:3000/system/status | jq '.data.scheduler.enabled'
```

### Leader Not Elected

1. Check Etcd:
```bash
etcdctl get /scheduler/leader
```

2. Check scheduler logs:
```bash
tail -f logs/scheduler1.log
tail -f logs/scheduler2.log
```

3. Restart schedulers:
```bash
./stop.sh
./run.sh
```

### WebSocket Not Connecting

1. Check API server logs:
```bash
tail -f logs/api.log | grep WebSocket
```

2. Check browser console for errors

3. Verify CORS settings in `Server/api/websocket.js`:
```javascript
cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
}
```

---

## Monitoring

### System Health

```bash
# Check all services
curl http://localhost:3000/health

# Check system status
curl http://localhost:3000/system/status

# Check instances
curl http://localhost:3000/instances
```

### Logs

```bash
# API
tail -f logs/api.log

# Schedulers
tail -f logs/scheduler1.log
tail -f logs/scheduler2.log

# Workers
tail -f logs/worker1.log
tail -f logs/worker2.log
tail -f logs/worker3.log

# Frontend
tail -f logs/client.log
```

### Redis Monitoring

```bash
# Queue depth
redis-cli XLEN task_queue

# Failed workers set
redis-cli SMEMBERS scheduler:failed_workers

# Event log
redis-cli LLEN system:events
```

---

## Performance Tuning

### Scheduler Dispatch Interval

**File**: `Server/scheduler/task-dispatcher/dispatcher.js`

```javascript
// Default: 2 seconds
this.interval = setInterval(() => this._dispatchLoop(), 2000);

// For higher throughput
this.interval = setInterval(() => this._dispatchLoop(), 500);
```

### Worker Heartbeat Interval

**File**: `Server/worker/heartbeat/heartbeat-sender.js`

```javascript
// Default: 5 seconds
this.interval = setInterval(() => this.sendHeartbeat(), 5000);

// For faster failure detection
this.interval = setInterval(() => this.sendHeartbeat(), 2000);
```

### Leader Election TTL

**File**: `Server/scheduler/leader-election/leader-election.js`

```javascript
// Default: 3 seconds
this.election = client.election(this.key, 3);

// For more stability (slower failover)
this.election = client.election(this.key, 10);
```

---

## Contributing

### Code Structure

```
distributed-task-scheduler/
├── Server/
│   ├── api/              # REST API + WebSocket
│   ├── scheduler/        # Task dispatcher + leader election
│   ├── worker/           # Task executor
│   ├── db/               # Database + repositories
│   ├── queue/            # Redis queue
│   └── common/           # Shared utilities
├── Client/
│   ├── src/
│   │   ├── pages/        # Dashboard, Jobs, Admin
│   │   ├── components/   # Reusable components
│   │   └── api/          # API client
│   └── public/
├── docs/                 # Documentation
├── logs/                 # Log files
├── run.sh                # Development mode
├── run_prod.sh           # Production mode
└── stop.sh               # Stop all services
```

### Development Workflow

1. Make changes
2. Test locally with `./run.sh`
3. Test fault injection
4. Test production mode with `./run_prod.sh`
5. Update documentation
6. Commit changes

---

## License

MIT

---

## Support

For issues, questions, or contributions, please refer to the individual phase documentation files in the `docs/` directory.
