#!/bin/bash
set -e

USERNAME="devilsmight"

echo "Tagging images..."
docker tag kirana-odoo:18.0 $USERNAME/kirana-odoo:18.0
docker tag kirana-shop-portal:latest $USERNAME/kirana-shop-portal:latest
docker tag kirana-platform-command:latest $USERNAME/kirana-platform-command:latest

echo "Pushing kirana-odoo:18.0..."
docker push $USERNAME/kirana-odoo:18.0

echo "Pushing kirana-shop-portal:latest..."
docker push $USERNAME/kirana-shop-portal:latest

echo "Pushing kirana-platform-command:latest..."
docker push $USERNAME/kirana-platform-command:latest

echo "All images pushed successfully to Docker Hub!"
