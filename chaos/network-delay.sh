#!/bin/bash

# =============================================================================
# CHAOS TEST: Network Delay Simulation
# =============================================================================
# Purpose: Simulate network latency/jitter
# Expected: System handles delays gracefully, timeouts work correctly
# Interview Signal: "System is resilient to network jitter"
# =============================================================================

echo "🔥 CHAOS TEST: Network Delay Simulation"
echo "========================================"

# Note: macOS doesn't have tc (traffic control) like Linux
# We simulate delay using the pause queue feature instead

DELAY_MS=${1:-10000}  # Default 10 seconds

echo "⚠️  Simulating network delay by pausing queue for ${DELAY_MS}ms"
echo ""

# Use the pause queue API endpoint
RESPONSE=$(curl -s -X POST http://localhost:3000/admin/faults/pause-queue \
    -H "Content-Type: application/json" \
    -d "{\"duration\": $DELAY_MS}")

if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ Network delay simulation started"
    echo ""
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "⏳ Expected behavior:"
    echo "   - Coordinator continues marking PENDING → READY"
    echo "   - Dispatcher is paused (simulates network delay)"
    echo "   - Tasks accumulate in READY state"
    echo "   - After ${DELAY_MS}ms, tasks dispatched in burst"
    echo ""
    echo "📝 Watch logs:"
    echo "   tail -f logs/coordinator*.log logs/dispatcher.log"
else
    echo "❌ Failed to simulate network delay"
    echo "$RESPONSE"
    exit 1
fi
