#!/bin/bash

set -e

echo "🚀 Setting up Distributed Task Scheduler (V2 - SRP Architecture)..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install it from https://brew.sh"
    exit 1
fi

echo "✅ Homebrew found"

# Install infrastructure dependencies
echo "📦 Installing infrastructure dependencies (Redis, Etcd, PostgreSQL)..."
brew install redis etcd postgresql@14

# Start services
echo "🔧 Starting infrastructure services..."
brew services start redis
brew services start etcd
brew services start postgresql@14

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to start..."
sleep 3

# Setup PostgreSQL database
echo "🗄️  Setting up PostgreSQL database..."
psql postgres -c "CREATE USER \"user\" WITH PASSWORD 'password';" 2>/dev/null || echo "User already exists"
createdb -O "user" task_scheduler 2>/dev/null || echo "Database already exists"

# Apply migrations
echo "📝 Applying database migrations..."
psql -U "user" -d task_scheduler -f Server/db/migrations/001_init.sql
psql -U "user" -d task_scheduler -f Server/db/migrations/002_add_task_executions.sql

# Create .env symlink in Server directory
echo "🔗 Creating .env symlink..."
cd Server
ln -sf ../.env .env
cd ..

# Install Node.js dependencies
echo "📦 Installing Server dependencies..."
cd Server
npm install
cd ..

echo "📦 Installing Client dependencies..."
cd Client
npm install
cd ..

# Create logs directory
mkdir -p logs

echo ""
echo "✅ Setup complete!"
echo ""
echo "📊 V2 SRP Architecture Services:"
echo "  - Scheduler Coordinator (leader-elected)"
echo "  - Dispatcher (stateless)"
echo "  - Recovery Service (stateless)"
echo "  - Worker Monitor (stateless)"
echo ""
echo "To start the V2 project, run: ./run_v2.sh"
