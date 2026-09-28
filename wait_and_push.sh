#!/bin/bash
echo "Waiting for kirana-platform-command to finish building..."
while ! docker images | grep -q kirana-platform-command; do
  sleep 5
done
echo "Build finished! Proceeding to push..."
./push_to_hub.sh
