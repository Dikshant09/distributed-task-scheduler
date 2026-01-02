#!/bin/bash

# DLQ Testing Script
# This script demonstrates how to test the Dead Letter Queue functionality

echo "🧪 Testing DLQ (Dead Letter Queue) Functionality"
echo "================================================"
echo ""

API_URL="http://localhost:3000"

echo "Step 1: Create a task that will fail repeatedly"
echo "-----------------------------------------------"
echo "Creating a DELAY task with 100% failure probability and max_attempts=3"
echo ""

TASK_RESPONSE=$(curl -s -X POST "$API_URL/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "DELAY",
    "payload": {
      "duration_ms": 500,
      "fail_probability": 1.0
    },
    "scheduledAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "idempotencyKey": "dlq-test-'$(date +%s)'"
  }')

TASK_ID=$(echo $TASK_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['task']['id'])" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
    echo "❌ Failed to create task"
    echo "Response: $TASK_RESPONSE"
    exit 1
fi

echo "✅ Task created: $TASK_ID"
echo ""

echo "Step 2: Wait for task to fail and retry"
echo "---------------------------------------"
echo "The task will:"
echo "  - Attempt 1: FAIL → retry in ~1s"
echo "  - Attempt 2: FAIL → retry in ~2s"
echo "  - Attempt 3: FAIL → retry in ~4s"
echo "  - Attempt 4: FAIL → retry in ~8s"
echo "  - Attempt 5: FAIL → Move to DLQ"
echo ""
echo "Waiting 30 seconds for all retries to complete..."

for i in {30..1}; do
    echo -ne "\rTime remaining: ${i}s "
    sleep 1
done
echo ""
echo ""

echo "Step 3: Check task status"
echo "------------------------"
TASK_STATUS=$(curl -s "$API_URL/tasks/$TASK_ID" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"Status: {data['data']['task']['status']}, Attempts: {data['data']['task']['attempt']}, DLQ Reason: {data['data']['task'].get('dlq_reason', 'N/A')}\")")
echo "$TASK_STATUS"
echo ""

echo "Step 4: View DLQ tasks"
echo "---------------------"
DLQ_TASKS=$(curl -s "$API_URL/admin/dlq")
echo "$DLQ_TASKS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"DLQ Count: {data['data']['count']}\"); [print(f\"  - Task {t['id'][:8]}...: {t['type']}, Attempts: {t['attempt']}, Reason: {t['dlq_reason']}\") for t in data['data']['tasks'][:5]]"
echo ""

echo "Step 5: Manually retry from DLQ"
echo "-------------------------------"
echo "Retrying task $TASK_ID from DLQ..."
RETRY_RESPONSE=$(curl -s -X POST "$API_URL/admin/dlq/$TASK_ID/retry")
echo "$RETRY_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('message', data))"
echo ""

echo "Step 6: Check task status after retry"
echo "-------------------------------------"
sleep 2
FINAL_STATUS=$(curl -s "$API_URL/tasks/$TASK_ID" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"Status: {data['data']['task']['status']}, Attempts: {data['data']['task']['attempt']}\")")
echo "$FINAL_STATUS"
echo ""

echo "✅ DLQ Test Complete!"
echo ""
echo "📊 Summary:"
echo "  1. Created a task guaranteed to fail"
echo "  2. Task failed 5 times with exponential backoff"
echo "  3. Task automatically moved to DLQ after max attempts"
echo "  4. Manually retried task from DLQ via admin API"
echo "  5. Task reset to PENDING and will be re-executed"
echo ""
echo "💡 Tips:"
echo "  - Monitor logs: tail -f logs/scheduler.log | grep -E '(DLQ|retry)'"
echo "  - View all DLQ tasks: curl $API_URL/admin/dlq"
echo "  - Cleanup old DLQ: curl -X POST $API_URL/admin/dlq/cleanup -d '{\"retentionDays\": 7}'"
