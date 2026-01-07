# Distributed Task Scheduler

A distributed task scheduler with **real-time visualization** designed as an interactive demo and learning tool for distributed systems concepts.

![System Topology](https://raw.githubusercontent.com/Dikshant09/distributed-task-scheduler/main/docs/assets/topology-preview.png)

> 🎯 **Purpose**: This is an educational visualizer, not a production scheduler. Built to demonstrate leader election, lease-based execution, fault tolerance, and automatic failure recovery—concepts you can see live in the browser.

## ✨ Features

- **🎯 Real-time Visualization** - Interactive system diagram showing schedulers, workers, and task flow (Yellow/Blue balls)
- **👑 Leader Election** - Etcd-based consensus with automatic failover (SRP Architecture)
- **💪 Fault Tolerance** - Worker heartbeats, automatic task reassignment, exponential backoff retry
- **📦 Distributed Queue** - Redis Streams based task delivery with Consumer Groups
- **🔄 Idempotency** - Ensures exactly-once (or at-least-once with dedup) execution
- **🧪 Chaos Engineering** - Built-in failure simulation (Kill Leader, Kill Worker, Pause Queue)
- **📊 Event Timeline** - Real-time system event tracking and visualization
- **🎨 Modern UI** - Dark theme with glassmorphism and smooth animations

## 🏗️ Architecture (SRP)

The system follows the **Single Responsibility Principle (SRP)** by splitting the monolithic scheduler into dedicated microservices:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  API Server  │───▶│   Postgres   │───▶│ Scheduler    │
│  (Ingestion) │    │ Source Truth │    │  Scheduler   │
└──────────────┘    └──────────────┘    └──────────────┘
       │                                        │
       ▼                                        ▼
┌──────────────┐    ┌─────────────┐     ┌──────────────┐
│  Dispatcher  │───▶│ Redis Queue │────▶│    Worker    │
│  (Stateless) │    │ (Streams)   │     │    Pool      │
└──────────────┘    └─────────────┘     └──────────────┘
                                                │
                                                ▼
                                        ┌──────────────┐
                                        │ Recovery Svc │
                                        │ (Monitor)    │
                                        └──────────────┘
```

**Components:**
- **API Server** - Accepts jobs, writes to PostgreSQL, serves WebSocket for real-time UI
- **Scheduler** - Handles leader election via Etcd (only 1 leader active)
- **Dispatcher** - Stateless service that pushes pending tasks from Postgres to Redis
- **Worker** - Consumes tasks from Redis, executes them, and reports status
- **Recovery** - Monitors worker heartbeats and reclaims stalled tasks (Lease mechanism)
- **Cleanup** - Removes expired sessions and old data

### Data Flow

```
User → API → PostgreSQL → Dispatcher → Redis → Worker → PostgreSQL
                ↑                                    ↓
         Scheduler (Leader)                Heartbeat Monitor
         (Leader Election)                  (Recovery Service)
```

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

The easiest way to run the full system (frontend + backend + databases).

#### Prerequisites
- Docker & Docker Compose

#### Development Mode
```bash
# Clone the repository
git clone https://github.com/Dikshant09/distributed-task-scheduler.git
cd distributed-task-scheduler

# Start all services (scales: 3 Schedulers, 5 Workers)
docker compose up -d --scale scheduler=3 --scale worker=5

# Access the dashboard
# http://localhost:5173
```

#### Production Mode
```bash
# Set secure DB password
cp .env.prod.example .env.prod
# Edit .env.prod to set a secure password

# Deploy with production configuration
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --scale scheduler=3 --scale worker=5

# Access via http://localhost (port 80)
```

### Option 2: Local Installation (Manual)

For development without Docker.

#### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis
- Etcd

**Install via Homebrew (macOS):**
```bash
brew install postgresql@15 redis etcd
brew services start postgresql@15
brew services start redis
brew services start etcd
```

#### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/Dikshant09/distributed-task-scheduler.git
   cd distributed-task-scheduler
   cd Server && npm install
   cd ../Client && npm install
   ```

2. **Set up database:**
   ```bash
   createdb -U user task_scheduler
   psql -U user -d task_scheduler -f Server/db/migrations/001_init.sql
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env to match your local setup
   ```

4. **Start services individually:**
   ```bash
   # Terminal 1: API
   cd Server && npm run dev
   
   # Terminal 2: Frontend
   cd Client && npm run dev
   
   # Terminal 3: Scheduler
   node Server/services/scheduler-coordinator/index.js
   
   # Terminal 4: Worker
   node Server/worker/index.js
   ```

5. **Access the UI:**
   - Dashboard: `http://localhost:5173`
   - API: `http://localhost:3000`

---

## 🐳 Deployment

### Docker Compose Architecture

| Service | Image/Build | Port | Purpose |
|---------|------------|------|---------|
| **nginx** | Client/Dockerfile.prod | 80 | Reverse proxy, static files |
| **api** | Server/Dockerfile | 3000 | REST API + WebSocket |
| **scheduler** | Server (scaled) | - | Leader election, coordination |
| **worker** | Server (scaled) | - | Task execution |
| **dispatcher** | Server | - | Task dispatching |
| **recovery** | Server | - | Heartbeat monitoring |
| **cleanup** | Server | - | Session cleanup |
| **postgres** | postgres:15-alpine | 5432 | Task storage |
| **redis** | redis:alpine | 6379 | Queue + Events |
| **etcd** | quay.io/coreos/etcd | 2379 | Leader election |

### Nginx Reverse Proxy

The production setup uses Nginx to:
- Serve the React SPA static files
- Proxy `/api/*` requests to the backend API
- Proxy `/socket.io/*` for WebSocket connections
- Enable gzip compression

**Configuration:** `Client/nginx.conf`

```nginx
# Key routing
location /api/ {
    proxy_pass http://api:3000/;
}

location /socket.io/ {
    proxy_pass http://api:3000/socket.io/;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Cloud Deployment

Comprehensive deployment guides are available for both AWS and Azure:

#### AWS EC2 Deployment
Deploy to AWS EC2 Free Tier (t2.micro - 1 vCPU, 1 GB RAM):
- **Guide**: [AWS Deployment Guide](docs/AWS_DEPLOYMENT_GUIDE.md)
- **Free Tier**: 750 hours/month for 12 months
- **Features**: EC2 Instance Connect, Elastic IP, Route 53 DNS

#### Azure VM Deployment
Deploy to Azure Free Tier (B1S - 1 vCPU, 1 GB RAM):
- **Guide**: [Azure Deployment Guide](docs/AZURE_DEPLOYMENT_GUIDE.md)
- **Free Tier**: 750 hours/month for 12 months + $200 credit for 30 days
- **Features**: Azure Bastion, Static IP, Azure DNS

#### Quick Deployment (Any Linux Server)

```bash
# SSH into your VM
ssh user@your-vm-ip

# Clone and deploy
git clone https://github.com/Dikshant09/distributed-task-scheduler.git
cd distributed-task-scheduler

# Run deployment script
chmod +x deploy.sh
./deploy.sh
```

**What `deploy.sh` does:**
1. Creates `.env.prod` with a random secure password (if not exists)
2. Builds Docker images
3. Starts services with scaling (3 schedulers, 5 workers)
4. Runs health checks
5. Displays access URL

**Useful deployment commands:**
```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart services
docker compose -f docker-compose.prod.yml restart

# Stop all services
docker compose -f docker-compose.prod.yml down

# Scale workers
docker compose -f docker-compose.prod.yml up -d --scale worker=10
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | API server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection | `postgres://...` |
| `REDIS_URL` | Redis connection | `redis://...` |
| `ETCD_HOSTS` | Etcd connection | `http://etcd:2379` |
| `DB_PASSWORD` | Database password (prod) | - |
| `MAX_SESSIONS` | Max concurrent sessions | `50` |
| `LEADER_ELECTION_TTL` | Leader lease TTL (seconds) | `15` |
| `DISPATCH_INTERVAL_MS` | Task dispatch interval | `1000` |
| `MIN_EXECUTION_DELAY_MS` | Artificial delay for demo | `3000` |
| `NUM_SCHEDULERS` | Scheduler instances | `3` |
| `NUM_WORKERS` | Worker instances (max: 5) | `5` |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Development environment |
| `.env.prod` | Production environment |
| `docker-compose.yml` | Development Docker setup |
| `docker-compose.prod.yml` | Production Docker setup |
| `Client/nginx.conf` | Nginx reverse proxy config |

---

## 📁 Data Storage

### Docker Volumes

| Volume | Service | Persistence |
|--------|---------|-------------|
| `pg_data` | PostgreSQL | ✅ Permanent |
| `redis_data` | Redis | ⚠️ Volatile on restart |
| `etcd_data` | Etcd (dev only) | ✅ Permanent |

### Local Storage (macOS with Homebrew)

| Data Type | Storage | Location |
|-----------|---------|----------|
| **Jobs/Tasks** | PostgreSQL | `/opt/homebrew/var/postgresql@15/` |
| **Events** | Redis | `/opt/homebrew/var/db/redis` |
| **Logs** | Files | `Server/logs/*.log` |

> **Note:** Redis events are in-memory and cleared on restart. This is acceptable for demo purposes.

---

## 🧪 Chaos Engineering Controls

The Dashboard includes built-in chaos engineering controls to test system resilience:

| Control | Effect | Recovery |
|---------|--------|----------|
| **❌ Kill Leader** | Crashes the current leader scheduler | New leader elected in ~10-15s |
| **❌ Kill Random Worker** | Crashes a random worker mid-execution | Task reassigned after heartbeat timeout |
| **⏸️ Pause Queue** | Simulates Redis outage (10s) | Resumes automatically |
| **🛑 Disable Scheduler** | Stops new task dispatching | Re-enable via UI |
| **🔄 Reset Instances** | Restarts all killed instances | Immediate |

All actions are logged in the Event Timeline with real-time updates.

---

## 📊 Monitoring

### View Logs

```bash
# Docker (production)
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f scheduler
docker compose -f docker-compose.prod.yml logs -f worker

# Local development
tail -f Server/logs/api.log
tail -f Server/logs/scheduler.log
```

### Check System Status

```bash
# Overall status
curl http://localhost:3000/status | jq

# Active instances (schedulers/workers)
curl http://localhost:3000/instances | jq

# System events
curl http://localhost:3000/events | jq

# Health check
curl http://localhost:3000/health
```

---

## 📁 Project Structure

```
distributed-task-scheduler/
├── Client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Page components
│   │   └── context/           # React context
│   ├── nginx.conf             # Production Nginx config
│   └── Dockerfile.prod        # Frontend production image
├── Server/                    # Node.js microservices
│   ├── api/                   # Express API & WebSocket
│   ├── common/                # Shared utilities
│   ├── db/                    # Database migrations
│   ├── queue/                 # Redis queue utilities
│   ├── services/
│   │   ├── scheduler-coordinator/  # Leader election
│   │   ├── dispatcher/             # Task dispatching
│   │   ├── recovery/               # Lease recovery
│   │   └── worker-monitor/         # Worker health
│   ├── worker/                # Task execution
│   └── Dockerfile             # Backend Docker image
├── docker-compose.yml         # Development setup
├── docker-compose.prod.yml    # Production setup
├── deploy.sh                  # Azure/VM deployment script
└── README.md                  # This file
```

---

## 🎯 Use Cases

- **Demo/Visualizer** - Interactive demonstration of distributed systems concepts
- **Learning Tool** - Understand leader election, fault tolerance, and task scheduling
- **Chaos Testing** - Test resilience and recovery mechanisms
- **Interview Prep** - Explain distributed systems with a working visual example
- **Development** - Foundation for building production task schedulers

---

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! This project demonstrates distributed systems concepts and is ideal for educational purposes or as a foundation for production task schedulers.
