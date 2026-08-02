/**
 * Odoo JSON-RPC client for the shop portal.
 *
 * Provides only the operations the shop portal needs:
 *   - Authenticate a user against a specific shop DB
 *   - Read user groups (to determine owner vs employee, and which apps they can access)
 *   - Manage res.users (create/update/deactivate employees)
 *   - Update res.company (shop profile)
 *
 * Uses the same low-level approach as platform-command/src/lib/odoo/client.ts
 * but scoped to shop-portal needs only.
 */

import http from "node:http";
import https from "node:https";
import { ODOO_URL, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD, APP_ODOO_GROUPS } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Low-level JSON-RPC
// ─────────────────────────────────────────────────────────────────────────────

let _rpcId = 1;

async function odooCall<T = unknown>(
  service: "common" | "db" | "object",
  method: string,
  args: unknown[]
): Promise<T> {
  const id = _rpcId++;
  const body = JSON.stringify({ jsonrpc: "2.0", method: "call", id, params: { service, method, args } });

  const url = new URL(`${ODOO_URL}/jsonrpc`);
  const client = url.protocol === "https:" ? https : http;

  const json = await new Promise<any>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 30_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error("Failed to parse Odoo response")); }
        });
      }
    );
    req.on("error", (err) => reject(new Error(`Odoo unreachable at ${ODOO_URL}: ${String(err)}`)));
    req.write(body);
    req.end();
  });

  if (json.error) {
    const detail = json.error.data?.message ?? json.error.message ?? "Unknown Odoo error";
    throw new Error(`Odoo RPC [${method}]: ${detail}`);
  }
  return json.result as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session authentication (shop-user facing)
// ─────────────────────────────────────────────────────────────────────────────

export interface OdooAuthResult {
  uid: number;
  name: string;
  username: string;
  session_id: string;
  db: string;
  /** Raw group external IDs for the authenticated user */
  user_context?: Record<string, any>;
}

/**
 * Authenticate a shop user via Odoo's /web/session/authenticate endpoint.
 * Returns { uid, name, session_id, ... } on success, throws on failure.
 *
 * This is called from our login server function — never from the browser.
 * The resulting session_id is stored in our signed cookie + forwarded to Odoo
 * via the /odoo/* proxy path.
 */
export async function odooSessionAuthenticate(
  db: string,
  login: string,
  password: string
): Promise<OdooAuthResult> {
  const url = new URL(`${ODOO_URL}/web/session/authenticate`);
  const client = url.protocol === "https:" ? https : http;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    id: _rpcId++,
    params: { db, login, password },
  });

  const { json, sessionId } = await new Promise<{ json: any; sessionId: string }>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 15_000,
      },
      (res) => {
        let data = "";
        // Capture the session_id from Odoo's Set-Cookie response header
        const rawCookies = (res.headers["set-cookie"] ?? []).join("; ");
        const sessionMatch = rawCookies.match(/session_id=([^;]+)/);
        const sessionId = sessionMatch?.[1] ?? "";

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve({ json: JSON.parse(data), sessionId }); }
          catch { reject(new Error("Failed to parse Odoo session response")); }
        });
      }
    );
    req.on("error", (err) => reject(new Error(`Odoo unreachable: ${String(err)}`)));
    req.write(body);
    req.end();
  });

  if (json.error) {
    const msg = json.error.data?.message ?? json.error.message ?? "Authentication failed";
    throw new Error(msg);
  }

  const result = json.result;
  if (!result?.uid) {
    throw new Error("Invalid email or password. Please try again.");
  }

  return { ...result, session_id: sessionId || result.session_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// ORM helpers (admin credentials, for server functions only)
// ─────────────────────────────────────────────────────────────────────────────

async function odooAdminExecute<T>(
  db: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const uid = await odooCall<number | false>("common", "authenticate", [db, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD, {}]);
  if (!uid) throw new Error(`Odoo admin auth failed for database "${db}"`);
  return odooCall<T>("object", "execute_kw", [db, uid, ODOO_ADMIN_PASSWORD, model, method, args, kwargs]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Group / permission helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface OdooGroup {
  id: number;
  name: string;
  full_name: string;
  category_id: [number, string] | false;
  implied_ids: number[];
}

/**
 * Get group IDs for a user. Used to determine:
 *   - Is this user an owner? (has base.group_system)
 *   - Which app slugs can they access? (based on APP_ODOO_GROUPS mapping)
 */
export async function getUserGroupExternalIds(db: string, uid: number): Promise<string[]> {
  // Read the user's groups as external IDs (module.name format)
  const data = await odooAdminExecute<Array<{ id: number; groups_id: number[] }>>(
    db, "res.users", "read", [[uid]], { fields: ["groups_id"] }
  );
  const groupIds = data[0]?.groups_id ?? [];
  if (groupIds.length === 0) return [];

  // Get external IDs for those groups
  const extIds = await odooAdminExecute<Array<{ module: string; name: string; res_id: number }>>(
    db, "ir.model.data", "search_read",
    [[["model", "=", "res.groups"], ["res_id", "in", groupIds]]],
    { fields: ["module", "name", "res_id"] }
  );
  return extIds.map((e) => `${e.module}.${e.name}`);
}

/**
 * From a list of Odoo group external IDs, determine which app slugs the user can access.
 */
export function resolveAllowedAppSlugs(groupExtIds: string[], planAppSlugs: string[]): string[] {
  // Check which plan apps the user has the corresponding Odoo group for
  return planAppSlugs.filter((slug) => {
    const requiredGroup = APP_ODOO_GROUPS[slug];
    if (!requiredGroup) return false;
    return groupExtIds.includes(requiredGroup) || groupExtIds.includes("base.group_system");
  });
}

/**
 * Determine if a user is a shop owner/admin (has base.group_system).
 */
export function isOdooAdmin(groupExtIds: string[]): boolean {
  return groupExtIds.includes("base.group_system");
}

/**
 * Ensure that a shop owner user has all permission groups that Administrator (ID 2) has.
 * This guarantees that whenever new apps (like POS, Inventory, Accounting) are installed
 * or updated, the shop owner automatically receives the corresponding Manager/User groups.
 */
export async function ensureOwnerHasAllAppGroups(db: string, uid: number): Promise<void> {
  try {
    if (uid === 1 || uid === 2) return;
    const adminData = await odooAdminExecute<Array<{ groups_id: number[] }>>(
      db, "res.users", "read", [[2]], { fields: ["groups_id"] }
    );
    const ownerData = await odooAdminExecute<Array<{ groups_id: number[] }>>(
      db, "res.users", "read", [[uid]], { fields: ["groups_id"] }
    );
    if (!adminData[0]?.groups_id || !ownerData[0]?.groups_id) return;

    const adminGroups = new Set(adminData[0].groups_id);
    const ownerGroups = new Set(ownerData[0].groups_id);

    const missingGroups = [...adminGroups].filter((id) => !ownerGroups.has(id));
    if (missingGroups.length > 0) {
      console.log(`[ensureOwnerHasAllAppGroups] Granting ${missingGroups.length} missing groups to owner (uid ${uid}) on database "${db}"`);
      await odooAdminExecute(db, "res.users", "write", [
        [uid],
        { groups_id: missingGroups.map((id) => [4, id, 0]) },
      ]);
    }
  } catch (err) {
    console.warn(`[ensureOwnerHasAllAppGroups] Failed to sync owner groups on DB "${db}":`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee management
// ─────────────────────────────────────────────────────────────────────────────

export interface OdooEmployee {
  id: number;
  name: string;
  login: string;
  email: string;
  active: boolean;
  groups_id: number[];
}

/** Fetch all non-system shop employees (excludes admin, OdooBot, public user). */
export async function getShopEmployees(db: string): Promise<OdooEmployee[]> {
  return odooAdminExecute<OdooEmployee[]>(
    db, "res.users", "search_read",
    [[["share", "=", false], ["active", "in", [true, false]], ["id", "not in", [1, 2, 4]]]],
    { fields: ["id", "name", "login", "email", "active", "groups_id"], context: { active_test: false } }
  );
}

/** Resolve group IDs from external IDs (e.g. "point_of_sale.group_pos_user"). */
async function resolveGroupIds(db: string, groupExternalIds: string[]): Promise<number[]> {
  if (groupExternalIds.length === 0) return [];
  const records = await odooAdminExecute<Array<{ res_id: number }>>(
    db, "ir.model.data", "search_read",
    [[[
      ["model", "=", "res.groups"],
      ...groupExternalIds.map((ext) => {
        const [mod, name] = ext.split(".");
        return ["&", ["module", "=", mod], ["name", "=", name]];
      }).flat(),
    ]]],
    { fields: ["res_id"] }
  );
  return records.map((r) => r.res_id);
}

/** Resolve group external IDs for an array of app slugs. */
export async function resolveGroupIdsForSlugs(db: string, slugs: string[]): Promise<number[]> {
  const extIds = slugs.map((s) => APP_ODOO_GROUPS[s]).filter(Boolean);
  if (extIds.length === 0) return [];

  // Use a direct search_read approach — simpler than multi-AND
  const allExtIds = await odooAdminExecute<Array<{ module: string; name: string; res_id: number }>>(
    db, "ir.model.data", "search_read",
    [[["model", "=", "res.groups"]]],
    { fields: ["module", "name", "res_id"] }
  );
  const lookup = new Map(allExtIds.map((e) => [`${e.module}.${e.name}`, e.res_id]));
  return extIds.map((id) => lookup.get(id)).filter((id): id is number => id !== undefined);
}

async function getBaseUserGroupId(db: string): Promise<number | undefined> {
  const ext = await odooAdminExecute<Array<{ res_id: number }>>(
    db, "ir.model.data", "search_read",
    [[["module", "=", "base"], ["name", "=", "group_user"]]],
    { fields: ["res_id"], limit: 1 }
  );
  return ext[0]?.res_id;
}

/** Create a new employee res.user with access to specified app slugs. */
export async function createEmployee(
  db: string,
  name: string,
  login: string,
  password: string,
  appSlugs: string[]
): Promise<number> {
  const groupIds = await resolveGroupIdsForSlugs(db, appSlugs);
  // Add base internal user group (required for all employees)
  const baseGroupId = await getBaseUserGroupId(db);
  const allGroupIds = [...new Set([...(baseGroupId ? [baseGroupId] : []), ...groupIds])];

  return odooAdminExecute<number>(db, "res.users", "create", [{
    name,
    login,
    password,
    email: login,
    groups_id: allGroupIds.map((id) => [4, id, 0]),
    active: true,
  }]);
}

/** Update an existing employee's name, password, and app access. */
export async function updateEmployee(
  db: string,
  userId: number,
  patch: { name?: string; password?: string; appSlugs?: string[] }
): Promise<void> {
  const vals: Record<string, unknown> = {};
  if (patch.name) vals.name = patch.name;
  if (patch.password) vals.password = patch.password;
  if (patch.appSlugs) {
    const allManagedGroupIds = await resolveGroupIdsForSlugs(db, Object.keys(APP_ODOO_GROUPS));
    const selectedGroupIds = await resolveGroupIdsForSlugs(db, patch.appSlugs);
    const baseGroupId = await getBaseUserGroupId(db);

    // Selectively unlink only managed app groups that are not selected,
    // link selected app groups, and ensure base.group_user is always present.
    const toRemove = allManagedGroupIds.filter((id) => !selectedGroupIds.includes(id));
    const groupCommands: Array<[number, number, number]> = [];
    for (const id of toRemove) {
      groupCommands.push([3, id, 0]); // Unlink removed app group without touching other groups
    }
    for (const id of selectedGroupIds) {
      groupCommands.push([4, id, 0]); // Link selected app group
    }
    if (baseGroupId) {
      groupCommands.push([4, baseGroupId, 0]); // Ensure base.group_user (Internal User) is linked
    }
    vals.groups_id = groupCommands;
  }
  if (Object.keys(vals).length === 0) return;
  await odooAdminExecute(db, "res.users", "write", [[userId], vals]);
}

/** Deactivate an employee (soft delete — preserves data). */
export async function deactivateEmployee(db: string, userId: number): Promise<void> {
  await odooAdminExecute(db, "res.users", "write", [[userId], { active: false }]);
}

/** Re-activate a previously deactivated employee. */
export async function reactivateEmployee(db: string, userId: number): Promise<void> {
  await odooAdminExecute(db, "res.users", "write", [[userId], { active: true }], { context: { active_test: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shop profile (res.company)
// ─────────────────────────────────────────────────────────────────────────────

export interface OdooCompany {
  id: number;
  name: string;
  street: string | false;
  city: string | false;
  state_id: [number, string] | false;
  country_id: [number, string] | false;
  phone: string | false;
  email: string | false;
  vat: string | false; // GSTIN in India
  website: string | false;
}

/** Read the primary company record from a shop's Odoo database. */
export async function getOdooCompany(db: string): Promise<OdooCompany | null> {
  const records = await odooAdminExecute<OdooCompany[]>(
    db, "res.company", "search_read",
    [[]],
    { fields: ["id", "name", "street", "city", "phone", "email", "vat", "website"], limit: 1 }
  );
  return records[0] ?? null;
}

/** Update the primary company record (shop name, GSTIN, contact details). */
export async function updateOdooCompany(
  db: string,
  companyId: number,
  patch: Partial<{ name: string; street: string; city: string; phone: string; email: string; vat: string }>
): Promise<void> {
  await odooAdminExecute(db, "res.company", "write", [[companyId], patch]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POS config lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the ID of the first active pos.config in a shop's Odoo database.
 *
 * Called by the open-app route handler when opening the POS app, to construct
 * the direct POS URL: /pos/ui?config_id=<id>&db=<db>
 *
 * This bypasses the Odoo first-run onboarding wizard ("Choose your store type")
 * which appears when hitting /pos/ui or /odoo/point-of-sale without a config_id.
 *
 * Returns null if no pos.config exists or if the lookup fails — the caller should
 * fall back to /pos/ui (which at minimum won't redirect to Discuss/Inbox).
 */
export async function getPosConfigId(db: string): Promise<number | null> {
  try {
    const configs = await odooAdminExecute<{ id: number; name: string }[]>(
      db, "pos.config", "search_read",
      [[["active", "=", true]]],
      { fields: ["id", "name"], limit: 1, order: "id asc" }
    );
    if (configs.length > 0) {
      return configs[0].id;
    }

    console.log(`[getPosConfigId] No active pos.config found for database "${db}". Creating default...`);

    // Find the main company ID
    const companies = await odooAdminExecute<{ id: number; name: string }[]>(
      db, "res.company", "search_read",
      [[["id", ">", 0]]],
      { fields: ["id", "name"], limit: 1 }
    );
    const companyId = companies.length > 0 ? companies[0].id : 1;

    // Find the Cash payment method
    const paymentMethods = await odooAdminExecute<{ id: number; name: string }[]>(
      db, "pos.payment.method", "search_read",
      [[["is_cash_count", "=", true]]],
      { fields: ["id", "name"], limit: 1 }
    );
    const cashPaymentMethodIds: number[] = paymentMethods.length > 0
      ? [paymentMethods[0].id]
      : [];

    const configVals: Record<string, unknown> = {
      name: "Shop Counter",
      company_id: companyId,
      module_pos_restaurant: false,
      module_pos_hr: false,
    };

    if (cashPaymentMethodIds.length > 0) {
      configVals.payment_method_ids = [[6, 0, cashPaymentMethodIds]];
    }

    const configId = await odooAdminExecute<number>(
      db, "pos.config", "create",
      [configVals]
    );

    console.log(`[getPosConfigId] Dynamically created pos.config with ID ${configId} for database "${db}"`);
    return configId;
  } catch (err) {
    console.error(`[getPosConfigId] Failed to lookup/create pos.config:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check (used by error page)
// ─────────────────────────────────────────────────────────────────────────────

export async function isOdooReachable(): Promise<boolean> {
  try {
    await odooCall<any>("common", "version", []);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loyalty balance (Feature 6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the total loyalty points balance for a customer across ALL loyalty programs.
 *
 * Reads loyalty.card records where partner_id = partnerId and sums the `points`
 * field. A customer may have cards on multiple programs; all are summed into a
 * single number for v1's simple display.
 *
 * Security: always called with the shop's session.odooDb — never accept a db
 * name from user input to prevent cross-shop data access. Per-database Odoo
 * isolation provides the primary boundary.
 *
 * @param db         The shop's Odoo database name (from session only, never user input)
 * @param partnerId  The Odoo partner (res.partner) ID for the customer
 * @returns          Total points across all loyalty cards; 0 if no cards exist; never throws.
 */
export async function getLoyaltyBalanceForCustomer(
  db: string,
  partnerId: number,
): Promise<number> {
  try {
    const cards = await odooAdminExecute<{ id: number; points: number }[]>(
      db,
      "loyalty.card",
      "search_read",
      [[["partner_id", "=", partnerId]]],
      { fields: ["id", "points"] },
    );

    if (!cards || cards.length === 0) {
      // First-time customer with no loyalty card yet — return 0, never throw
      return 0;
    }

    // Sum points across all loyalty cards (customer may have cards on multiple programs)
    return cards.reduce((total, card) => total + (card.points ?? 0), 0);
  } catch (err) {
    // If loyalty module isn't installed or query fails, return 0 gracefully —
    // never expose a loyalty-read failure to the merchant UI.
    console.warn(
      `[getLoyaltyBalanceForCustomer] Failed to read loyalty.card for partner ${partnerId} on DB "${db}":`,
      err,
    );
    return 0;
  }
}
