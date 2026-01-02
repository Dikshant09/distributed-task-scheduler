#!/bin/bash
echo "Simulating Network Partition for Leader..."
# This is tricky with docker-compose without specialized networks/pumba.
# Simple approximation: Pause the leader.

CONTAINER=$(docker ps --format "{{.Names}}" | grep scheduler | head -n 1)
echo "Pausing $CONTAINER"
docker pause $CONTAINER

echo "Leader paused. Wait for re-election..."
sleep 20

echo "Unpausing $CONTAINER"
docker unpause $CONTAINER
