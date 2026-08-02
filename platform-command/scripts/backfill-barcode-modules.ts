/**
 * backfill-barcode-modules.ts
 *
 * One-off backfill: installs the three OCA barcode generator modules and adds
 * the UPI payment method to every shop database that was provisioned before
 * these were wired into provisioning.ts.
 *
 * Same pattern as backfill-kirana-rebrand.ts (the first time this bug class
 * was hit). Run once, then archive this file.
 *
 * Usage:
 *   npx tsx scripts/backfill-barcode-modules.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars (or .env.local).
 */

import { createClient } from "@supabase/supabase-js";
import {
  odooDbExists,
  odooInstallModules,
  odooAdminExecute,
} from "../src/lib/odoo/client";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? "";

const BARCODE_MODULES = [
  "barcodes_generator_abstract",
  "barcodes_generator_product",
  "stock_picking_product_barcode_report",
];

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Fetch all shops that have a provisioned Odoo DB
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, business_name, odoo_db_name")
    .not("odoo_db_name", "is", null)
    .eq("status", "active");

  if (error) {
    console.error("❌ Failed to fetch shops:", error);
    process.exit(1);
  }

  console.log(`\n🔍 Found ${shops?.length ?? 0} active shops to backfill.\n`);

  for (const shop of shops ?? []) {
    const db = shop.odoo_db_name as string;
    console.log(`\n── ${shop.business_name} (${db})`);

    const exists = await odooDbExists(db).catch(() => false);
    if (!exists) {
      console.log(`   ⚠️  Skipping — database not found in Odoo.`);
      continue;
    }

    // Install the three barcode modules
    try {
      await odooInstallModules(db, BARCODE_MODULES);
      console.log(`   ✅ Installed: ${BARCODE_MODULES.join(", ")}`);
    } catch (err) {
      console.error(`   ❌ Module install failed:`, err);
      continue;
    }

    // Idempotently create UPI payment method
    try {
      // Find the company ID
      const companies = await odooAdminExecute<{ id: number }[]>(
        db, "res.company", "search_read",
        [[[("id" as string), ">", 0]]],
        { fields: ["id"], limit: 1 }
      );
      const companyId = companies.length > 0 ? companies[0].id : 1;

      const existingUpi = await odooAdminExecute<{ id: number }[]>(
        db, "pos.payment.method", "search_read",
        [[["name", "=", "UPI"]]],
        { fields: ["id"], limit: 1 }
      );

      if (existingUpi.length > 0) {
        console.log(`   ℹ️  UPI payment method already exists (id=${existingUpi[0].id}) — skipping.`);
      } else {
        const upiId = await odooAdminExecute<number>(
          db, "pos.payment.method", "create",
          [{ name: "UPI", is_cash_count: false, company_id: companyId }]
        );

        // Attach UPI to the shop's POS config(s)
        const posConfigs = await odooAdminExecute<{ id: number }[]>(
          db, "pos.config", "search_read",
          [[[("active" as string), "in", [true, false]]]],
          { fields: ["id"] }
        );
        for (const cfg of posConfigs) {
          await odooAdminExecute(
            db, "pos.config", "write",
            [[cfg.id], { payment_method_ids: [[4, upiId, 0]] }]
          );
        }
        console.log(`   ✅ UPI payment method created (id=${upiId}) and linked to ${posConfigs.length} POS config(s).`);
      }
    } catch (upiErr) {
      console.warn(`   ⚠️  UPI setup failed (non-fatal):`, upiErr);
    }
  }

  console.log("\n\n✅ Backfill complete.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
