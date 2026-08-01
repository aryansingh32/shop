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
  syncOwnerGroupsAfterModuleInstall,
} from "./client";

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
 * @param dbName         Unique database name (e.g. "shop_mobileworld_abc1")
 * @param adminEmail     Owner's email — set as the Odoo admin login for this DB
 * @param adminPassword  Password to set for the admin user on this DB
 * @param moduleNames    Odoo technical module names to install (from plan)
 */
export async function provisionShop(
  dbName: string,
  adminEmail: string,
  adminPassword: string,
  moduleNames: string[],
): Promise<ProvisionResult | ProvisionError> {
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

    // Step 2: Install plan modules.
    // Always include these regardless of plan tier:
    //   - l10n_in:       India GST localization (mandatory for all Indian shops)
    //   - barcodes:      barcode scanning support (core checkout capability)
    //   - kirana_rebrand: strips Odoo branding from the web client and POS customer display.
    //                    The addon lives in custom_addons/ and is mounted into the Odoo
    //                    container via docker-compose. It depends on 'web', 'point_of_sale',
    //                    and 'stock' — satisfied by both Standard and Premium plans.
    const allModules = Array.from(
      new Set(["l10n_in", "barcodes", "kirana_rebrand", ...moduleNames]),
    );
    console.log(`[provisionShop] Installing modules on ${dbName}:`, allModules);
    await odooInstallModules(dbName, allModules);

    // Step 3: Create the shop owner's admin user account
    await odooCreateUser(dbName, adminEmail, adminPassword, "Shop Owner");

    // Step 4: Create a ready-to-use pos.config so the POS can be opened directly.
    // Without this, Odoo redirects to the POS backend config list (not the live POS UI).
    // The portal opens POS via /pos/ui?config_id=<id> using this record's ID.
    // IMPORTANT: failures here are NOT silently swallowed — a missing pos.config causes
    // the POS app card to land on the wrong Odoo screen every time. Let it propagate so
    // the shop is marked 'failed' and can be retried, rather than marked 'live' but broken.
    const posCreated = allModules.includes("point_of_sale");
    if (posCreated) {
      await odooCreatePosConfig(dbName, "Shop Counter");
      console.log(`[provisionShop] pos.config created on ${dbName}`);
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

  // Modules that must NEVER be uninstalled regardless of plan changes.
  // These are platform infrastructure — removing them would break core functionality:
  //   l10n_in:       India GST localization — mandatory for all Indian shops
  //   barcodes:      barcode scanning support — hardcoded into every new provisioning
  //   kirana_rebrand: our white-label addon — removing it would expose Odoo branding to shop owners
  const PINNED_MODULES = new Set(["l10n_in", "barcodes", "kirana_rebrand"]);
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
