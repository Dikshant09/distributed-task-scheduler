#!/bin/bash

echo "🛑 Stopping Distributed Task Scheduler (SRP Architecture)..."

# Kill V2 Node.js processes
echo "🔧 Stopping V2 backend services..."
pkill -f "node.*api/server.js" || true
pkill -f "node.*services/scheduler-coordinator" || true
pkill -f "node.*services/dispatcher" || true
pkill -f "node.*services/recovery" || true
pkill -f "node.*services/worker-monitor" || true
pkill -f "node.*worker/index.js" || true
echo "  ✅ V2 backend services stopped"

# Also kill legacy scheduler if running
pkill -f "node.*scheduler/index.js" || true

# Kill Vite process
echo "🎨 Stopping frontend..."
pkill -f "vite" || true
echo "  ✅ Frontend stopped"

# Kill any processes on ports
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Clean up database tables
echo "🧹 Cleaning up database..."
psql -U user -d task_scheduler -c "DELETE FROM workers;" > /dev/null 2>&1 || true
psql -U user -d task_scheduler -c "DELETE FROM process_instances;" > /dev/null 2>&1 || true
echo "  ✅ Database cleaned"

echo ""
echo "✅ All V2 services stopped!"
echo ""
echo "Infrastructure services (Redis, Etcd, PostgreSQL) are still running."
echo "To stop them, run:"
echo "  brew services stop redis"
echo "  brew services stop etcd"
echo "  brew services stop postgresql@14"
