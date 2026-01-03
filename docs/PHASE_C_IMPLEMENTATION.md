# Phase C: Demo Mode - Implementation Documentation

## Overview
Phase C transformed the system into a demo-ready application with comprehensive visibility, event logging, and control mechanisms. The focus was on making system behavior observable and controllable for demonstrations.

## Event Logging System

### Architecture: Redis-Based Cross-Process Events

**Problem**: Initial in-memory event logger isolated events per process (API, Scheduler1, Scheduler2, Worker1-3)

**Solution**: Redis-based shared event storage

**File**: `Server/common/event-logger.js`

```javascript
class EventLogger {
    constructor() {
        this.redis = new Redis({
            host: 'localhost',
            port: 6379
        });
        this.eventsKey = 'system:events';
        this.maxEvents = 200;
    }

    async log(type, message, metadata = {}) {
        const event = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type,
            message,
            metadata,
            timestamp: new Date().toISOString()
        };

        await this.redis.lpush(this.eventsKey, JSON.stringify(event));
        await this.redis.ltrim(this.eventsKey, 0, this.maxEvents - 1);
    }

    async getRecent(limit = 50) {
        const events = await this.redis.lrange(this.eventsKey, 0, limit - 1);
        return events.map(e => JSON.parse(e));
    }
}
```

### Event Types

#### System Events
- `SCHEDULER_ENABLED` ✅ - Scheduler enabled via admin panel
- `SCHEDULER_DISABLED` 🛑 - Scheduler disabled via admin panel
- `LEADER_ELECTED` 👑 - New leader elected
- `WORKER_FAILED` 💀 - Worker missed heartbeats
- `WORKER_RECOVERED` ❤️ - Worker came back online

#### Task Lifecycle Events
- `TASK_CREATED` 📝 - Task created via API → DB
- `TASK_DISPATCHED` 📤 - Task dispatched from DB → Redis
- `TASK_PICKED` 👷 - Task picked by worker from Redis
- `TASK_EXECUTING` ⚙️ - Task execution started
- `TASK_COMPLETED` ✅ - Task completed successfully
- `TASK_FAILED` ❌ - Task execution failed

### Event Sources

#### API Controller
**File**: `Server/api/controllers/jobs.controller.js`
```javascript
eventLogger.log('TASK_CREATED', `Task ${taskId} created (${type})`, {
    taskId, type
});
```

#### Task Dispatcher
**File**: `Server/scheduler/task-dispatcher/dispatcher.js`
```javascript
eventLogger.log('TASK_DISPATCHED', `Task ${taskId} dispatched to Redis`, {
    taskId
});
```

#### Worker
**File**: `Server/worker/index.js`
```javascript
// Task picked from Redis
eventLogger.log('TASK_PICKED', `Task ${taskId} picked by ${workerId}`, {
    taskId, workerId, attempt
});

// Before execution
eventLogger.log('TASK_EXECUTING', `Task ${taskId} executing on ${workerId}`, {
    taskId, workerId
});

// After completion
eventLogger.log('TASK_COMPLETED', `Task ${taskId} completed successfully`, {
    taskId, workerId, duration
});
```

#### Admin Controller
**File**: `Server/api/controllers/admin.controller.js`
```javascript
eventLogger.log('SCHEDULER_ENABLED', 'Scheduler enabled via admin panel');
eventLogger.log('SCHEDULER_DISABLED', 'Scheduler disabled via admin panel');
```

#### Leader Election
**File**: `Server/scheduler/leader-election/leader-election.js`
```javascript
eventLogger.log('LEADER_ELECTED', `Scheduler ${schedulerId} elected as leader`, {
    schedulerId
});
```

## Three-Tier Event Display

### 1. Dashboard - System Health Focus
**File**: `Client/src/pages/Dashboard.jsx`

**Purpose**: "What's happening with my system?"

**Events Shown**:
- ✅ Scheduler enabled/disabled
- 👑 Leader elected
- 💀 Worker failed/recovered

**Implementation**:
```jsx
<EventTimeline scope="dashboard" />
```

**Filter Logic**: Shows only system-level events, filters out task-specific events

### 2. Job Detail Page - Task Lifecycle Focus
**File**: `Client/src/pages/JobDetail.jsx`

**Purpose**: "What happened to MY task?"

**Events Shown**: Complete lifecycle for specific job
- 📝 TASK_CREATED
- 📤 TASK_DISPATCHED
- 👷 TASK_PICKED
- ⚙️ TASK_EXECUTING
- ✅ TASK_COMPLETED / ❌ TASK_FAILED

**Implementation**:
```jsx
<EventTimeline scope="task" taskId={id} />
```

**Filter Logic**: API filters events by `taskId` metadata

### 3. Admin Panel - Complete Timeline
**File**: `Client/src/pages/Admin.jsx`

**Purpose**: "Show me everything for debugging"

**Events Shown**: All events (system + all tasks)

**Implementation**:
```jsx
<EventTimeline scope="admin" />
```

**Filter Logic**: No filtering, shows all events

### EventTimeline Component
**File**: `Client/src/components/EventTimeline.jsx`

**Features**:
- Auto-refresh every 3 seconds
- Absolute timestamp display (no relative time to reduce re-renders)
- Color-coded event types
- Icon indicators for each event type
- Scope-based filtering (dashboard/task/admin)

## Scheduler Enable/Disable

### Shared State Manager
**File**: `Server/common/scheduler-state.js`

**Purpose**: Cross-process scheduler enabled/disabled state

**Storage**: File-based (`.scheduler-state.json`)

```javascript
class SchedulerState {
    async setEnabled(enabled) {
        this.cache.enabled = enabled;
        await this._save();
    }

    async isEnabled() {
        await this._load();
        return this.cache.enabled;
    }
}
```

### Dispatcher Integration
**File**: `Server/scheduler/task-dispatcher/dispatcher.js`

```javascript
async _dispatchLoop() {
    const isEnabled = await schedulerState.isEnabled();
    if (!isEnabled) {
        logger.debug('Scheduler is disabled, skipping dispatch');
        return;
    }
    // ... dispatch tasks
}
```

**Behavior**: Dispatcher checks state before each dispatch cycle. When disabled, tasks remain in DB and are NOT pushed to Redis.

### Admin Endpoints
**File**: `Server/api/controllers/admin.controller.js`

```javascript
const enableScheduler = async (req, res, next) => {
    await schedulerState.setEnabled(true);
    eventLogger.log('SCHEDULER_ENABLED', 'Scheduler enabled via admin panel');
    res.json({ status: 'success', message: 'Scheduler enabled' });
};

const disableScheduler = async (req, res, next) => {
    await schedulerState.setEnabled(false);
    eventLogger.log('SCHEDULER_DISABLED', 'Scheduler disabled via admin panel');
    res.json({ status: 'success', message: 'Scheduler disabled' });
};
```

### Default State
**File**: `run.sh`

```bash
# Ensure scheduler is enabled by default
echo "🔧 Ensuring scheduler is enabled..."
rm -f .scheduler-state.json
echo '{"enabled":true}' > .scheduler-state.json
```

## Worker Status Tracking

### Execution Status
**File**: `Server/common/process-registry.js`

```javascript
async updateWorkerStatus(workerId, status, currentTaskId = null) {
    await db.query(`
        UPDATE process_instances 
        SET status = $1, current_task_id = $2, updated_at = NOW()
        WHERE id = $3
    `, [status, currentTaskId, workerId]);
}
```

**Statuses**:
- `idle` - Worker waiting for tasks
- `executing` - Worker processing a task

### Worker Integration
**File**: `Server/worker/index.js`

```javascript
// Before execution
await processRegistry.updateWorkerStatus(WORKER_ID, 'executing', task_id);

// After completion
await processRegistry.updateWorkerStatus(WORKER_ID, 'idle', null);
```

### Dashboard Display
Shows real-time worker status with visual indicators:
- 🟢 Idle workers
- 🔵 Executing workers (with task ID)

## Execution Delay for Demo Visibility

### Configurable Minimum Delay
**File**: `Server/worker/executor/task-executor.js`

```javascript
const MIN_EXECUTION_TIME = 3000; // 3 seconds minimum

async function executeTask(task) {
    const startTime = Date.now();
    
    // Add minimum delay for demo visibility
    await new Promise(resolve => setTimeout(resolve, MIN_EXECUTION_TIME));
    
    // Execute actual task
    const result = await actualExecution(task);
    
    return result;
}
```

**Purpose**: Makes status changes visible in dashboard during demos

## Dead Worker Display

### Worker Status Calculation
**File**: `Server/api/controllers/workers.controller.js`

```javascript
const getWorkers = async (req, res, next) => {
    const workers = await workersRepo.getAllWorkers();
    
    const workersWithStatus = workers.map(w => {
        const heartbeatAge = Date.now() - new Date(w.last_heartbeat).getTime();
        const status = heartbeatAge > 30000 ? 'DEAD' : 'ALIVE';
        return { ...w, status };
    });
    
    res.json({ status: 'success', data: { workers: workersWithStatus } });
};
```

### Admin Panel Display
**File**: `Client/src/pages/Admin.jsx`

```jsx
{workers.map(worker => (
    <tr key={worker.id} className={worker.status === 'DEAD' ? 'worker-dead' : ''}>
        <td>{worker.id}</td>
        <td>
            <span className={`status-badge status-${worker.status.toLowerCase()}`}>
                {worker.status}
            </span>
        </td>
        <td>{new Date(worker.last_heartbeat).toLocaleString()}</td>
    </tr>
))}
```

**Styling**: Dead workers shown with faded rows and red status badge

## Worker Limit Enforcement

### Database Constraint
**File**: `Server/db/repositories/workers.repo.js`

```javascript
async upsertHeartbeat(workerId) {
    // Limit to 3 workers
    const countResult = await db.query('SELECT COUNT(*) FROM workers');
    const workerCount = parseInt(countResult.rows[0].count);
    
    if (workerCount >= 3) {
        const existingWorker = await db.query(
            'SELECT id FROM workers WHERE id = $1', [workerId]
        );
        
        if (existingWorker.rows.length === 0) {
            throw new Error('Worker limit reached (max 3 workers)');
        }
    }
    
    // Upsert heartbeat
    await db.query(`
        INSERT INTO workers (id, last_heartbeat)
        VALUES ($1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_heartbeat = NOW()
    `, [workerId]);
}
```

## Automatic Cleanup

### Startup Cleanup
**File**: `run.sh`

```bash
# Clean up stale workers
psql -U user -d task_scheduler -c "DELETE FROM workers WHERE last_heartbeat < NOW() - INTERVAL '1 minute';"

# Clean up stale process instances
psql -U user -d task_scheduler -c "DELETE FROM process_instances;"

# Clean up event logs
redis-cli DEL system:events
```

### Shutdown Cleanup
**File**: `stop.sh`

```bash
# Clean up database
psql -U user -d task_scheduler -c "DELETE FROM workers;"
psql -U user -d task_scheduler -c "DELETE FROM process_instances;"
```

## Verification Results

### ✅ Complete Event Lifecycle
```bash
# Create task
TASK_ID=$(curl -s -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"SHELL","payload":{"command":"echo test"}}' | jq -r '.data.task.id')

# Wait for completion
sleep 6

# Check events
curl -s "http://localhost:3000/events?taskId=$TASK_ID" | jq '.data.events[] | {type, message}'
```

**Result**:
```json
{"type": "TASK_COMPLETED", "message": "Task aff7e40e completed successfully"}
{"type": "TASK_EXECUTING", "message": "Task aff7e40e executing on worker-278bd932"}
{"type": "TASK_DISPATCHED", "message": "Task aff7e40e dispatched to Redis"}
{"type": "TASK_PICKED", "message": "Task aff7e40e picked by worker-278bd932"}
{"type": "TASK_CREATED", "message": "Task aff7e40e created (SHELL)"}
```

### ✅ Scheduler Disable Prevents Execution
```bash
# Disable scheduler
curl -X POST http://localhost:3000/admin/scheduler/disable

# Create task
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"SHELL","payload":{"command":"echo test"}}'

# Wait
sleep 10

# Check task status (should still be PENDING)
curl http://localhost:3000/tasks | jq '.data.tasks[] | {id, status}'
```

**Result**: Task remains PENDING, not dispatched to Redis

### ✅ Worker Status Tracking
```bash
curl http://localhost:3000/instances | jq '.data.workers'
```

**Result**:
```json
[
  {
    "id": "worker-278bd932",
    "pid": 38185,
    "status": "executing",
    "currentTaskId": "aff7e40e-eaad-429d-8a26-fcc26ae393c9",
    "startedAt": "2026-01-03T11:23:53.271Z"
  }
]
```

### ✅ Dead Worker Display
```bash
# Kill a worker
curl -X POST http://localhost:3000/admin/faults/kill-worker \
  -H "Content-Type: application/json" \
  -d '{"workerId":"worker-278bd932"}'

# Wait for heartbeat timeout
sleep 35

# Check workers
curl http://localhost:3000/workers | jq '.data.workers[] | {id, status}'
```

**Result**: Worker shows `status: "DEAD"` in Admin panel

## Key Improvements from Phase C

1. **Redis-Based Events**: Cross-process event visibility
2. **3-Tier Display**: Dashboard (system), Job Detail (task), Admin (all)
3. **Scheduler Control**: Enable/disable with state persistence
4. **Worker Tracking**: Real-time idle/executing status
5. **Demo Visibility**: 3-second minimum execution delay
6. **Dead Worker Display**: Visual indicators in Admin panel
7. **Worker Limits**: Enforced max 3 workers
8. **Auto Cleanup**: Fresh state on every startup
9. **Absolute Timestamps**: Reduced re-renders in EventTimeline

## Files Modified

### Backend
- `Server/common/event-logger.js` - Redis-based event storage
- `Server/common/scheduler-state.js` - Shared scheduler state
- `Server/api/controllers/events.controller.js` - Event API
- `Server/api/controllers/admin.controller.js` - Scheduler control
- `Server/api/controllers/workers.controller.js` - Dead worker status
- `Server/scheduler/task-dispatcher/dispatcher.js` - State checking
- `Server/worker/index.js` - Event logging, status updates
- `Server/worker/executor/task-executor.js` - Execution delay
- `Server/db/repositories/workers.repo.js` - Worker limit

### Frontend
- `Client/src/components/EventTimeline.jsx` - 3-tier event display
- `Client/src/components/EventTimeline.css` - Event styling
- `Client/src/pages/Dashboard.jsx` - System events
- `Client/src/pages/JobDetail.jsx` - Task-specific events
- `Client/src/pages/Admin.jsx` - All events + dead workers
- `Client/src/api/api.js` - Event API client
- `Client/src/App.jsx` - Job detail routing

### Scripts
- `run.sh` - Cleanup + scheduler enabled by default
- `stop.sh` - Database cleanup

## Testing Checklist

- [x] Events logged from all processes
- [x] Events visible across all processes (Redis)
- [x] Dashboard shows system events only
- [x] Job Detail shows task lifecycle
- [x] Admin shows all events
- [x] Scheduler disable prevents dispatch
- [x] Scheduler enable resumes dispatch
- [x] Worker status updates (idle/executing)
- [x] Dead workers shown in Admin panel
- [x] Worker limit enforced (max 3)
- [x] Cleanup scripts work
- [x] Scheduler enabled by default on startup
- [x] Event logs cleared on startup
