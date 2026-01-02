#!/bin/bash
echo "Killing a random worker..."
CONTAINER=$(docker ps --format "{{.Names}}" | grep worker | shuf -n 1)

if [ -z "$CONTAINER" ]; then
  echo "No worker containers found."
  exit 1
fi

echo "Stopping $CONTAINER"
docker stop $CONTAINER

echo "Worker stopped. Monitor scheduler logs for reclamation."
