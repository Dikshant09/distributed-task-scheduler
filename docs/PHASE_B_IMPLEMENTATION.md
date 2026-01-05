# Phase B: Enhanced Fault Injection - Implementation Documentation

## Overview
Phase B focused on making fault injection work reliably in a multi-process distributed system with 2 schedulers and 3 workers. The key challenge was tracking process IDs across multiple instances to enable targeted fault injection.

## Architecture

### Process Registry
**Location**: `Server/common/process-registry.js`

**Purpose**: Track all scheduler and worker processes with their PIDs for fault injection

**Storage**: PostgreSQL database (`process_instances` table)

**Schema**:
```sql
CREATE TABLE process_instances (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,  -- 'scheduler' or 'worker'
    pid INTEGER NOT NULL,
    is_leader BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Key Methods**:
- `registerScheduler(id, pid)` - Register a scheduler instance
- `registerWorker(id, pid)` - Register a worker instance
- `updateLeaderStatus(id, isLeader)` - Update leader election status
- `unregister(id)` - Remove instance on shutdown
- `getAllSchedulers()` - Get all scheduler instances
- `getAllWorkers()` - Get all worker instances

### Integration Points

#### Scheduler Integration
**File**: `Server/scheduler/index.js`

```javascript
// On startup
await processRegistry.registerScheduler(SCHEDULER_ID, process.pid);

// On leader election
await processRegistry.updateLeaderStatus(SCHEDULER_ID, true);

// On graceful shutdown
await processRegistry.unregister(SCHEDULER_ID);
```

#### Worker Integration
**File**: `Server/worker/index.js`

```javascript
// On startup
await processRegistry.registerWorker(WORKER_ID, process.pid);

// On graceful shutdown
await processRegistry.unregister(WORKER_ID);
```

## Fault Injection Endpoints

### 1. Kill Leader
**Endpoint**: `POST /admin/faults/kill-leader`

**Implementation**: `Server/api/controllers/admin.controller.js`

```javascript
const killLeader = async (req, res, next) => {
    try {
        const schedulers = await processRegistry.getAllSchedulers();
        const leader = schedulers.find(s => s.isLeader);
        
        if (!leader) {
            return res.status(404).json({
                status: 'error',
                message: 'No leader found'
            });
        }

        process.kill(leader.pid, 'SIGTERM');
        
        res.json({
            status: 'success',
            message: `Killed leader ${leader.id} (PID: ${leader.pid})`
        });
    } catch (err) {
        next(err);
    }
};
```

**Behavior**:
- Finds current leader from process registry
- Sends SIGTERM to leader process
- Triggers re-election among remaining schedulers
- New leader takes over within ~5 seconds

### 2. Kill Worker
**Endpoint**: `POST /admin/faults/kill-worker`

**Body**: `{ "workerId": "worker-abc123" }`

**Implementation**:
```javascript
const killWorker = async (req, res, next) => {
    try {
        const { workerId } = req.body;
        const workers = await processRegistry.getAllWorkers();
        const worker = workers.find(w => w.id === workerId);
        
        if (!worker) {
            return res.status(404).json({
                status: 'error',
                message: 'Worker not found'
            });
        }

        process.kill(worker.pid, 'SIGTERM');
        
        res.json({
            status: 'success',
            message: `Killed worker ${worker.id} (PID: ${worker.pid})`
        });
    } catch (err) {
        next(err);
    }
};
```

**Behavior**:
- Finds specific worker by ID
- Sends SIGTERM to worker process
- Worker's in-flight task is reassigned via lease expiry
- Heartbeat monitor detects failure within 30 seconds

### 3. Get System Instances
**Endpoint**: `GET /instances`

**Response**:
```json
{
  "status": "success",
  "data": {
    "schedulers": [
      {
        "id": "scheduler-611nwdkwv",
        "pid": 38066,
        "isLeader": true,
        "startedAt": "2026-01-03T11:23:50.717Z"
      },
      {
        "id": "scheduler-4klmtecc5",
        "pid": 38101,
        "isLeader": false,
        "startedAt": "2026-01-03T11:23:52.808Z"
      }
    ],
    "workers": [
      {
        "id": "worker-278bd932",
        "pid": 38185,
        "status": "idle",
        "currentTaskId": null,
        "startedAt": "2026-01-03T11:23:53.271Z"
      }
    ],
    "summary": {
      "totalSchedulers": 2,
      "totalWorkers": 3,
      "leaderCount": 1
    }
  }
}
```

## Multi-Instance Setup

### Configuration
**File**: `run.sh`

```bash
# Start 2 scheduler instances for leader election
node scheduler/index.js > ../logs/scheduler1.log 2>&1 &
SCHEDULER1_PID=$!

node scheduler/index.js > ../logs/scheduler2.log 2>&1 &
SCHEDULER2_PID=$!

# Start 3 worker instances
node worker/index.js > ../logs/worker1.log 2>&1 &
WORKER1_PID=$!

node worker/index.js > ../logs/worker2.log 2>&1 &
WORKER2_PID=$!

node worker/index.js > ../logs/worker3.log 2>&1 &
WORKER3_PID=$!
```

### Cleanup on Startup
```bash
# Clean up stale process instances
psql -U user -d task_scheduler -c "DELETE FROM process_instances;" > /dev/null 2>&1 || true
```

## Frontend Integration

### API Client
**File**: `Client/src/api/api.js`

```javascript
export const getInstances = () => api.get('/instances');
export const killLeader = () => api.post('/admin/faults/kill-leader');
export const killWorker = (workerId) => api.post('/admin/faults/kill-worker', { workerId });
```

### Dashboard Display
**File**: `Client/src/pages/Dashboard.jsx`

Displays:
- **Scheduler Instances**: Shows leader (👑) vs standby
- **Worker Instances**: Shows idle vs executing status
- **Fault Injection Controls**: Buttons to trigger failures

## Verification Results

### ✅ Process Registry
```bash
curl http://localhost:3000/instances
```
**Result**: Returns 2 schedulers (1 leader, 1 standby) and 3 workers

### ✅ Kill Leader
```bash
curl -X POST http://localhost:3000/admin/faults/kill-leader
```
**Result**: 
- Leader process terminated
- New leader elected within 5 seconds
- Tasks continue to be dispatched

### ✅ Kill Worker
```bash
curl -X POST http://localhost:3000/admin/faults/kill-worker \
  -H "Content-Type: application/json" \
  -d '{"workerId":"worker-278bd932"}'
```
**Result**:
- Worker process terminated
- In-flight task reassigned after lease expiry
- Heartbeat monitor marks worker as DEAD

### ✅ Multi-Instance Startup
```bash
./run.sh
```
**Result**:
- 2 schedulers start successfully
- 3 workers start successfully
- Leader election completes
- All instances registered in database

## Key Improvements from Phase B

1. **Database-Based Registry**: Switched from file-based to PostgreSQL for 100% reliability
2. **Actual Process Termination**: Fault injection now kills real processes, not just mock responses
3. **Multi-Instance Support**: System runs with 2 schedulers + 3 workers by default
4. **Automatic Cleanup**: `run.sh` clears stale instances on startup
5. **Real-Time Tracking**: Dashboard shows live instance status

## Files Modified

### Backend
- `Server/common/process-registry.js` - Process tracking (database-based)
- `Server/scheduler/index.js` - Scheduler registration
- `Server/worker/index.js` - Worker registration
- `Server/api/controllers/admin.controller.js` - Fault injection endpoints
- `Server/api/controllers/instances.controller.js` - Instance listing
- `Server/api/routes/instances.routes.js` - Routes
- `Server/api/server.js` - Route mounting

### Frontend
- `Client/src/api/api.js` - API client methods
- `Client/src/pages/Dashboard.jsx` - Instance display
- `Client/src/pages/Dashboard.css` - Styling

### Scripts
- `run.sh` - Multi-instance startup
- `stop.sh` - Cleanup
- `demo-leader-election.sh` - Demo script

## Testing Checklist

- [x] Process registry tracks all instances
- [x] Kill leader triggers re-election
- [x] Kill worker reassigns tasks
- [x] Dashboard shows instance status
- [x] Cleanup scripts work correctly
- [x] Multi-instance startup succeeds
- [x] Database persistence works
- [x] Graceful shutdown unregisters instances
