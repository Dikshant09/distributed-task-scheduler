#!/bin/bash
echo "Identifying Leader..."
# In a real scenario, we'd query etcd or logs. 
# Here we just kill the first scheduler instance as a demo, 
# or loop through logs to find who says "I am the leader".

CONTAINER=$(docker-compose logs scheduler | grep "I am the leader" | tail -1 | awk '{print $1}' | cut -d_ -f1,2,3)

if [ -z "$CONTAINER" ]; then
  echo "Leader not found in logs (or no logs yet). Killing scheduler-1 by default."
  CONTAINER="distributed-task-scheduler-scheduler-1"
fi

echo "Killing Leader: $CONTAINER"
docker stop $CONTAINER

echo "Waiting for re-election..."
sleep 5
docker-compose logs scheduler | grep "I am the leader" | tail -2
