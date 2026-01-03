#!/bin/bash

# Production-like run script (no auto-restart via nodemon)
# Workers stay dead when killed - demonstrates true fault tolerance

set -e

echo "🚀 Starting Distributed Task Scheduler (Production Mode)..."

# Check if infrastructure services are running
echo "🔍 Checking infrastructure services..."
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Start it with: brew services start redis"
    exit 1
fi

if ! etcdctl endpoint health > /dev/null 2>&1 && ! curl -s http://localhost:2379/health > /dev/null 2>&1; then
    echo "❌ Etcd is not running. Start it with: brew services start etcd"
    exit 1
fi

if ! psql -U user -d task_scheduler -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Start it with: brew services start postgresql@14"
    exit 1
fi

echo "✅ Infrastructure services are running"

# Clean up stale workers
echo "🧹 Cleaning up stale workers..."
psql -U user -d task_scheduler -c "DELETE FROM workers WHERE last_heartbeat < NOW() - INTERVAL '1 minute';" > /dev/null 2>&1 || true

# Clean up stale process instances
psql -U user -d task_scheduler -c "DELETE FROM process_instances;" > /dev/null 2>&1 || true

# Clean up event logs from Redis
echo "🧹 Cleaning up event logs..."
redis-cli DEL system:events > /dev/null 2>&1 || true
redis-cli DEL scheduler:failed_workers > /dev/null 2>&1 || true

# Ensure scheduler is enabled by default
echo "🔧 Ensuring scheduler is enabled..."
cat > .scheduler-state.json << EOF
{
  "enabled": true,
  "lastModified": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
}
EOF

# Clean up any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f 'node.*server.js' 2>/dev/null || true
pkill -f 'node.*scheduler' 2>/dev/null || true
pkill -f 'node.*worker' 2>/dev/null || true
pkill -f 'vite' 2>/dev/null || true
sleep 2

cd Server

# Start backend services (PRODUCTION MODE - NO NODEMON)
echo "🔧 Starting backend services (production mode - no auto-restart)..."

# Start API
node api/server.js > ../logs/api.log 2>&1 &
API_PID=$!
echo "  ✅ API started (PID: $API_PID)"

sleep 2

# Start 2 scheduler instances
node scheduler/index.js > ../logs/scheduler1.log 2>&1 &
SCHEDULER1_PID=$!
echo "  ✅ Scheduler 1 started (PID: $SCHEDULER1_PID)"

sleep 2

node scheduler/index.js > ../logs/scheduler2.log 2>&1 &
SCHEDULER2_PID=$!
echo "  ✅ Scheduler 2 started (PID: $SCHEDULER2_PID)"

# Start 3 worker instances (NO NODEMON - WORKERS STAY DEAD WHEN KILLED)
node worker/index.js > ../logs/worker1.log 2>&1 &
WORKER1_PID=$!
echo "  ✅ Worker 1 started (PID: $WORKER1_PID)"

node worker/index.js > ../logs/worker2.log 2>&1 &
WORKER2_PID=$!
echo "  ✅ Worker 2 started (PID: $WORKER2_PID)"

node worker/index.js > ../logs/worker3.log 2>&1 &
WORKER3_PID=$!
echo "  ✅ Worker 3 started (PID: $WORKER3_PID)"

cd ..

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Start frontend
echo "🎨 Starting frontend..."
cd Client
npm run dev > ../logs/client.log 2>&1 &
CLIENT_PID=$!
echo "  ✅ Client started (PID: $CLIENT_PID)"
cd ..

echo ""
echo "✅ All services started successfully!"
echo ""
echo "📊 Service URLs:"
echo "  - Client:    http://localhost:5173"
echo "  - API:       http://localhost:3000"
echo ""
echo "📊 System Configuration:"
echo "  - Schedulers: 2 (1 leader, 1 standby)"
echo "  - Workers:    3"
echo "  - Mode:       PRODUCTION (no auto-restart)"
echo ""
echo "📝 Logs available at:"
echo "  - API:         logs/api.log"
echo "  - Scheduler 1: logs/scheduler1.log"
echo "  - Scheduler 2: logs/scheduler2.log"
echo "  - Worker 1:    logs/worker1.log"
echo "  - Worker 2:    logs/worker2.log"
echo "  - Worker 3:    logs/worker3.log"
echo "  - Client:      logs/client.log"
echo ""
echo "💡 Check leader status:"
echo "   curl http://localhost:3000/instances | jq '.data.schedulers'"
echo ""
echo "⚠️  PRODUCTION MODE:"
echo "   - Killed workers will NOT auto-restart"
echo "   - Demonstrates true fault tolerance"
echo "   - Use ./stop.sh to stop all services"
echo ""
