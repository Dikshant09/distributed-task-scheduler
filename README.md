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

## Configuration

You can configure the number of scheduler and worker instances using environment variables:

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` to set instance counts:**
   ```bash
   # Instance Configuration
   NUM_SCHEDULERS=3  # Number of scheduler instances (default: 3)
   NUM_WORKERS=5     # Number of worker instances (default: 5)
   ```

3. **Run the system:**
   ```bash
   ./run.sh          # Development mode (with auto-restart)
   # or
   ./run_prod.sh     # Production mode (no auto-restart)
   ```

**Recommendations:**
- **Development**: 2-3 schedulers, 3-5 workers
- **Production**: 3-5 schedulers, 10+ workers (based on load)
- **Minimal**: 2 schedulers, 2 workers (for testing)

The scripts will automatically start the configured number of instances and create separate log files for each.


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
