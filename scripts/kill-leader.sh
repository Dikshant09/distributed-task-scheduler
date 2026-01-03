#!/bin/bash

# Script to kill the current leader scheduler for testing failover

echo "🔍 Finding current leader scheduler..."

# Get the project root directory (parent of Server/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check scheduler1 log for leader status
if grep -q "I am the leader" "$PROJECT_ROOT/logs/scheduler1.log" 2>/dev/null; then
    LEADER_NUM="1"
elif grep -q "I am the leader" "$PROJECT_ROOT/logs/scheduler2.log" 2>/dev/null; then
    LEADER_NUM="2"
else
    echo "❌ No leader found in logs"
    echo "Checked: $PROJECT_ROOT/logs/scheduler1.log and $PROJECT_ROOT/logs/scheduler2.log"
    exit 1
fi

echo "📍 Leader is Scheduler $LEADER_NUM"

# Find the PID of the leader scheduler
LEADER_PID=$(ps aux | grep "node scheduler/index.js" | grep -v grep | awk 'NR=='$LEADER_NUM' {print $2}')

if [ -z "$LEADER_PID" ]; then
    echo "❌ Could not find leader PID"
    ps aux | grep "node scheduler/index.js" | grep -v grep
    exit 1
fi

echo "💀 Killing leader scheduler (PID: $LEADER_PID)..."
kill -9 $LEADER_PID

if [ $? -eq 0 ]; then
    echo "✅ Leader scheduler killed successfully"
    echo "⏳ Standby should become leader within ~10-15 seconds"
    exit 0
else
    echo "❌ Failed to kill leader"
    exit 1
fi
