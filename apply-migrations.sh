#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# apply-migrations.sh
# Applies all Supabase DB migrations using the Supabase CLI.
#
# Requirements:
#   - Your Supabase Personal Access Token (get from https://supabase.com/dashboard/account/tokens)
#   - OR your DB password (from Supabase Dashboard > Project Settings > Database > Connection string)
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxx..."
#   ./apply-migrations.sh
#
#   OR with DB password:
#   export SUPABASE_DB_PASSWORD="yourpassword"
#   ./apply-migrations.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_REF="bzwkykkrmammyhdpvlrw"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/platform-command/supabase/migrations"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Supabase Migration Applier${NC}"
echo "Project: $PROJECT_REF"

if [[ -n "$SUPABASE_ACCESS_TOKEN" ]]; then
  echo -e "${GREEN}Using Personal Access Token${NC}"
  
  # Login with token
  npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
  
  # Link project
  cd "$SCRIPT_DIR/platform-command"
  npx supabase link --project-ref "$PROJECT_REF"
  
  # Push migrations
  npx supabase db push
  
  echo -e "${GREEN}✅ Migrations applied successfully!${NC}"

elif [[ -n "$SUPABASE_DB_PASSWORD" ]]; then
  echo -e "${GREEN}Using DB password${NC}"
  
  DB_URL="postgresql://postgres.${PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
  
  for migration in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    echo -e "\n${YELLOW}Applying: $(basename $migration)${NC}"
    psql "$DB_URL" -f "$migration"
    echo -e "${GREEN}✅ Done${NC}"
  done
  
  echo -e "\n${GREEN}✅ All migrations applied!${NC}"

else
  echo -e "${RED}❌ Error: Set either SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD${NC}"
  echo ""
  echo "Option 1 — Personal Access Token:"
  echo "  1. Go to: https://supabase.com/dashboard/account/tokens"
  echo "  2. Create a new token"
  echo "  3. export SUPABASE_ACCESS_TOKEN=\"sbp_xxx...\""
  echo "  4. ./apply-migrations.sh"
  echo ""
  echo "Option 2 — DB Password:"
  echo "  1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
  echo "  2. Copy the 'Database password' (or reset it)"
  echo "  3. export SUPABASE_DB_PASSWORD=\"yourpassword\""
  echo "  4. ./apply-migrations.sh"
  echo ""
  echo "Option 3 — Manual (SQL Editor):"
  echo "  1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy and paste each .sql file from platform-command/supabase/migrations/"
  echo "  3. Run them in order (sorted by filename)"
  exit 1
fi
