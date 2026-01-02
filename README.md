# Distributed Task Scheduler

A fault-tolerant distributed task scheduler built with Node.js, React, PostgreSQL, Redis, and Etcd.

## Features
- **Leader Election**: Etcd-based consensus.
- **Fault Tolerance**: Worker heartbeats, automatic task reassignment, retry exponential backoff.
- **Distributed Queue**: Redis Streams for task delivery.
- **Idempotency**: Ensures exactly-once (or at-least-once with dedup) execution.

## Prerequisities
- Docker & Docker Compose
- Node.js (for local dev)

## Quick Start
1. Start Infrastructure & Services:
   ```bash
   docker-compose up --build --scale worker=3 --scale scheduler=3
   ```
2. Start Client (Local):
   ```bash
   cd Client
   npm install
   npm run dev
   ```
3. Open Dashboard at `http://localhost:5173`.

```bash
./run.sh
```

Access the UI at `http://localhost:5173`

### Leader Election Failover Demo

To demonstrate leader election and automatic failover:

```bash
# Stop normal services
./stop.sh

# Start with 2 scheduler instances
./demo-leader-election.sh
```

**What this does:**
- Starts 2 scheduler instances (one leader, one standby)
- When you click "Kill Leader" in the UI, the standby automatically becomes leader
- System continues operating without interruption

**Check leader status:**
```bash
tail -f logs/scheduler1.log | grep -i leader
tail -f logs/scheduler2.log | grep -i leader
```

See [docs/LEADER_ELECTION_DEMO.md](docs/LEADER_ELECTION_DEMO.md) for details.

## Stop Services

```bash
./stop.sh
```

## Architecture
- **API**: Accepts tasks, writes to DB.
- **Scheduler**: Leader watches DB, dispatches to Redis.
- **Worker**: Consumes from Redis, acquires DB lease, executes.

## Verification / Chaos
Run scripts in `scripts/`:
- `./scripts/kill-leader.sh`: Kills active scheduler.
- `./scripts/kill-worker.sh`: Kills random worker.
