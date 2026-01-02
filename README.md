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

## Architecture
- **API**: Accepts tasks, writes to DB.
- **Scheduler**: Leader watches DB, dispatches to Redis.
- **Worker**: Consumes from Redis, acquires DB lease, executes.

## Verification / Chaos
Run scripts in `scripts/`:
- `./scripts/kill-leader.sh`: Kills active scheduler.
- `./scripts/kill-worker.sh`: Kills random worker.
