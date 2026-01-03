#!/bin/bash

set -e

echo "🎯 Starting Leader Election Failover Demo..."
echo ""
echo "This will start 2 scheduler instances to demonstrate leader election."
echo "One will become leader, the other will be standby."
echo ""

# Check if infrastructure is running
if ! brew services list | grep -q "redis.*started"; then
    echo "❌ Redis is not running. Please run: brew services start redis"
    exit 1
fi

if ! brew services list | grep -q "etcd.*started"; then
    echo "❌ Etcd is not running. Please run: brew services start etcd"
    exit 1
fi

if ! brew services list | grep -q "postgresql@14.*started"; then
    echo "❌ PostgreSQL is not running. Please run: brew services start postgresql@14"
    exit 1
fi

echo "✅ Infrastructure services are running"
echo ""

# Start API
echo "🔧 Starting API..."
cd Server
npm run dev:api > ../logs/api.log 2>&1 &
API_PID=$!
echo "  ✅ API started (PID: $API_PID)"

# Start Scheduler Instance 1
echo "🔧 Starting Scheduler Instance 1..."
node scheduler/index.js > ../logs/scheduler1.log 2>&1 &
SCHEDULER1_PID=$!
echo "  ✅ Scheduler 1 started (PID: $SCHEDULER1_PID)"

# Wait a bit for first scheduler to campaign
sleep 3

# Start Scheduler Instance 2
echo "🔧 Starting Scheduler Instance 2..."
node scheduler/index.js > ../logs/scheduler2.log 2>&1 &
SCHEDULER2_PID=$!
echo "  ✅ Scheduler 2 started (PID: $SCHEDULER2_PID)"

# Start 3 Workers
echo "🔧 Starting Workers..."
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

# Start Client
echo "🎨 Starting Client..."
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
echo "📝 Logs available at:"
echo "  - API:         logs/api.log"
echo "  - Scheduler 1: logs/scheduler1.log"
echo "  - Scheduler 2: logs/scheduler2.log"
echo "  - Worker 1:    logs/worker1.log"
echo "  - Worker 2:    logs/worker2.log"
echo "  - Worker 3:    logs/worker3.log"
echo "  - Client:      logs/client.log"
echo ""
echo "🎯 Leader Election Demo:"
echo "  1. Check which scheduler is leader:"
echo "     curl http://localhost:3000/instances | jq '.data.schedulers'"
echo ""
echo "  2. Kill the leader via UI button or:"
echo "     curl -X POST http://localhost:3000/admin/faults/kill-leader"
echo ""
echo "  3. Watch the standby become leader:"
echo "     tail -f logs/scheduler*.log | grep -i 'became leader'"
echo ""
echo "To stop all services, run: ./stop.sh"

