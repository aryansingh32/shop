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
import { URL } from "node:url";
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
  const baseUserExtId = await odooAdminExecute<Array<{ res_id: number }>>(
    db, "ir.model.data", "search_read",
    [[["module", "=", "base"], ["name", "=", "group_user"]]],
    { fields: ["res_id"], limit: 1 }
  );
  const baseGroupId = baseUserExtId[0]?.res_id;
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
    const groupIds = await resolveGroupIdsForSlugs(db, patch.appSlugs);
    // Replace all groups: first clear (5 = unlink all), then set new
    vals.groups_id = [[5, 0, 0], ...groupIds.map((id) => [4, id, 0])];
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
