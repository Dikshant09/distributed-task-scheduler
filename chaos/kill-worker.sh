#!/bin/bash

# =============================================================================
# CHAOS TEST: Kill Worker (Mid-task)
# =============================================================================
# Purpose: Test worker failure recovery and lease-based execution
# Expected: Lease expires, task marked FAILED, retry scheduled, another worker picks it
# Interview Signal: "Lease-based execution ensures exactly-once semantics"
# =============================================================================

echo "🔥 CHAOS TEST: Kill Worker (Mid-task)"
echo "======================================"

WORKER_ID=${1:-""}  # Optional: specific worker ID

if [ -n "$WORKER_ID" ]; then
    echo "Killing specific worker: $WORKER_ID"
    PAYLOAD="{\"workerId\": \"$WORKER_ID\"}"
else
    echo "Killing random worker..."
    PAYLOAD="{}"
fi

# Use API to kill worker
RESPONSE=$(curl -s -X POST http://localhost:3000/admin/faults/kill-worker \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ Worker killed successfully"
    echo ""
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "⏳ Expected behavior:"
    echo "   1. Worker stops sending heartbeat"
    echo "   2. Lease expires (~30s)"
    echo "   3. Task marked FAILED"
    echo "   4. Retry scheduled (if max attempts not exceeded)"
    echo "   5. Another worker picks up the task"
    echo ""
    echo "📝 Watch logs:"
    echo "   tail -f logs/recovery.log | grep -E 'lease|retry|reap'"
else
    echo "❌ Failed to kill worker"
    echo "$RESPONSE"
    
    # Fallback: Try to find and kill worker process directly
    echo ""
    echo "Attempting direct process kill..."
    
    WORKER_PID=$(ps aux | grep "node worker/index.js" | grep -v grep | head -1 | awk '{print $2}')
    
    if [ -n "$WORKER_PID" ]; then
        echo "Found worker PID: $WORKER_PID"
        kill -9 $WORKER_PID
        echo "✅ Killed worker process"
    else
        echo "❌ No worker process found"
        exit 1
    fi
fi
