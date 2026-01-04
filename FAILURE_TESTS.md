# Failure Tests Documentation

This document records chaos testing results for the Distributed Task Scheduler.

---

## 1️⃣ Scheduler / Leader Failure ✅

### How to Simulate
```bash
./chaos/kill-leader.sh
```

### Expected Behavior
| Step | Expected |
|------|----------|
| 1 | etcd lease expires (~10-15s) |
| 2 | Standby scheduler becomes leader |
| 3 | No duplicate scheduling |
| 4 | Tasks continue execution |

### Logs to Watch
```bash
tail -f logs/coordinator*.log | grep -E 'leader|elected|lost'
```

### Expected Log Output
```
Leader lost → entering STANDBY
New leader elected → resuming scheduling
```

### Actual Observed Behavior
> _Fill in after testing_

### Interview Signal
> "I validated leader failover using etcd leases."

---

## 2️⃣ Worker Failure (Mid-task) ✅

### How to Simulate
```bash
# Kill random worker
./chaos/kill-worker.sh

# Kill specific worker
./chaos/kill-worker.sh worker-abc123
```

### Expected Behavior
| Step | Expected |
|------|----------|
| 1 | Worker stops sending heartbeat |
| 2 | Lease expires (~30s) |
| 3 | Task marked FAILED |
| 4 | Retry scheduled |
| 5 | Another worker picks it up |

### Logs to Watch
```bash
tail -f logs/recovery.log | grep -E 'lease|retry|reap'
```

### Actual Observed Behavior
> _Fill in after testing_

### Interview Signal
> "Lease-based execution ensures exactly-once semantics."

---

## 3️⃣ Redis Failure / Restart ⚠️

### How to Simulate
```bash
./chaos/stop-redis.sh 10  # Stop for 10 seconds
```

### Expected Behavior
| During Downtime | After Recovery |
|-----------------|----------------|
| Workers fail to fetch tasks | Workers reconnect |
| Dispatcher fails to push | Dispatcher resumes |
| Scheduler doesn't crash | Tasks dispatched in burst |
| DB still has state | Full recovery |

### Logs to Watch
```bash
tail -f logs/dispatcher.log logs/worker*.log | grep -E 'error|connect|resume'
```

### Actual Observed Behavior
> _Fill in after testing_

### Interview Signal
> "Redis is not the source of truth; Postgres is."

---

## 4️⃣ Network Delay Simulation ⚠️

### How to Simulate
```bash
./chaos/network-delay.sh 10000  # 10 second delay
```

### Expected Behavior
| Step | Expected |
|------|----------|
| 1 | Coordinator continues (PENDING → READY) |
| 2 | Dispatcher paused (simulates delay) |
| 3 | Tasks accumulate in READY state |
| 4 | After delay, tasks dispatched in burst |

### Logs to Watch
```bash
tail -f logs/coordinator*.log logs/dispatcher.log
```

### Actual Observed Behavior
> _Fill in after testing_

---

## 5️⃣ DB Failure (Limited) ⚠️

### What We Simulate
- DB unavailable for short duration
- DB connection timeout
- Read-only mode

### What We DON'T Simulate
- Total data loss
- Multi-region DB failover (out of scope)

### Expected Behavior
- API returns 503
- Workers pause execution
- System recovers when DB returns

### Interview Signal
> "Strong correctness requires DB availability; we prioritize correctness over availability."

---

## Failures NOT Simulated

| Failure | Why Not |
|---------|---------|
| Disk corruption | Infra-level |
| Byzantine failures | Overkill |
| Multi-region split brain | Not needed |
| Kernel crashes | Out of scope |

> Interviewers respect boundaries.

---

## chaos/ Folder Structure

```
chaos/
├── kill-leader.sh      # Leader failover test
├── kill-worker.sh      # Worker failure test
├── stop-redis.sh       # Redis failure test
└── network-delay.sh    # Network delay simulation
```

---

## Running All Chaos Tests

```bash
# 1. Start system
./run_v2.sh

# 2. Create some test tasks
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"HTTP","payload":{"url":"https://httpbin.org/delay/5"}}'

# 3. Run chaos tests one by one
./chaos/kill-leader.sh
./chaos/kill-worker.sh
./chaos/stop-redis.sh 10
./chaos/network-delay.sh 5000
```
