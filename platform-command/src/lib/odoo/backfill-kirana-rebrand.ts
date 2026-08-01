/**
 * One-time backfill script: install kirana_rebrand on every already-provisioned shop.
 *
 * CONTEXT:
 *   provisionShop() previously omitted kirana_rebrand from the module install list
 *   (stale comment said "not built yet" when in fact the addon already exists in
 *   custom_addons/ and is mounted into the Odoo container). Every shop provisioned
 *   before this fix is currently running raw, unbranded Odoo.
 *
 * HOW TO RUN (one-time, from platform-command/):
 *   npx tsx src/lib/odoo/backfill-kirana-rebrand.ts
 *
 * REQUIREMENTS:
 *   - ODOO_URL, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD, ODOO_MASTER_PASSWORD must be
 *     set in the environment (same as your normal .env).
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to reach the shops table.
 *   - The Odoo container must be running and reachable.
 *   - The kirana_rebrand addon must be mounted and loadable by Odoo (it is, via
 *     ./custom_addons:/mnt/extra-addons in docker-compose.yml).
 *
 * SAFETY:
 *   - Reads the shops table to find only 'live' shops with an odoo_db_name set.
 *   - odooInstallModules() is idempotent: if kirana_rebrand is already installed on a
 *     database, it skips it (state = 'installed', toInstall list is empty).
 *   - Module installation is synchronous on Odoo's side (~30s per shop for a small addon).
 *     Run this when shop owners are not actively using the POS to avoid a brief CSS flash.
 *   - On failure for a specific shop, the script logs and continues to the next shop.
 */

import { createClient } from "@supabase/supabase-js";
import { odooInstallModules, odooDbExists } from "./client";
import WebSocket from "ws";

// Fix for Node.js < 22 where native WebSocket is not present
if (typeof global !== "undefined" && !global.WebSocket) {
  (global as any).WebSocket = WebSocket;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all live shops with a provisioned Odoo database
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, business_name, odoo_db_name, provisioning_status")
    .eq("provisioning_status", "live")
    .not("odoo_db_name", "is", null);

  if (error) {
    console.error("❌ Failed to fetch shops from Supabase:", error.message);
    process.exit(1);
  }

  if (!shops || shops.length === 0) {
    console.log("ℹ️  No live shops found. Nothing to backfill.");
    return;
  }

  console.log(`\n🔍 Found ${shops.length} live shop(s). Installing kirana_rebrand on each...\n`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const shop of shops) {
    const db = shop.odoo_db_name as string;
    const label = `[${shop.business_name} / ${db}]`;

    try {
      // Verify the database still exists in Odoo before attempting install
      const exists = await odooDbExists(db);
      if (!exists) {
        console.warn(`  ⚠️  ${label} Odoo DB not found — skipping.`);
        skipped++;
        continue;
      }

      console.log(`  🔧 ${label} Installing kirana_rebrand...`);
      // odooInstallModules is idempotent — skips if already installed
      await odooInstallModules(db, ["kirana_rebrand"]);
      console.log(`  ✅ ${label} Done.`);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${label} Failed: ${msg}`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Backfill complete:`);
  console.log(`  ✅ Succeeded : ${succeeded}`);
  console.log(`  ❌ Failed    : ${failed}`);
  console.log(`  ⚠️  Skipped   : ${skipped}`);
  console.log(`──────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
