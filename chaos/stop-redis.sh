#!/bin/bash

# =============================================================================
# CHAOS TEST: Stop/Restart Redis
# =============================================================================
# Purpose: Test Redis failure and recovery
# Expected: Workers fail temporarily, system recovers after Redis restart
# Interview Signal: "Redis is not the source of truth; Postgres is."
# =============================================================================

echo "🔥 CHAOS TEST: Stop/Restart Redis"
echo "==================================="

DOWNTIME=${1:-10}  # Default 10 seconds

echo "⚠️  This will stop Redis for ${DOWNTIME} seconds"
echo "   Press Ctrl+C within 3 seconds to cancel..."
sleep 3

echo ""
echo "📍 Step 1: Stopping Redis..."
brew services stop redis

if [ $? -eq 0 ]; then
    echo "✅ Redis stopped"
else
    echo "❌ Failed to stop Redis (may require sudo)"
    exit 1
fi

echo ""
echo "⏳ Waiting ${DOWNTIME} seconds..."
echo ""
echo "   Expected behavior during downtime:"
echo "   - Workers fail to fetch tasks"
echo "   - Dispatcher fails to push tasks"
echo "   - Scheduler doesn't crash"
echo "   - DB still has task state (source of truth)"
echo ""

# Countdown
for i in $(seq $DOWNTIME -1 1); do
    echo -ne "\r   Resuming in $i seconds... "
    sleep 1
done
echo ""

echo ""
echo "📍 Step 2: Starting Redis..."
brew services start redis

if [ $? -eq 0 ]; then
    echo "✅ Redis restarted"
else
    echo "❌ Failed to start Redis"
    exit 1
fi

echo ""
echo "⏳ Expected behavior after restart:"
echo "   - Workers reconnect automatically"
echo "   - Dispatcher resumes pushing tasks"
echo "   - Pending READY tasks get dispatched"
echo "   - System fully recovers"
echo ""
echo "📝 Watch logs:"
echo "   tail -f logs/dispatcher.log logs/worker*.log | grep -E 'error|connect|resume'"
