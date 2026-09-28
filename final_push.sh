#!/bin/bash
while docker ps -a | grep -q 'restarting'; do
  sleep 5
done
echo "Pushing images..."
docker tag kirana-platform-command:latest devilsmight/kirana-platform-command:latest
docker tag kirana-shop-portal:latest devilsmight/kirana-shop-portal:latest
docker push devilsmight/kirana-platform-command:latest
docker push devilsmight/kirana-shop-portal:latest
echo "Done pushing!"
