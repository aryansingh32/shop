/**
 * Odoo JSON-RPC Client
 *
 * Wraps Odoo's /jsonrpc endpoint for database management and ORM operations.
 * Odoo exposes three services via JSON-RPC:
 *   - "common" : version info, authentication
 *   - "db"     : database create/drop/list (requires master password)
 *   - "object" : ORM execute_kw (requires per-DB auth uid)
 *
 * No external npm dependencies — uses native fetch.
 */

import http from "node:http";
import https from "node:https";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const ODOO_URL = process.env.ODOO_URL ?? "http://localhost:8069";
const MASTER_PASSWORD = process.env.ODOO_MASTER_PASSWORD ?? "superadmin";
const ADMIN_LOGIN = process.env.ODOO_ADMIN_LOGIN ?? "admin";
const ADMIN_PASSWORD = process.env.ODOO_ADMIN_PASSWORD ?? "admin";

export { ODOO_URL, MASTER_PASSWORD, ADMIN_LOGIN, ADMIN_PASSWORD };

// ─────────────────────────────────────────────────────────────────────────────
// Low-level JSON-RPC caller
// ─────────────────────────────────────────────────────────────────────────────

let _rpcId = 1;

export async function odooCall<T = unknown>(
  service: "common" | "db" | "object",
  method: string,
  args: unknown[],
): Promise<T> {
  const id = _rpcId++;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    id,
    params: { service, method, args },
  });

  const url = new URL(`${ODOO_URL}/jsonrpc`);
  const client = url.protocol === "https:" ? https : http;

  const json = await new Promise<any>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 0, // Never time out on long module installations or db creations
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Odoo HTTP error ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Odoo response: ${data.slice(0, 100)}...`));
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`Odoo unreachable at ${ODOO_URL}. Is the Docker container running? (${String(err)})`));
    });

    req.write(body);
    req.end();
  });

  if (json.error) {
    const detail =
      json.error.data?.message ?? json.error.message ?? "Unknown Odoo error";
    throw new Error(`Odoo RPC error [${method}]: ${detail}`);
  }

  return json.result as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Common service
// ─────────────────────────────────────────────────────────────────────────────

/** Authenticate against a specific Odoo database. Returns uid or throws. */
export async function odooAuthenticate(
  db: string,
  login: string,
  password: string,
): Promise<number> {
  const uid = await odooCall<number | false>("common", "authenticate", [
    db,
    login,
    password,
    {},
  ]);
  if (!uid) {
    throw new Error(
      `Odoo authentication failed for login "${login}" on database "${db}"`,
    );
  }
  return uid;
}

/** Returns Odoo server version string (no auth needed). */
export async function odooServerVersion(): Promise<string> {
  const info = await odooCall<{ server_version: string }>(
    "common",
    "version",
    [],
  );
  return info.server_version;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB service (require master password)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new Odoo database.
 * This calls `create_database` on the db service.
 * NOTE: This is a BLOCKING call on Odoo's side — it installs the `base` module.
 * Module-level app installs happen separately via execute_kw.
 *
 * @param dbName   Name for the new database (e.g. "shop_abc123")
 * @param login    Admin login to set (e.g. owner's email)
 * @param password Admin password to set on the new DB
 * @param lang     Language code (default: "en_IN")
 * @param country  Country code (default: "IN")
 */
export async function odooDbCreate(
  dbName: string,
  login: string,
  password: string,
  lang = "en_IN",
  country = "IN",
): Promise<true> {
  return odooCall<true>("db", "create_database", [
    MASTER_PASSWORD,
    dbName,
    false, // demo data: false
    lang,
    password,
    login,
    country,
  ]);
}

/** Check whether an Odoo database exists. */
export async function odooDbExists(dbName: string): Promise<boolean> {
  return odooCall<boolean>("db", "db_exist", [dbName]);
}

/** Drop an Odoo database (irreversible). */
export async function odooDbDrop(dbName: string): Promise<boolean> {
  return odooCall<boolean>("db", "drop", [MASTER_PASSWORD, dbName]);
}

/** List all Odoo databases. */
export async function odooDbList(): Promise<string[]> {
  return odooCall<string[]>("db", "list", []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Object / ORM service (requires authenticated uid)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call an ORM method on an Odoo model.
 * Equivalent to: model.method(*args, **kwargs)
 */
export async function odooExecute<T = unknown>(
  db: string,
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  return odooCall<T>("object", "execute_kw", [
    db,
    uid,
    password,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level helpers (auth + execute in one call)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate as the admin user for a given database, then execute an ORM call.
 * Used for all module installation and user management operations.
 */
export async function odooAdminExecute<T = unknown>(
  db: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  options?: { login?: string; password?: string },
): Promise<T> {
  const logins = Array.from(new Set([options?.login, ADMIN_LOGIN, "admin"])).filter(Boolean) as string[];
  const passwords = Array.from(new Set([options?.password, ADMIN_PASSWORD, "admin"])).filter(Boolean) as string[];

  let lastErr: Error | null = null;
  for (const login of logins) {
    for (const pwd of passwords) {
      try {
        const uid = await odooAuthenticate(db, login, pwd);
        if (uid) {
          return await odooExecute<T>(db, uid, pwd, model, method, args, kwargs);
        }
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastErr || new Error(`Odoo admin authentication failed for database "${db}".`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module management
// ─────────────────────────────────────────────────────────────────────────────

export type OdooModuleState =
  | "installed"
  | "uninstalled"
  | "to install"
  | "to upgrade"
  | "to remove"
  | "uninstallable";

export interface OdooModule {
  id: number;
  name: string;
  state: OdooModuleState;
  shortdesc: string;
}

/** Search for modules by technical name and return their records. */
export async function odooFindModules(
  db: string,
  moduleNames: string[],
): Promise<OdooModule[]> {
  return odooAdminExecute<OdooModule[]>(
    db,
    "ir.module.module",
    "search_read",
    [[["name", "in", moduleNames]]],
    { fields: ["id", "name", "state", "shortdesc"] },
  );
}

/** Return all installed modules on a database. */
export async function odooListInstalledModules(db: string): Promise<OdooModule[]> {
  return odooAdminExecute<OdooModule[]>(
    db,
    "ir.module.module",
    "search_read",
    [[["state", "=", "installed"], ["name", "not like", "test_"]]],
    { fields: ["id", "name", "state", "shortdesc"], limit: 200 },
  );
}

/**
 * Install Odoo modules on a database.
 * Uses `button_immediate_install` which is synchronous on Odoo's side.
 * For large modules (point_of_sale, etc.) this may take 1-5 minutes.
 */
export async function odooInstallModules(
  db: string,
  moduleNames: string[],
): Promise<void> {
  if (moduleNames.length === 0) return;

  // Find the IDs of uninstalled modules
  const modules = await odooFindModules(db, moduleNames);
  const toInstall = modules
    .filter((m) => m.state !== "installed")
    .map((m) => m.id);

  if (toInstall.length === 0) {
    return; // All already installed
  }

  await odooAdminExecute(
    db,
    "ir.module.module",
    "button_immediate_install",
    [toInstall],
  );
}

/**
 * Uninstall Odoo modules on a database.
 * Uses `button_immediate_uninstall`.
 */
export async function odooUninstallModules(
  db: string,
  moduleNames: string[],
): Promise<void> {
  if (moduleNames.length === 0) return;

  const modules = await odooFindModules(db, moduleNames);
  const toUninstall = modules
    .filter((m) => m.state === "installed")
    .map((m) => m.id);

  if (toUninstall.length === 0) return;

  await odooAdminExecute(
    db,
    "ir.module.module",
    "button_immediate_uninstall",
    [toUninstall],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// User / employee management
// ─────────────────────────────────────────────────────────────────────────────

export interface OdooUser {
  id: number;
  name: string;
  login: string;
  email: string;
  active: boolean;
  groups_id: number[];
}

/** Fetch all non-internal-system users from an Odoo database. */
export async function odooGetUsers(db: string): Promise<OdooUser[]> {
  // Exclude odoo bot (id=2) and public user (id=4) via domain
  return odooAdminExecute<OdooUser[]>(
    db,
    "res.users",
    "search_read",
    [[["share", "=", false], ["id", "not in", [2, 4]]]],
    {
      fields: ["id", "name", "login", "email", "active", "groups_id"],
      limit: 100,
    },
  );
}

/**
 * Deactivate all non-admin users on an Odoo database.
 * Used to block shop access on subscription suspension.
 */
export async function odooDeactivateUsers(db: string): Promise<void> {
  const users = await odooGetUsers(db);
  // Keep admin (id=2 is OdooBot, id=1 is the admin superuser)
  const toDeactivate = users
    .filter((u) => u.active && u.id !== 1 && u.id !== 2)
    .map((u) => u.id);

  if (toDeactivate.length === 0) return;

  const uid = await odooAuthenticate(db, ADMIN_LOGIN, ADMIN_PASSWORD);
  await odooExecute(db, uid, ADMIN_PASSWORD, "res.users", "write", [
    toDeactivate,
    { active: false },
  ]);
}

/**
 * Reactivate all non-admin users on an Odoo database.
 * Used when a suspended shop is reactivated.
 */
export async function odooReactivateUsers(db: string): Promise<void> {
  // Must use context={'active_test': False} to find inactive users
  const uid = await odooAuthenticate(db, ADMIN_LOGIN, ADMIN_PASSWORD);
  const users = await odooExecute<OdooUser[]>(
    db,
    uid,
    ADMIN_PASSWORD,
    "res.users",
    "search_read",
    [[["share", "=", false], ["id", "not in", [1, 2]]]],
    {
      fields: ["id", "active"],
      context: { active_test: false },
    },
  );

  const toReactivate = users.map((u) => u.id);
  if (toReactivate.length === 0) return;

  await odooExecute(db, uid, ADMIN_PASSWORD, "res.users", "write", [
    toReactivate,
    { active: true },
  ]);
}

/** Create a new user in the Odoo database and grant admin rights. */
export async function odooCreateUser(
  db: string,
  email: string,
  password: string,
  name: string = "Shop Owner"
): Promise<number> {
  const extIds = await odooAdminExecute<{res_id: number}[]>(
    db, "ir.model.data", "search_read",
    [[["module", "=", "base"], ["name", "=", "group_system"]]],
    { fields: ["res_id"], limit: 1 }
  );
  const adminGroupId = extIds.length > 0 ? extIds[0].res_id : null;

  // Retrieve Administrator (ID 2) groups to clone them for the shop owner
  let groupIds: number[] = [];
  try {
    const adminUserData = await odooAdminExecute<Array<{ groups_id: number[] }>>(
      db, "res.users", "read", [[2]], { fields: ["groups_id"] }
    );
    if (adminUserData.length > 0) {
      groupIds = adminUserData[0].groups_id;
    }
  } catch (err) {
    console.warn(`[odooCreateUser] Failed to read admin (ID 2) groups:`, err);
  }

  const vals: Record<string, any> = {
    name,
    login: email,
    password,
    email,
  };

  if (groupIds.length > 0) {
    // Replace all groups with the cloned ones
    vals.groups_id = [[6, 0, groupIds]];
  } else if (adminGroupId) {
    vals.groups_id = [[4, adminGroupId, 0]];
  }

  // Set a sensible default home action for this user.
  // Without this, Odoo resolves the "first accessible menu" when no action is in the URL,
  // which tends to be Discuss/Inbox (mail is a dependency of most modules and sorts early).
  // We use the Inventory Products action as the home screen — it's the most universally
  // relevant landing screen for a retail shop owner (all plans include Inventory).
  // Resolved via xmlid lookup to avoid hardcoding a numeric ID that differs per database.
  try {
    const actionRefs = await odooAdminExecute<{res_id: number}[]>(
      db, "ir.model.data", "search_read",
      [[["module", "=", "stock"], ["name", "=", "product_template_action_product"]]],
      { fields: ["res_id"], limit: 1 }
    );
    if (actionRefs.length > 0) {
      vals.action_id = actionRefs[0].res_id;
    }
  } catch {
    // Non-fatal: if the action lookup fails (e.g. stock not installed yet),
    // the user is still created without a default action. The portal always
    // deep-links to the correct screen anyway; this is just a defense-in-depth
    // guard for direct backend access (support/debugging).
  }

  const userId = await odooAdminExecute<number>(
    db, "res.users", "create",
    [vals]
  );
  
  return userId;
}

/** Reset password for ALL internal admin/staff users in the shop Odoo DB natively via Odoo ORM */
export async function resetOdooUserPasswordPg(
  dbName: string,
  newPassword: string,
): Promise<void> {
  const safePassword = newPassword.replace(/'/g, "\\'");

  const pythonCmd = `import odoo; odoo.tools.config.parse_config(['-c', '/etc/odoo/odoo.conf']); registry = odoo.registry('${dbName}'); cr = registry.cursor(); env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {}); users = env['res.users'].search([('share', '=', False)]); users.write({'password': '${safePassword}'}); cr.commit(); cr.close()`;

  const cmd = `docker exec odoo python3 -c "${pythonCmd}"`;
  await execAsync(cmd);
}

/**
 * Create a minimal pos.config record on a freshly provisioned database.
 *
 * This is required so shops can open the POS directly at /pos/ui?config_id=<id>
 * without hitting Odoo's first-run onboarding wizard ("Choose your store type").
 * The wizard appears when no pos.config exists — creating one here at provisioning
 * time ensures the shop is always in a ready-to-use state.
 *
 * @param db   The shop's Odoo database name
 * @param name Display name for the POS register (e.g. "Shop Counter")
 * @returns    The ID of the created pos.config record
 */
export async function odooCreatePosConfig(
  db: string,
  name: string = "Shop Counter",
): Promise<number> {
  // Find the main company ID (always ID 1 for a single-company install)
  const companies = await odooAdminExecute<{ id: number; name: string }[]>(
    db, "res.company", "search_read",
    [[["id", ">", 0]]],
    { fields: ["id", "name"], limit: 1 }
  );
  const companyId = companies.length > 0 ? companies[0].id : 1;

  // Find the Cash payment method — installed automatically with point_of_sale.
  // Match on is_cash_count = true (the Odoo 18 boolean for cash-type methods).
  const paymentMethods = await odooAdminExecute<{ id: number; name: string }[]>(
    db, "pos.payment.method", "search_read",
    [[["is_cash_count", "=", true]]],
    { fields: ["id", "name"], limit: 1 }
  );
  const cashPaymentMethodIds: number[] = paymentMethods.length > 0
    ? [paymentMethods[0].id]
    : [];

  // Create the POS config.
  // Minimal values: only what's needed for a working checkout.
  // Restaurant / multi-POS / IoT settings are explicitly disabled.
  const configVals: Record<string, unknown> = {
    name,
    company_id: companyId,
    // Retail shop: disable restaurant mode
    module_pos_restaurant: false,
    // Access managed via portal groups — no employee PIN switching
    module_pos_hr: false,
  };

  if (cashPaymentMethodIds.length > 0) {
    // many2many replace command: [(6, 0, [ids])]
    configVals.payment_method_ids = [[6, 0, cashPaymentMethodIds]];
  }

  const configId = await odooAdminExecute<number>(
    db, "pos.config", "create",
    [configVals]
  );

  return configId;
}

/**
 * Ensure all shop owners (human internal users with admin/system access)
 * have all permission groups that Administrator (ID 2) has.
 * Should be called after installing new modules or provisioning a shop.
 */
export async function syncOwnerGroupsAfterModuleInstall(db: string): Promise<void> {
  try {
    const adminUserData = await odooAdminExecute<Array<{ groups_id: number[] }>>(
      db, "res.users", "read", [[2]], { fields: ["groups_id"] }
    );
    if (!adminUserData[0]?.groups_id) return;
    const adminGroups = new Set(adminUserData[0].groups_id);

    const owners = await odooAdminExecute<Array<{ id: number; groups_id: number[] }>>(
      db, "res.users", "search_read",
      [[["share", "=", false], ["id", ">", 4]]],
      { fields: ["id", "groups_id"] }
    );

    for (const owner of owners) {
      const ownerGroups = new Set(owner.groups_id);
      const missing = [...adminGroups].filter((id) => !ownerGroups.has(id));
      if (missing.length > 0) {
        await odooAdminExecute(db, "res.users", "write", [
          [owner.id],
          { groups_id: missing.map((id) => [4, id, 0]) },
        ]);
      }
    }
  } catch (err) {
    console.warn(`[syncOwnerGroupsAfterModuleInstall] Failed to sync owner groups on DB "${db}":`, err);
  }
}

/**
 * Create a default points-based loyalty program on a freshly provisioned database.
 *
 * This is called at provisioning time when the 'loyalty' module is being installed.
 * It creates one default program so merchants can immediately use the POS loyalty
 * UI without needing to configure it manually in the Odoo backend.
 *
 * IMPORTANT: This function's failure is deliberately NON-FATAL in provisionShop().
 * A shop can operate normally without a loyalty program — only POS-config absence
 * is a fatal provisioning blocker. See the comment in provisioning.ts for full
 * rationale. Do not change this to fatal by copying the POS-config pattern.
 *
 * Field assumptions (Odoo 18 CE loyalty.program model):
 *   program_type: 'loyalty'  — standard points-earn + redeem program
 *   applies_on:  'both'      — POS + Sales orders
 *   trigger:     'auto'      — points earned automatically on every eligible order
 * REVIEWER: verify these field names/values against a live Odoo 18 CE instance
 * before the first production deploy — they are based on source inspection, not
 * a live test.
 *
 * Default rule: 1 point per ₹100 spent (tune with product post-launch).
 *
 * @param db   The shop's Odoo database name
 * @returns    The ID of the created loyalty.program record
 */
export async function odooCreateLoyaltyProgram(db: string): Promise<number> {
  // Find the main company ID — same lookup pattern as odooCreatePosConfig.
  const companies = await odooAdminExecute<{ id: number; name: string }[]>(
    db, "res.company", "search_read",
    [[[ "id", ">", 0]]],
    { fields: ["id", "name"], limit: 1 }
  );
  const companyId = companies.length > 0 ? companies[0].id : 1;

  // Create the loyalty program with minimal required fields.
  // program_type / applies_on / trigger: ASSUMPTION — verify field names against
  // a live Odoo 18 CE instance. Flagged in PR description.
  const programVals: Record<string, unknown> = {
    name: "Loyalty Points",
    program_type: "loyalty",   // ASSUMPTION: standard points-earn program
    applies_on: "both",        // ASSUMPTION: POS + Sales
    trigger: "auto",           // ASSUMPTION: auto-award on every order
    company_id: companyId,
  };

  const programId = await odooAdminExecute<number>(
    db, "loyalty.program", "create",
    [programVals]
  );

  // Create default earning rule: 1 point per ₹100 spent.
  // "Default, tune with product" — not a hard business requirement.
  const ruleVals: Record<string, unknown> = {
    program_id: programId,
    reward_point_amount: 1,       // 1 point awarded per qualifying unit
    minimum_amount: 100,          // ₹100 spend per point (tune with product)
    minimum_amount_tax_mode: "incl", // ASSUMPTION: tax inclusive
    minimum_qty: 0,               // no minimum quantity required
  };

  try {
    await odooAdminExecute(db, "loyalty.rule", "create", [ruleVals]);
  } catch (ruleErr) {
    // Rule creation is non-fatal: the program exists and is usable without a
    // pre-configured rule — the merchant can add rules manually in the Odoo UI.
    console.warn(
      `[odooCreateLoyaltyProgram] Failed to create default earning rule on DB "${db}" (non-fatal):`,
      ruleErr,
    );
  }

  return programId;
}
