#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Kirana SaaS — One-Click Launch Script
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   ./launch.sh           # Start all services (reuses existing images)
#   ./launch.sh --build   # Rebuild app images then start
#   ./launch.sh --down    # Stop and remove containers
#   ./launch.sh --logs    # Follow all logs
#   ./launch.sh --status  # Show container status
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
COMPOSE_CMD="docker compose"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

print_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗██╗██████╗  █████╗ ███╗   ██╗ █████╗ "
  echo "  ██║ ██╔╝██║██╔══██╗██╔══██╗████╗  ██║██╔══██╗"
  echo "  █████╔╝ ██║██████╔╝███████║██╔██╗ ██║███████║"
  echo "  ██╔═██╗ ██║██╔══██╗██╔══██║██║╚██╗██║██╔══██║"
  echo "  ██║  ██╗██║██║  ██║██║  ██║██║ ╚████║██║  ██║"
  echo "  ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝"
  echo -e "${NC}${BOLD}  Retail SaaS Platform — Docker Stack${NC}"
  echo "  ──────────────────────────────────────"; echo ""
}

check_docker() {
  if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
    echo -e "${RED}❌  Docker is not running. Please start Docker.${NC}"; exit 1
  fi
}

show_urls() {
  echo ""
  echo -e "${BOLD}${GREEN}✅  Kirana stack is UP!${NC}"
  echo ""
  echo -e "  ${BOLD}Access URLs:${NC}"
  echo -e "  ${CYAN}🌐  Main Demo (Nginx)      →  http://localhost:8888${NC}"
  echo -e "  ${CYAN}🏠  Super Admin Panel      →  http://localhost:4000${NC}"
  echo -e "  ${CYAN}🛍️   Shop Owner Portal      →  http://localhost:4001${NC}"
  echo -e "  ${CYAN}⚙️   Odoo ERP               →  http://localhost:8069${NC}"
  echo ""
  echo -e "  ${YELLOW}Odoo credentials:  admin / admin${NC}"
  echo -e "  ${YELLOW}Odoo master pwd:   superadmin${NC}"
  echo ""
  echo -e "  ${BOLD}Useful commands:${NC}"
  echo -e "  ${BLUE}docker compose logs -f                   ${NC}# All logs"
  echo -e "  ${BLUE}docker compose logs -f odoo              ${NC}# Odoo only"
  echo -e "  ${BLUE}docker compose logs -f platform-command  ${NC}# Admin panel"
  echo -e "  ${BLUE}./launch.sh --down                       ${NC}# Stop all"
  echo ""
}

ACTION="up"; BUILD_FLAG=""
for arg in "$@"; do
  case $arg in
    --build)  BUILD_FLAG="--build" ;;
    --down)   ACTION="down" ;;
    --logs)   ACTION="logs" ;;
    --status) ACTION="status" ;;
    --help|-h) echo "Usage: ./launch.sh [--build|--down|--logs|--status]"; exit 0 ;;
  esac
done

print_banner
check_docker

case $ACTION in
  down)
    echo -e "${YELLOW}Stopping Kirana stack...${NC}"
    $COMPOSE_CMD down
    echo -e "${GREEN}✅  Stopped.${NC}"
    ;;
  logs)
    $COMPOSE_CMD logs -f
    ;;
  status)
    $COMPOSE_CMD ps
    ;;
  up)
    if [ -n "$BUILD_FLAG" ]; then
      echo -e "${YELLOW}🔨 Rebuilding app images (odoo reused — only frontend rebuilds)...${NC}"
    else
      echo -e "${BLUE}🚀 Starting Kirana SaaS stack (reusing existing images)...${NC}"
    fi
    echo ""
    $COMPOSE_CMD up $BUILD_FLAG -d
    echo ""
    echo -e "${BLUE}Checking service health...${NC}"
    sleep 5

    for check in "Odoo:8069/web/health" "Admin:4000" "Portal:4001" "Nginx:8888"; do
      name="${check%%:*}"; path="${check#*:}"
      if curl -sf --max-time 3 "http://localhost:${path}" &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} ${name} is up"
      else
        echo -e "  ${YELLOW}⏳${NC} ${name} still starting (normal — check logs)"
      fi
    done

    show_urls
    ;;
esac
