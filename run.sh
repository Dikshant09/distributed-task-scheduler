#!/bin/bash

set -e

echo "🚀 Starting Distributed Task Scheduler..."

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

# Start 2 scheduler instances for leader election
node scheduler/index.js > ../logs/scheduler1.log 2>&1 &
SCHEDULER1_PID=$!
echo "  ✅ Scheduler 1 started (PID: $SCHEDULER1_PID)"

sleep 2

node scheduler/index.js > ../logs/scheduler2.log 2>&1 &
SCHEDULER2_PID=$!
echo "  ✅ Scheduler 2 started (PID: $SCHEDULER2_PID)"

# Start 3 worker instances
npm run dev:worker > ../logs/worker1.log 2>&1 &
WORKER1_PID=$!
echo "  ✅ Worker 1 started (PID: $WORKER1_PID)"

npm run dev:worker > ../logs/worker2.log 2>&1 &
WORKER2_PID=$!
echo "  ✅ Worker 2 started (PID: $WORKER2_PID)"

npm run dev:worker > ../logs/worker3.log 2>&1 &
WORKER3_PID=$!
echo "  ✅ Worker 3 started (PID: $WORKER3_PID)"

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
echo "  - Schedulers: 2 (1 leader, 1 standby)"
echo "  - Workers:    3"
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
echo "To stop all services, run: ./stop.sh"
echo "Or press Ctrl+C and run: pkill -f 'node.*server.js|node.*scheduler|node.*worker|vite'"

