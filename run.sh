#!/bin/bash

set -e

echo "🚀 Starting Distributed Task Scheduler..."

# Load environment variables from .env if it exists
if [ -f .env ]; then
    # Export variables, filtering out comments and empty lines
    set -a
    source <(grep -v '^#' .env | grep -v '^$' | sed 's/#.*//')
    set +a
fi

# Set defaults if not provided
NUM_SCHEDULERS=${NUM_SCHEDULERS:-3}
NUM_WORKERS=${NUM_WORKERS:-5}

# Enforce maximum limits
if [ "$NUM_WORKERS" -gt 5 ]; then
    echo "⚠️  Warning: NUM_WORKERS capped at 5 (you specified $NUM_WORKERS)"
    NUM_WORKERS=5
fi

echo "📊 Configuration:"
echo "  - Schedulers: $NUM_SCHEDULERS"
echo "  - Workers:    $NUM_WORKERS"
echo ""

# Check if infrastructure services are running
echo "🔍 Checking infrastructure services..."

if ! brew services list | grep -q "redis.*started"; then
    echo "⚠️  Redis not running. Starting..."
    brew services start redis
fi

if ! brew services list | grep -q "etcd.*started"; then
    echo "⚠️  Etcd not running. Starting..."
    brew services start etcd
fi

if ! brew services list | grep -q "postgresql@14.*started"; then
    echo "⚠️  PostgreSQL not running. Starting..."
    brew services start postgresql@14
    sleep 2
fi

echo "✅ Infrastructure services are running"

# Clean up stale workers from previous runs
echo "🧹 Cleaning up stale workers..."
psql -U user -d task_scheduler -c "DELETE FROM workers WHERE last_heartbeat < NOW() - INTERVAL '1 minute';" > /dev/null 2>&1 || true

# Clean up stale process instances
psql -U user -d task_scheduler -c "DELETE FROM process_instances;" > /dev/null 2>&1 || true

# Clean up event logs from Redis
echo "🧹 Cleaning up event logs..."
redis-cli DEL system:events > /dev/null 2>&1 || true

# Ensure scheduler is enabled by default
echo "🔧 Ensuring scheduler is enabled..."
rm -f .scheduler-state.json
echo '{"enabled":true}' > .scheduler-state.json

# Kill any existing processes on ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Start backend services in background
echo "🔧 Starting backend services..."
cd Server

npm run dev:api > ../logs/api.log 2>&1 &
API_PID=$!
echo "  ✅ API started (PID: $API_PID)"

# Start scheduler instances dynamically
echo "🗓️  Starting $NUM_SCHEDULERS scheduler instance(s)..."
SCHEDULER_PIDS=()
for i in $(seq 1 $NUM_SCHEDULERS); do
    node scheduler/index.js > ../logs/scheduler$i.log 2>&1 &
    PID=$!
    SCHEDULER_PIDS+=($PID)
    echo "  ✅ Scheduler $i started (PID: $PID)"
    [ $i -lt $NUM_SCHEDULERS ] && sleep 2
done

# Start worker instances dynamically
echo "👷 Starting $NUM_WORKERS worker instance(s)..."
WORKER_PIDS=()
for i in $(seq 1 $NUM_WORKERS); do
    npm run dev:worker > ../logs/worker$i.log 2>&1 &
    PID=$!
    WORKER_PIDS+=($PID)
    echo "  ✅ Worker $i started (PID: $PID)"
done

cd ..

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
sleep 3

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
echo "  - Schedulers: $NUM_SCHEDULERS (1 leader, $((NUM_SCHEDULERS-1)) standby)"
echo "  - Workers:    $NUM_WORKERS"
echo ""
echo "📝 Logs available at:"
echo "  - API:         logs/api.log"
for i in $(seq 1 $NUM_SCHEDULERS); do
    echo "  - Scheduler $i: logs/scheduler$i.log"
done
for i in $(seq 1 $NUM_WORKERS); do
    echo "  - Worker $i:    logs/worker$i.log"
done
echo "  - Client:      logs/client.log"
echo ""
echo "💡 Check leader status:"
echo "   curl http://localhost:3000/instances | jq '.data.schedulers'"
echo ""
echo "To stop all services, run: ./stop.sh"
echo "Or press Ctrl+C and run: pkill -f 'node.*server.js|node.*scheduler|node.*worker|vite'"

