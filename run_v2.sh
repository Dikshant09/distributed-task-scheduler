#!/bin/bash

set -e

echo "🚀 Starting Distributed Task Scheduler (V2 - SRP Architecture)..."

# Load environment variables from .env if it exists
if [ -f .env ]; then
    set -a
    source <(grep -v '^#' .env | grep -v '^$' | sed 's/#.*//')
    set +a
fi

# Set defaults if not provided
NUM_COORDINATORS=${NUM_COORDINATORS:-3}
NUM_WORKERS=${NUM_WORKERS:-5}

# Enforce maximum limits
if [ "$NUM_WORKERS" -gt 5 ]; then
    echo "⚠️  Warning: NUM_WORKERS capped at 5 (you specified $NUM_WORKERS)"
    NUM_WORKERS=5
fi

echo "📊 Configuration (V2 SRP Architecture):"
echo "  - Scheduler Coordinators: $NUM_COORDINATORS (1 leader, $((NUM_COORDINATORS-1)) standby)"
echo "  - Dispatchers:            1 (stateless)"
echo "  - Recovery Services:      1 (stateless)"
echo "  - Worker Monitors:        1 (stateless)"
echo "  - Workers:                $NUM_WORKERS"
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
echo "🧹 Cleaning up stale data..."
psql -U user -d task_scheduler -c "DELETE FROM workers WHERE last_heartbeat < NOW() - INTERVAL '1 minute';" > /dev/null 2>&1 || true
psql -U user -d task_scheduler -c "DELETE FROM process_instances;" > /dev/null 2>&1 || true
redis-cli DEL system:events > /dev/null 2>&1 || true

# Ensure scheduler is enabled by default
echo "🔧 Ensuring scheduler is enabled..."
rm -f .scheduler-state.json
echo '{"enabled":true}' > .scheduler-state.json

# Kill any existing processes on ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Create logs directory
mkdir -p logs

# Start backend services
echo "🔧 Starting backend services..."
cd Server

# Start API
npm run dev:api > ../logs/api.log 2>&1 &
API_PID=$!
echo "  ✅ API started (PID: $API_PID)"

# Start Scheduler Coordinators (leader-elected)
echo "⚡ Starting $NUM_COORDINATORS Scheduler Coordinator(s)..."
COORDINATOR_PIDS=()
for i in $(seq 1 $NUM_COORDINATORS); do
    node services/scheduler-coordinator/index.js > ../logs/coordinator$i.log 2>&1 &
    PID=$!
    COORDINATOR_PIDS+=($PID)
    echo "  ✅ Coordinator $i started (PID: $PID)"
    [ $i -lt $NUM_COORDINATORS ] && sleep 2
done

# Start Dispatcher (stateless - single instance)
echo "📤 Starting Dispatcher..."
node services/dispatcher/index.js > ../logs/dispatcher.log 2>&1 &
DISPATCHER_PID=$!
echo "  ✅ Dispatcher started (PID: $DISPATCHER_PID)"

# Start Recovery Service (stateless - single instance)
echo "🔄 Starting Recovery Service..."
node services/recovery/index.js > ../logs/recovery.log 2>&1 &
RECOVERY_PID=$!
echo "  ✅ Recovery Service started (PID: $RECOVERY_PID)"

# Start Worker Monitor (stateless - single instance)
echo "👁️  Starting Worker Monitor..."
node services/worker-monitor/index.js > ../logs/monitor.log 2>&1 &
MONITOR_PID=$!
echo "  ✅ Worker Monitor started (PID: $MONITOR_PID)"

# Start Workers
echo "👷 Starting $NUM_WORKERS worker(s)..."
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
echo "✅ All V2 services started successfully!"
echo ""
echo "📊 Service URLs:"
echo "  - Client:    http://localhost:5173"
echo "  - API:       http://localhost:3000"
echo ""
echo "📊 V2 SRP Architecture:"
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  Scheduler Coordinators: $NUM_COORDINATORS (1 leader, $((NUM_COORDINATORS-1)) standby)           │"
echo "  │  Dispatcher:             1 (stateless, READY → Redis)       │"
echo "  │  Recovery Service:       1 (retries, DLQ, lease reaper)     │"
echo "  │  Worker Monitor:         1 (heartbeat checking)             │"
echo "  │  Workers:                $NUM_WORKERS                                     │"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""
echo "📝 Logs available at:"
echo "  - API:        logs/api.log"
for i in $(seq 1 $NUM_COORDINATORS); do
    echo "  - Coordinator $i: logs/coordinator$i.log"
done
echo "  - Dispatcher: logs/dispatcher.log"
echo "  - Recovery:   logs/recovery.log"
echo "  - Monitor:    logs/monitor.log"
for i in $(seq 1 $NUM_WORKERS); do
    echo "  - Worker $i:    logs/worker$i.log"
done
echo "  - Client:     logs/client.log"
echo ""
echo "💡 Check leader status:"
echo "   curl http://localhost:3000/instances | jq '.data.schedulers'"
echo ""
echo "To stop all services, run: ./stop_v2.sh"
