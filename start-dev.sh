#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kirana SaaS Platform — Local Development Startup Script
#
# Starts:
#   1. Docker (Odoo 18 + PostgreSQL)
#   2. Platform Admin Panel (platform-command) → http://localhost:3000
#   3. Shop Portal (shop-portal) → http://localhost:3001
#
# For shop portal subdomain testing in local dev:
#   - Set DEFAULT_DEV_SUBDOMAIN in shop-portal/.env to any shop's subdomain
#   - OR access via shopname.localhost:3001 (requires /etc/hosts entry below)
#
# Usage:
#   ./start-dev.sh                  # Start all services
#   ./start-dev.sh --add-hosts      # Also add /etc/hosts entries (requires sudo)
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$SCRIPT_DIR/platform-command"
PORTAL_DIR="$SCRIPT_DIR/shop-portal"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  Kirana SaaS Platform — Dev Startup            ${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 1. Check Docker
echo -e "\n${YELLOW}[1/3]${NC} Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
  exit 1
fi

# 2. Start Odoo containers
echo -e "${YELLOW}[2/3]${NC} Starting Odoo Docker containers..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d
echo -e "${GREEN}✅ Odoo running at http://localhost:8069${NC}"
echo -e "   Master password: superadmin"

# Wait for Odoo to be ready
echo -n "   Waiting for Odoo to be ready..."
for i in {1..30}; do
  if curl -sf http://localhost:8069/jsonrpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"call","id":1,"params":{"service":"common","method":"version","args":[]}}' \
    > /dev/null 2>&1; then
    echo -e " ${GREEN}ready!${NC}"
    break
  fi
  sleep 2
  echo -n "."
  if [ $i -eq 30 ]; then
    echo -e "\n${RED}⚠️  Odoo not ready after 60s — proceeding anyway${NC}"
  fi
done

# 3. Optional: add /etc/hosts entries for subdomain testing
if [[ "$1" == "--add-hosts" ]]; then
  echo -e "\n${YELLOW}[+]${NC} Adding /etc/hosts entries for shop subdomains..."
  SUBDOMAINS=$(grep -o '"subdomain":[^,}]*' "$PORTAL_DIR/.env" 2>/dev/null | cut -d'"' -f4 || echo "fixfast temo")
  for sub in $SUBDOMAINS fixfast temo testshop; do
    if ! grep -q "^127.0.0.1.*${sub}.localhost" /etc/hosts 2>/dev/null; then
      echo "127.0.0.1 ${sub}.localhost" | sudo tee -a /etc/hosts > /dev/null
      echo -e "  Added: ${sub}.localhost"
    fi
  done
  echo -e "${GREEN}✅ Hosts entries added${NC}"
fi

echo -e "\n${YELLOW}[3/3]${NC} Starting web apps..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Admin Panel${NC}  → http://localhost:3000"
echo -e "  ${BOLD}Shop Portal${NC}  → http://localhost:3001"
echo -e "  ${BOLD}Odoo        ${NC} → http://localhost:8069"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Super admin login: superadmin@gmail.com${NC}"
echo -e "${YELLOW}  (password: whatever you set in Supabase)${NC}"
echo -e ""
echo -e "  Press Ctrl+C to stop both apps"
echo ""

# Start both dev servers in parallel
cd "$PLATFORM_DIR" && npm run dev &
ADMIN_PID=$!
cd "$PORTAL_DIR" && npm run dev &
PORTAL_PID=$!

# Handle Ctrl+C gracefully
trap "echo -e '\n${YELLOW}Stopping...${NC}'; kill $ADMIN_PID $PORTAL_PID 2>/dev/null; exit 0" INT TERM

# Wait for both
wait $ADMIN_PID $PORTAL_PID
