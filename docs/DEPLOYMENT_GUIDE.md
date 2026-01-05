# Public Demo Deployment Guide

A minimal-cost deployment strategy for the Distributed Task Scheduler as a public, ephemeral, demo-first distributed systems playground.

---

## 🎯 Deployment Philosophy

This deployment is:
- ❌ **NOT** about throughput
- ❌ **NOT** about durability
- ❌ **NOT** about long-term data correctness
- ✅ **ABOUT** visualizing distributed systems behavior
- ✅ **ABOUT** leader election, failure, recovery
- ✅ **ABOUT** interactive learning

**Core Principles:**
- No durable queues
- No long-term storage
- No autoscaling
- Everything restartable
- Session-based ephemeral data

---

## 💰 Cost Breakdown

| Component | Monthly Cost |
|-----------|-------------|
| VM (Azure B1s / AWS t3.micro) | ~$5-8 |
| Storage | ~$1 |
| Bandwidth | ~$0-2 |
| **Total** | **~$7-12/month** |

**Cost Optimization Tips:**
- Shut down when not in use
- Restart before interviews
- No managed database services
- No managed Redis

---

## 🏗️ Architecture: Single VM with Docker Compose

```
┌─────────────────────────────────────────────────────────────┐
│                   Single VM (t3.micro / B1s)                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Docker Compose                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │   API   │  │Scheduler│  │Scheduler│  │ Workers │  │   │
│  │  │  :3000  │  │    1    │  │    2    │  │  (2-3)  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  │        │           │           │           │          │   │
│  │  ┌─────┴───────────┴───────────┴───────────┴─────┐   │   │
│  │  │                Internal Network                │   │   │
│  │  └─────┬───────────────────────────────┬─────────┘   │   │
│  │        │                               │              │   │
│  │  ┌─────▼─────┐                   ┌─────▼─────┐       │   │
│  │  │   Redis   │                   │ PostgreSQL│       │   │
│  │  │ (no AOF)  │                   │(ephemeral)│       │   │
│  │  └───────────┘                   └───────────┘       │   │
│  │        │                               │              │   │
│  │  ┌─────▼─────┐                   ┌─────▼─────┐       │   │
│  │  │   Etcd    │                   │  Frontend │       │   │
│  │  │           │                   │   :5173   │       │   │
│  │  └───────────┘                   └───────────┘       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Docker Compose Configuration

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  # PostgreSQL - Ephemeral (no persistent volume)
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: task_scheduler
    ports:
      - "5432:5432"
    # No volumes = data cleared on restart
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d task_scheduler"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis - No persistence
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly no --save ""
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Etcd - For leader election
  etcd:
    image: bitnami/etcd:latest
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"
      ETCD_ADVERTISE_CLIENT_URLS: "http://etcd:2379"
      ETCD_LISTEN_CLIENT_URLS: "http://0.0.0.0:2379"
    ports:
      - "2379:2379"

  # API Server
  api:
    build:
      context: ./Server
      dockerfile: Dockerfile
    command: node api/server.js
    ports:
      - "3000:3000"
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
      ETCD_HOSTS: http://etcd:2379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      etcd:
        condition: service_started

  # Scheduler 1 (Will become leader)
  scheduler1:
    build:
      context: ./Server
      dockerfile: Dockerfile
    command: node scheduler/index.js
    environment:
      SCHEDULER_ID: scheduler-1
      DB_HOST: postgres
      REDIS_HOST: redis
      ETCD_HOSTS: http://etcd:2379
    depends_on:
      - api

  # Scheduler 2 (Standby)
  scheduler2:
    build:
      context: ./Server
      dockerfile: Dockerfile
    command: node scheduler/index.js
    environment:
      SCHEDULER_ID: scheduler-2
      DB_HOST: postgres
      REDIS_HOST: redis
      ETCD_HOSTS: http://etcd:2379
    depends_on:
      - api

  # Workers (scale with --scale worker=3)
  worker:
    build:
      context: ./Server
      dockerfile: Dockerfile
    command: node worker/index.js
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
    depends_on:
      - api
    deploy:
      replicas: 3

  # Frontend
  frontend:
    build:
      context: ./Client
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - api
```

### Server Dockerfile (`Server/Dockerfile`)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "api/server.js"]
```

### Client Dockerfile (`Client/Dockerfile`)

```dockerfile
# Build stage
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Config (`Client/nginx.conf`)

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests
    location /api/ {
        proxy_pass http://api:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://api:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🚀 Deployment Commands

### Deploy to VM

```bash
# SSH into VM
ssh user@your-vm-ip

# Clone repository
git clone https://github.com/your-username/distributed-task-scheduler.git
cd distributed-task-scheduler

# Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Scale workers
docker-compose up -d --scale worker=5
```

### Reset System

```bash
# Full reset (clears all data)
docker-compose down
docker-compose up -d

# Just restart services (keeps DB schema)
docker-compose restart
```

---

## 🔒 Rate Limiting & Safety

### Prevent Chaos Abuse

Add rate limiting to chaos endpoints in `Server/api/routes/admin.routes.js`:

```javascript
const rateLimit = require('express-rate-limit');

const chaosLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    message: { 
        status: 'error', 
        message: 'Too many chaos requests. Wait 1 minute.' 
    }
});

router.post('/faults/kill-leader', chaosLimiter, adminController.killLeader);
router.post('/faults/kill-worker', chaosLimiter, adminController.killWorker);
```

### Auto-Cleanup Old Tasks

Add a cleanup cron job:

```javascript
// Server/common/cleanup.js
const schedule = require('node-schedule');

// Run every 30 minutes
schedule.scheduleJob('*/30 * * * *', async () => {
    await db.query(`
        DELETE FROM tasks 
        WHERE created_at < NOW() - INTERVAL '30 minutes'
    `);
    console.log('Cleaned up old tasks');
});
```

---

## 🎤 Interview Explanation

### "Why ephemeral data?"

> "This deployment is intentionally ephemeral—it's designed as a distributed systems visualizer, not a production scheduler. The goal is to demonstrate correctness, leader election, and recovery, not durability."

### "Can it scale?"

> "The architecture itself supports production scale; the demo optimizes for cost and clarity. Moving to production would mean RDS, ElastiCache, and ECS Fargate—but that's $150+/month for a demo."

### "What about throughput?"

> "Validated correctness and failure recovery under load, with local benchmarks reaching ~1000 lightweight jobs/sec in controlled environments. The public demo focuses on visualization, not throughput."

---

## 📊 Public Demo Mode Options

### Option 1: Global Shared Sandbox (Recommended)

Everyone sees the same system. Users can kill leaders and workers freely.

**Pros:**
- Zero complexity
- Fun, interactive demo
- Shows real distributed behavior

**Cons:**
- Users can affect each other

### Option 2: Session-Based Isolation

Tag tasks with `session_id`, auto-expire after 15-30 minutes.

```javascript
// Add to task creation
const sessionId = req.headers['x-session-id'] || 'global';
await tasksRepo.createTask({ ...task, session_id: sessionId });
```

More work, but provides isolation.

---

## ✅ Pre-Interview Checklist

Before an interview:

1. **Restart the system**
   ```bash
   docker-compose down && docker-compose up -d
   ```

2. **Verify all services running**
   ```bash
   docker-compose ps
   ```

3. **Test chaos features**
   - Kill leader → verify failover
   - Kill worker → verify task reassignment

4. **Check UI loads**
   - Open `http://your-vm-ip`
   - Verify topology shows correctly

5. **Create test tasks**
   - Submit a few delay tasks
   - Watch them flow through the system

---

## 🎯 Summary

| Aspect | Decision |
|--------|----------|
| **Infrastructure** | Single small VM (~$7-12/mo) |
| **Data** | Ephemeral (cleared on restart) |
| **Persistence** | None (demo focus) |
| **Scaling** | Not needed (demo) |
| **Chaos** | Rate-limited to prevent abuse |
| **Mode** | Global shared sandbox |

**This approach signals:**
- ✅ You understand production vs demo tradeoffs
- ✅ You optimize cost consciously
- ✅ You don't over-engineer
- ✅ You can explain what's missing and why

---

*This is a stronger signal than blindly deploying Kafka + DynamoDB.*
