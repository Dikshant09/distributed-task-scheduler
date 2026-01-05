#!/bin/bash

# =============================================================================
# CHAOS TEST: Kill Leader Scheduler
# =============================================================================
# Purpose: Test leader failover using etcd leases
# Expected: Standby scheduler becomes leader within 10-15 seconds
# Interview Signal: "I validated leader failover using etcd leases."
# =============================================================================

echo "🔥 CHAOS TEST: Kill Leader Scheduler"
echo "===================================="

# Use API to kill leader (works with both V1 and V2 architectures)
RESPONSE=$(curl -s -X POST http://localhost:3000/admin/faults/kill-leader)

if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ Leader killed successfully"
    echo ""
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "⏳ Expected behavior:"
    echo "   1. etcd lease expires (~10-15s)"
    echo "   2. Standby scheduler becomes leader"
    echo "   3. No duplicate scheduling"
    echo "   4. Tasks continue execution"
    echo ""
    echo "📝 Watch logs:"
    echo "   tail -f logs/coordinator*.log | grep -E 'leader|elected|lost'"
else
    echo "❌ Failed to kill leader"
    echo "$RESPONSE"
    
    # Fallback: Try to find and kill leader process directly
    echo ""
    echo "Attempting direct process kill..."
    
    # Find coordinator processes
    LEADER_PID=$(ps aux | grep "services/scheduler-coordinator" | grep -v grep | head -1 | awk '{print $2}')
    
    if [ -n "$LEADER_PID" ]; then
        echo "Found coordinator PID: $LEADER_PID"
        kill -9 $LEADER_PID
        echo "✅ Killed coordinator process"
    else
        echo "❌ No coordinator process found"
        exit 1
    fi
fi
