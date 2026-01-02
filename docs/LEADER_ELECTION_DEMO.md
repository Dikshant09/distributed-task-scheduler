# Leader Election Failover Demo - Manual Process

## Issue

The "Kill Leader" button in the UI cannot work when API and Scheduler run as separate processes, because clicking the button would kill the API process (where the endpoint lives), not the scheduler.

## Solution: Manual Leader Killing

### Step 1: Start Multi-Scheduler Demo

```bash
./stop.sh
./demo-leader-election.sh
```

### Step 2: Identify the Leader

Check which scheduler is the leader:

```bash
# Check scheduler 1
tail logs/scheduler1.log | grep -i "I am the leader"

# Check scheduler 2  
tail logs/scheduler2.log | grep -i "I am the leader"
```

**Example output:**
```
scheduler1.log: "I am the leader (scheduler-abc123)"
scheduler2.log: (no output - waiting for leadership)
```

### Step 3: Kill the Leader Process

Find the leader's PID:

```bash
ps aux | grep "node scheduler/index.js" | grep -v grep
```

**Output:**
```
hwaiting_dk  33837  ... node scheduler/index.js  # Scheduler 1
hwaiting_dk  33872  ... node scheduler/index.js  # Scheduler 2
```

Kill the leader (e.g., if Scheduler 1 is leader):

```bash
kill -9 33837
```

**Or use pkill:**
```bash
# Kill first scheduler instance
pkill -f "node scheduler/index.js" -n
```

### Step 4: Watch Failover Happen

Monitor the standby becoming leader:

```bash
tail -f logs/scheduler2.log | grep -i "became leader"
```

**Expected output (within ~10 seconds):**
```
{"level":"info","message":"I am the leader (scheduler-xyz789)"}
{"level":"info","message":"Became Leader. Starting services..."}
{"level":"info","message":"Dispatcher started (dispatch + retry loops)"}
```

### Step 5: Verify System Recovery

Check the UI dashboard - it should show:
- Leader status updated to new scheduler ID
- System continues operating normally
- No jobs were lost

---

## Interview Demo Script

**What to say:**

> "Let me demonstrate automatic leader failover. I have two scheduler instances running - one is the active leader, the other is on standby."

```bash
# Show both schedulers running
ps aux | grep "node scheduler/index.js"
```

> "Scheduler 1 is currently the leader. Watch what happens when I kill it..."

```bash
# Kill the leader
kill -9 <PID>
```

> "Within 10 seconds, Etcd detects the lease expiry, and Scheduler 2 automatically takes over leadership. The system continues operating without any manual intervention."

```bash
# Show new leader
tail logs/scheduler2.log | grep "Became Leader"
```

> "This demonstrates high availability - if the active scheduler crashes, a standby immediately becomes leader. In production, we'd run 3-5 instances across different availability zones."

---

## Why the UI Button Doesn't Work

- API and Scheduler are **separate processes**
- The `/admin/faults/kill-leader` endpoint runs in the **API process**
- Calling `process.exit()` would kill the **API**, not the scheduler
- Manual killing is the correct approach for multi-process demos

---

## Alternative: Single-Process Mode (Not Recommended for Demo)

If you want the UI button to work, run everything in one process:

```bash
./run.sh  # Single scheduler instance
```

But this **doesn't demonstrate leader election** because there's no standby to take over.

---

## Summary

**For Leader Election Demo:**
- Use `./demo-leader-election.sh` (2 schedulers)
- Kill leader manually with `kill -9 <PID>`
- Watch automatic failover in logs

**For Normal Development:**
- Use `./run.sh` (1 scheduler)
- UI buttons work fine for other fault injection (pause queue, disable scheduler)
