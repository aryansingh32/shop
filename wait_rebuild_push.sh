#!/bin/bash
echo "Waiting for build task to finish..."
while docker ps -a | grep -q 'restarting'; do
    sleep 5
done
echo "Checking if containers are healthy..."
sleep 15
docker ps
