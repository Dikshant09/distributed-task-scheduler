# Distributed Task Scheduler

A distributed task scheduler with **real-time visualization** designed as an interactive demo and learning tool for distributed systems concepts.

> 🎯 **Purpose**: This is an educational visualizer, not a production scheduler. Built to demonstrate leader election, lease-based execution, fault tolerance, and automatic failure recovery—concepts you can see live in the browser.

## ✨ Features

- **🎯 Real-time Topology Visualization** - Interactive system diagram showing schedulers, workers, and task flow
- **👑 Leader Election** - Etcd-based consensus with automatic failover
- **💪 Fault Tolerance** - Worker heartbeats, automatic task reassignment, exponential backoff retry
- **📦 Distributed Queue** - Redis-based task delivery with guaranteed processing
- **🔄 Idempotency** - Ensures exactly-once (or at-least-once with dedup) execution
- **🧪 Chaos Engineering** - Built-in failure simulation for testing resilience
- **📊 Event Timeline** - Real-time system event tracking and visualization
- **🎨 Modern UI** - Dark theme with glassmorphism and smooth animations

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- PostgreSQL 14
- Redis
- Etcd

Install via Homebrew (macOS):
```bash
brew install postgresql@14 redis etcd
brew services start postgresql@14
brew services start redis
brew services start etcd
```

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd distributed-task-scheduler
   cd Server && npm install
   cd ../Client && npm install
   ```

2. **Set up database:**
   ```bash
   createdb -U user task_scheduler
   psql -U user -d task_scheduler -f Server/db/schema.sql
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env to customize instance counts (optional)
   ```

4. **Start the system:**
   ```bash
   ./run.sh
   ```

5. **Access the UI:**
   - Dashboard: `http://localhost:5173`
   - API: `http://localhost:3000`

## ⚙️ Configuration

Configure the number of scheduler and worker instances via `.env`:

```bash
# Instance Configuration
NUM_SCHEDULERS=3  # Number of scheduler instances (default: 3)
NUM_WORKERS=5     # Number of worker instances (max: 5, enforced)
```

**Run modes:**
```bash
./run.sh          # Development mode (with auto-restart)
./run_prod.sh     # Production mode (no auto-restart, true fault tolerance)
```

**Recommendations:**
- **Development**: 2-3 schedulers, 3-5 workers
- **Production**: 3-5 schedulers, 5 workers (hard cap)
- **Minimal**: 2 schedulers, 2 workers (for testing)

## 📁 Data Storage

### Local Storage Locations (macOS with Homebrew):

| Data Type | Storage | Location | Size | Persistence |
|-----------|---------|----------|------|-------------|
| **Jobs/Tasks** | PostgreSQL | `/opt/homebrew/var/postgresql@14/` | ~67MB | ✅ Permanent |
| **Workers** | PostgreSQL | `/opt/homebrew/var/postgresql@14/` | ~67MB | ✅ Permanent |
| **Events** | Redis | `/opt/homebrew/var/db/redis` | ~24KB | ⚠️ Volatile* |
| **Queue** | Redis | `/opt/homebrew/var/db/redis` | ~24KB | ⚠️ Volatile* |
| **Scheduler State** | File | `.scheduler-state.json` | <1KB | ✅ Permanent |
| **Logs** | Files | `logs/*.log` | Varies | ✅ Permanent |

*Redis data is in-memory by default. Events are cleared on restart, which is acceptable for demo/development use.

### Check Data Sizes:
```bash
du -sh /opt/homebrew/var/postgresql@14/  # PostgreSQL
du -sh /opt/homebrew/var/db/redis        # Redis
```

## 🧪 Failure Simulation

The Dashboard includes built-in chaos engineering controls:

- **❌ Kill Leader** - Triggers leader election and failover
- **❌ Kill Random Worker** - Tests task reassignment
- **⏸️ Pause Queue** - Simulates Redis outage (10s)
- **🛑 Disable Scheduler** - Stops task dispatching

All actions are logged in the Event Timeline with real-time updates.

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│    Redis    │────▶│   Worker    │
│  (Leader)   │     │    Queue    │     │  (Pool)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                        │
       ▼                                        ▼
┌─────────────┐                        ┌─────────────┐
│ PostgreSQL  │◀───────────────────────│  Heartbeat  │
│  (Tasks)    │                        │  Monitor    │
└─────────────┘                        └─────────────┘
```

**Components:**
- **API Server** - Accepts jobs, writes to PostgreSQL
- **Scheduler** - Leader watches DB, dispatches tasks to Redis queue
- **Worker Pool** - Consumes from Redis, acquires DB lease, executes tasks
- **Heartbeat Monitor** - Tracks worker health, triggers reassignment on failure

## 🛑 Stop Services

```bash
./stop.sh
```

Or manually:
```bash
pkill -f 'node.*server.js|node.*scheduler|node.*worker|vite'
```

## 📊 Monitoring

**View logs:**
```bash
tail -f logs/api.log
tail -f logs/scheduler1.log
tail -f logs/worker1.log
```

**Check system status:**
```bash
curl http://localhost:3000/instances | jq
curl http://localhost:3000/status | jq
```

**View events:**
```bash
curl http://localhost:3000/events | jq
```

## 🎯 Use Cases

- **Demo/Visualizer** - Interactive demonstration of distributed systems concepts
- **Learning Tool** - Understand leader election, fault tolerance, and task scheduling
- **Chaos Testing** - Test resilience and recovery mechanisms
- **Development** - Build and test distributed task processing systems

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! This project demonstrates distributed systems concepts and is ideal for educational purposes or as a foundation for production task schedulers.
