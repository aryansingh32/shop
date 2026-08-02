/**
 * Odoo Provisioning Operations
 *
 * High-level operations called by server functions in shops.functions.ts.
 * Each function represents one complete lifecycle action on a shop's Odoo database.
 *
 * All Supabase writes (status updates) are done by the calling server function —
 * these functions ONLY talk to Odoo. This keeps the separation clean.
 */

import {
  odooDbCreate,
  odooDbDrop,
  odooDbExists,
  odooInstallModules,
  odooUninstallModules,
  odooListInstalledModules,
  odooDeactivateUsers,
  odooReactivateUsers,
  odooGetUsers,
  odooServerVersion,
  type OdooUser,
  type OdooModule,
  ADMIN_LOGIN,
  ADMIN_PASSWORD,
  odooCreateUser,
  odooCreatePosConfig,
  odooCreateLoyaltyProgram,
  syncOwnerGroupsAfterModuleInstall,
} from "./client";
import { getBusinessTypeTemplateBySlug } from "../business-types.functions";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProvisionResult {
  success: true;
  dbName: string;
  installedModules: string[];
}

export interface ProvisionError {
  success: false;
  error: string;
}

export interface ShopHealthResult {
  reachable: boolean;
  dbExists: boolean;
  installedModules: OdooModule[];
  installedModuleNames: string[];
  odooVersion: string | null;
  userCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core provisioning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provision a new Odoo database for a shop.
 *
 * Steps:
 * 1. Create the database (installs `base` module — ~30 seconds)
 * 2. Install the plan's app modules (may take 2-5 min for heavy modules)
 *
 * @param dbName            Unique database name (e.g. "shop_mobileworld_abc1")
 * @param adminEmail        Owner's email — set as the Odoo admin login for this DB
 * @param adminPassword     Password to set for the admin user on this DB
 * @param moduleNames       Odoo technical module names to install (from plan)
 * @param businessTypeSlug  Optional business-type slug (e.g. 'pharmacy'). When provided,
 *                          the template's default_app_slugs are merged into the install list
 *                          (additive — never removes plan modules). When omitted, behavior
 *                          is byte-for-byte identical to the pre-feature behavior.
 */
export async function provisionShop(
  dbName: string,
  adminEmail: string,
  adminPassword: string,
  moduleNames: string[],
  businessTypeSlug?: string,
): Promise<ProvisionResult | ProvisionError> {
  let dbCreated = false;
  try {
    // Safety check — don't overwrite an existing database
    const exists = await odooDbExists(dbName);
    if (exists) {
      throw new Error(
        `Database "${dbName}" already exists in Odoo. Cannot provision over an existing database.`,
      );
    }

    // Step 1: Create the database using the Platform Admin credentials
    // This ensures our Super Admin Panel always has a backdoor to manage the shop via RPC.
    await odooDbCreate(dbName, ADMIN_LOGIN, ADMIN_PASSWORD, "en_IN", "IN");
    dbCreated = true;

    // Step 2: Install plan modules.
    // Always include these regardless of plan tier:
    //   - l10n_in:                         India GST localization (mandatory for all Indian shops)
    //   - barcodes:                         Odoo core barcode scanning infrastructure
    //   - kirana_rebrand:                   strips Odoo branding (custom_addons/)
    //   - barcodes_generator_abstract:      OCA barcode generation engine (custom_addons/)
    //   - barcodes_generator_product:       Adds "Generate Barcode" button to product cards (custom_addons/)
    //   - stock_picking_product_barcode_report: OCA barcode label printing for stock moves (custom_addons/)
    // REVIEWER CHECKLIST: every new custom addon mounted via docker-compose MUST have a line here.
    // This is the second time this class of bug occurred (first: kirana_rebrand). Do not break the pattern.
    let allModules = new Set([
      "l10n_in",
      "barcodes",
      "kirana_rebrand",
      // OCA barcode generation — always on so every shop can print product labels
      "barcodes_generator_abstract",
      "barcodes_generator_product",
      "stock_picking_product_barcode_report",
      ...moduleNames,
    ]);

    // Feature 1 — Business-Type Templates:
    // If a businessTypeSlug is provided, look up the template and merge its
    // default_app_slugs into the install set. This is ADDITIVE — we never
    // remove modules the plan already grants.
    if (businessTypeSlug) {
      const template = await getBusinessTypeTemplateBySlug(businessTypeSlug).catch((err) => {
        console.warn(
          `[provisionShop] Failed to look up business-type template "${businessTypeSlug}": ${String(err)}. Proceeding without template.`,
        );
        return null;
      });

      if (template) {
        // Map app slugs → Odoo module names via the apps table.
        // The template stores slugs (e.g. 'pharmacy'), not raw module names.
        // We resolve slugs to Odoo module names by fetching from supabaseAdmin.
        // Slugs not resolvable (e.g. not in apps table) are silently skipped.
        const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
        const { data: appRows } = await supabaseAdmin
          .from("apps")
          .select("slug, odoo_module_name")
          .in("slug", template.default_app_slugs.length > 0 ? template.default_app_slugs : ["__none__"]);

        const templateModuleNames = (appRows ?? []).map((a: any) => a.odoo_module_name).filter(Boolean);
        for (const mod of templateModuleNames) {
          allModules.add(mod);
        }
        console.log(
          `[provisionShop] Business type "${businessTypeSlug}" added modules:`,
          templateModuleNames,
        );
      } else {
        console.warn(
          `[provisionShop] Business type template "${businessTypeSlug}" not found in database. Provisioning without template defaults.`,
        );
      }
    }

    const allModulesArray = Array.from(allModules);
    console.log(`[provisionShop] Installing modules on ${dbName}:`, allModulesArray);
    await odooInstallModules(dbName, allModulesArray);

    // Step 3: Create the shop owner's admin user account
    await odooCreateUser(dbName, adminEmail, adminPassword, "Shop Owner");

    // Step 4: Create a ready-to-use pos.config so the POS can be opened directly.
    // Without this, Odoo redirects to the POS backend config list (not the live POS UI).
    // The portal opens POS via /pos/ui?config_id=<id> using this record's ID.
    // IMPORTANT: failures here are NOT silently swallowed — a missing pos.config causes
    // the POS app card to land on the wrong Odoo screen every time. Let it propagate so
    // the shop is marked 'failed' and can be retried, rather than marked 'live' but broken.
    const posCreated = allModules.has("point_of_sale");
    if (posCreated) {
      await odooCreatePosConfig(dbName, "Shop Counter");
      console.log(`[provisionShop] pos.config created on ${dbName}`);
    }

    // Feature 6 — Loyalty Program auto-creation:
    // Create a default loyalty program if the loyalty module is being installed.
    // IMPORTANT: This failure is deliberately NON-FATAL (unlike POS config above).
    // Rationale: POS is completely unusable without a pos.config, so that failure
    // must block provisioning. Loyalty is a value-add feature — the shop can bill
    // and operate normally without it. A failed loyalty setup should never block
    // a merchant from going live. This distinction is intentional; do not change
    // this to a fatal failure by copying the POS pattern indiscriminately.
    const loyaltyInstalled = allModules.has("loyalty");
    if (loyaltyInstalled) {
      try {
        await odooCreateLoyaltyProgram(dbName);
        console.log(`[provisionShop] Default loyalty program created on ${dbName}`);
      } catch (loyaltyErr) {
        // Non-fatal: log and continue. The shop is usable without a loyalty program.
        console.warn(
          `[provisionShop] Failed to create default loyalty program on ${dbName} (non-fatal):`,
          loyaltyErr,
        );
      }
    }

    // Ensure the shop owner receives all permissions from Administrator (ID 2)
    // for all newly installed modules (POS, Inventory, Accounting, etc.)
    await syncOwnerGroupsAfterModuleInstall(dbName);

    const installed = await odooListInstalledModules(dbName);
    return {
      success: true,
      dbName,
      installedModules: installed.map((m) => m.name),
    };
  } catch (err) {
    if (dbCreated) {
      try {
        console.warn(`[provisionShop] Provisioning failed for ${dbName}. Cleaning up incomplete database...`);
        await odooDbDrop(dbName);
      } catch (dropErr) {
        console.error(`[provisionShop] Failed to clean up incomplete database ${dbName}:`, dropErr);
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Deprovision (permanently destroy) a shop's Odoo database.
 * Called when a shop is deleted from the admin panel.
 *
 * This is irreversible. The calling code is responsible for
 * confirming intent (the UI already requires typing the shop name).
 */
export async function deprovisionShop(
  dbName: string | null | undefined,
): Promise<void> {
  if (!dbName) return; // Shop was never provisioned — nothing to clean up

  const exists = await odooDbExists(dbName);
  if (!exists) {
    // Already gone — that's fine, treat as success
    return;
  }

  await odooDbDrop(dbName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suspension / reactivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Suspend a shop's Odoo access.
 * Deactivates all non-admin users so no one can log in.
 * Data is preserved — the database is NOT dropped.
 */
export async function suspendShopOdoo(
  dbName: string | null | undefined,
): Promise<void> {
  if (!dbName) return;

  const exists = await odooDbExists(dbName);
  if (!exists) return;

  await odooDeactivateUsers(dbName);
}

/**
 * Reactivate a previously suspended shop.
 * Re-enables all users that were deactivated during suspension.
 */
export async function reactivateShopOdoo(
  dbName: string | null | undefined,
): Promise<void> {
  if (!dbName) return;

  const exists = await odooDbExists(dbName);
  if (!exists) return;

  await odooReactivateUsers(dbName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan changes — module sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modules that must NEVER be uninstalled regardless of plan changes or
 * merchant-driven app toggles (Feature 5 marketplace).
 *
 * These are platform infrastructure — removing them would break core functionality:
 *   l10n_in:                             India GST localization — mandatory for all Indian shops
 *   barcodes:                            Odoo core barcode scanning support
 *   kirana_rebrand:                      white-label addon — removing it exposes Odoo branding
 *   barcodes_generator_abstract:         OCA barcode generation engine (depends on 'barcodes')
 *   barcodes_generator_product:          OCA product barcode button
 *   stock_picking_product_barcode_report: OCA barcode label printing for deliveries
 *
 * Exported so the Feature 5 marketplace toggle function can import this exact
 * set instead of redefining it — single source of truth.
 */
export const PINNED_MODULES = new Set([
  "l10n_in",
  "barcodes",
  "kirana_rebrand",
  "barcodes_generator_abstract",
  "barcodes_generator_product",
  "stock_picking_product_barcode_report",
]);

/**
 * Sync installed Odoo modules when a shop changes plan.
 * Installs modules added by the new plan, uninstalls modules removed by it.
 *
 * @param dbName         The shop's Odoo database
 * @param oldModules     Module names from the OLD plan
 * @param newModules     Module names from the NEW plan
 */
export async function syncPlanModules(
  dbName: string | null | undefined,
  oldModules: string[],
  newModules: string[],
): Promise<{ installed: string[]; uninstalled: string[] }> {
  if (!dbName) return { installed: [], uninstalled: [] };

  const exists = await odooDbExists(dbName);
  if (!exists) return { installed: [], uninstalled: [] };

  const toInstall = newModules.filter((m) => !oldModules.includes(m));
  const toUninstall = oldModules.filter((m) => !newModules.includes(m));

  const safeToUninstall = toUninstall.filter((m) => !PINNED_MODULES.has(m));

  await Promise.all([
    odooInstallModules(dbName, toInstall),
    odooUninstallModules(dbName, safeToUninstall),
  ]);

  await syncOwnerGroupsAfterModuleInstall(dbName);

  return { installed: toInstall, uninstalled: safeToUninstall };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check the real-time health of a shop's Odoo database.
 * Returns reachability, installed modules, and user count.
 */
export async function checkShopHealth(
  dbName: string | null | undefined,
): Promise<ShopHealthResult> {
  const empty: ShopHealthResult = {
    reachable: false,
    dbExists: false,
    installedModules: [],
    installedModuleNames: [],
    odooVersion: null,
    userCount: 0,
  };

  if (!dbName) return empty;

  try {
    const [version, dbExists] = await Promise.all([
      odooServerVersion().catch(() => null),
      odooDbExists(dbName).catch(() => false),
    ]);

    if (!dbExists) {
      return { ...empty, reachable: true, odooVersion: version, dbExists: false };
    }

    const [modules, users] = await Promise.all([
      odooListInstalledModules(dbName).catch(() => []),
      odooGetUsers(dbName).catch(() => [] as OdooUser[]),
    ]);

    return {
      reachable: true,
      dbExists: true,
      installedModules: modules,
      installedModuleNames: modules.map((m) => m.name),
      odooVersion: version,
      userCount: users.length,
    };
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a safe, unique database name for a shop.
 * Format: shop_{slug}_{shortId}
 * Uses the subdomain (already slug-ified) + a random suffix for uniqueness.
 */
export function generateDbName(subdomain: string): string {
  const safe = subdomain.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `shop_${safe}_${suffix}`;
}

/** Fetch employees (res.users) from a live shop's Odoo database. */
export async function fetchShopEmployees(
  dbName: string | null | undefined,
): Promise<OdooUser[]> {
  if (!dbName) return [];

  try {
    const exists = await odooDbExists(dbName);
    if (!exists) return [];

    return odooGetUsers(dbName);
  } catch {
    return [];
  }
}
