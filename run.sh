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

# Kill any existing processes on ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Start backend services in background
echo "🔧 Starting backend services..."
cd Server

npm run dev:api > api.log 2>&1 &
API_PID=$!
echo "  ✅ API started (PID: $API_PID)"

npm run dev:scheduler > scheduler.log 2>&1 &
SCHEDULER_PID=$!
echo "  ✅ Scheduler started (PID: $SCHEDULER_PID)"

npm run dev:worker > worker.log 2>&1 &
WORKER_PID=$!
echo "  ✅ Worker started (PID: $WORKER_PID)"

cd ..

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
sleep 3

# Start frontend
echo "🎨 Starting frontend..."
cd Client
npm run dev > client.log 2>&1 &
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
echo "  - API:       Server/api.log"
echo "  - Scheduler: Server/scheduler.log"
echo "  - Worker:    Server/worker.log"
echo "  - Client:    Client/client.log"
echo ""
echo "To stop all services, run: ./stop.sh"
echo "Or press Ctrl+C and run: pkill -f 'node.*server.js|node.*scheduler|node.*worker|vite'"
