# VS Code Debugging Guide

## Quick Start

### Option 1: Debug Individual Services

1. **Debug API Server**
   - Press `F5` or go to Run & Debug
   - Select "Debug API Server"
   - Set breakpoints in `Server/api/**/*.js`
   - API runs on `http://localhost:3000`

2. **Debug Scheduler**
   - Select "Debug Scheduler"
   - Set breakpoints in `Server/scheduler/**/*.js`
   - Watch dispatcher, retry loop, DLQ handler

3. **Debug Worker**
   - Select "Debug Worker"
   - Set breakpoints in `Server/worker/**/*.js`
   - Watch task execution, lease acquisition

4. **Debug Client**
   - Select "Debug Client (Chrome)"
   - Opens Chrome with debugger attached
   - Set breakpoints in React components

### Option 2: Debug All Backend Services (Recommended)

1. Select **"Debug All Backend Services"** from the dropdown
2. This launches API, Scheduler, and Worker simultaneously
3. Each service runs in its own terminal
4. Set breakpoints across all services

### Option 3: Debug Full Stack

1. Select **"Debug Full Stack"**
2. Launches all backend services + React client
3. Full end-to-end debugging capability

---

## Debugging Workflows

### Workflow 1: Debug Job Creation Flow

1. Start "Debug All Backend Services"
2. Set breakpoints:
   - `Server/api/controllers/jobs.controller.js:createJob` (line ~10)
   - `Server/scheduler/task-dispatcher/dispatcher.js:_dispatchLoop` (line ~30)
   - `Server/worker/index.js:processTask` (line ~12)
3. Create a job via UI or curl
4. Step through the entire flow

### Workflow 2: Debug Retry Logic

1. Start "Debug All Backend Services"
2. Set breakpoints:
   - `Server/worker/index.js` (line ~80 - failure handling)
   - `Server/scheduler/task-dispatcher/dispatcher.js:_retryLoop` (line ~74)
3. Create a failing task (DELAY with fail_probability=1.0)
4. Watch retry calculation and DLQ movement

### Workflow 3: Debug Leader Election

1. Start "Debug Scheduler"
2. Set breakpoints:
   - `Server/scheduler/leader-election/leader-election.js:start` (line ~15)
   - `Server/scheduler/index.js` (elected/lost events)
3. Watch leader election process

---

## Attach Mode (For Running Services)

If services are already running via `./run.sh`, you can attach the debugger:

### Step 1: Start services with debug flags

```bash
# Stop current services
./stop.sh

# Start with debug ports
cd Server
node --inspect=9229 api/server.js > ../logs/api.log 2>&1 &
node --inspect=9230 scheduler/index.js > ../logs/scheduler.log 2>&1 &
node --inspect=9231 worker/index.js > ../logs/worker.log 2>&1 &
```

### Step 2: Attach debugger

1. Select "Attach to API" (or Scheduler/Worker)
2. Debugger connects to running process
3. Set breakpoints and debug

---

## Common Breakpoint Locations

### API Layer
- `Server/api/controllers/jobs.controller.js:10` - Job creation
- `Server/api/controllers/system.controller.js:11` - System status
- `Server/api/controllers/admin.controller.js:52` - Fault injection

### Scheduler Layer
- `Server/scheduler/task-dispatcher/dispatcher.js:29` - Dispatch loop
- `Server/scheduler/task-dispatcher/dispatcher.js:74` - Retry loop
- `Server/scheduler/leader-election/leader-election.js:15` - Leader election

### Worker Layer
- `Server/worker/index.js:12` - Task processing
- `Server/worker/index.js:32` - Lease acquisition
- `Server/worker/executor/task-executor.js:104` - Task execution

### Database Layer
- `Server/db/repositories/tasks.repo.js:58` - Lease acquisition query
- `Server/db/repositories/tasks.repo.js:115` - Retry query

---

## Tips & Tricks

### 1. Conditional Breakpoints

Right-click breakpoint → Edit Breakpoint → Add condition:
```javascript
task.type === 'HTTP'
task.attempt > 2
workerId === 'worker-abc123'
```

### 2. Logpoints

Instead of `console.log`, use logpoints:
- Right-click line → Add Logpoint
- Enter: `Task {task.id} status: {task.status}`

### 3. Watch Expressions

Add to Watch panel:
```javascript
task.status
task.attempt
leaderElection.isLeader
```

### 4. Debug Console

Execute code in context:
```javascript
await tasksRepo.getTaskById(task_id)
JSON.stringify(task, null, 2)
```

---

## Troubleshooting

### Issue: Debugger won't attach
**Solution:** Ensure services are running with `--inspect` flag

### Issue: Breakpoints not hitting
**Solution:** 
1. Check source maps are enabled
2. Verify file paths match
3. Restart debugger

### Issue: Multiple workers confusing
**Solution:** Use "Debug Worker" to launch single worker instance

### Issue: Client debugger not working
**Solution:**
1. Ensure Vite dev server is running
2. Check Chrome DevTools extension is installed
3. Try "Debug Client (Chrome)" configuration

---

## Advanced: Multi-Process Debugging

To debug leader failover:

1. Start two scheduler instances:
```bash
node --inspect=9230 scheduler/index.js &
node --inspect=9232 scheduler/index.js &
```

2. Attach to both:
   - "Attach to Scheduler" (port 9230)
   - Create new attach config for port 9232

3. Kill leader, watch failover in second instance

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Start Debugging | `F5` |
| Stop Debugging | `Shift+F5` |
| Step Over | `F10` |
| Step Into | `F11` |
| Step Out | `Shift+F11` |
| Continue | `F5` |
| Toggle Breakpoint | `F9` |

---

## Example Debugging Session

```
1. Select "Debug All Backend Services"
2. Set breakpoint in jobs.controller.js:createJob
3. Create job via UI
4. Debugger pauses at breakpoint
5. Inspect req.body
6. Step through validation
7. Step into tasksRepo.createTask
8. Watch DB INSERT
9. Continue (F5)
10. Breakpoint hits in dispatcher._dispatchLoop
11. Watch task being pushed to Redis
12. Continue
13. Breakpoint hits in worker.processTask
14. Watch lease acquisition
15. Step through execution
16. Done!
```

---

## Resources

- [VS Code Node.js Debugging](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [Node.js Inspector](https://nodejs.org/en/docs/guides/debugging-getting-started/)
