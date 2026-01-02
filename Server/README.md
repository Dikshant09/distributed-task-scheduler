# Server

Backend services for the Distributed Task Scheduler.

## Structure

```
Server/
├── api/              # REST API (Control Plane)
├── scheduler/        # Dispatcher & Coordination
├── worker/           # Task Executor (Data Plane)
├── db/               # Database layer
├── queue/            # Redis Streams queue
├── common/           # Shared utilities
└── tests/            # Test suites
```

## Services

### 1. API Service (`api/`)
**Port:** 3000  
**Purpose:** Accept user intent, validate, and persist jobs

- Handles job creation, retrieval, updates
- Provides system status and admin endpoints
- Does NOT dispatch jobs (that's the scheduler's job)

**Start:** `npm run dev:api`

### 2. Scheduler Service (`scheduler/`)
**Purpose:** Time-based dispatcher with leader election

- Polls database for jobs where `scheduled_at <= NOW()`
- Pushes eligible jobs to Redis Streams
- Handles retry loop (FAILED → PENDING)
- Monitors DLQ
- Leader-elected (only one active)

**Start:** `npm run dev:scheduler`

### 3. Worker Service (`worker/`)
**Purpose:** Execute tasks safely with lease-based execution

- Consumes from Redis Streams
- Acquires database lease
- Executes jobs (HTTP, Shell, Delay)
- Reports results
- Sends heartbeats

**Start:** `npm run dev:worker`

## Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm run dev
```

## Environment Variables

See `../.env` for configuration:
- Database connection (PostgreSQL)
- Redis connection
- Etcd connection
- Service ports

## Architecture

This follows a **3-service separation** pattern:

1. **API** - Accept intent (Control Plane)
2. **Scheduler** - Bridge time to execution (Coordination)
3. **Worker** - Execute jobs (Data Plane)

See `../docs/diagrams/` for detailed architecture diagrams.
