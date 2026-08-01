/**
 * Central config — every brand/domain/env reference in the app reads from here.
 * Renaming "Kirana" to your real brand means changing BRAND_NAME in .env only.
 */

/** Human-readable product brand name. Shown in page titles, emails, UI copy. */
export const BRAND_NAME = process.env.BRAND_NAME ?? "Kirana";

/** Base domain for shop subdomains. e.g. "kirana.dev" → "shopname.kirana.dev" */
export const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "kirana.dev";

/** Odoo backend URL (internal — not exposed to browser). */
export const ODOO_URL = process.env.ODOO_URL ?? "http://localhost:8069";
export const ODOO_ADMIN_LOGIN = process.env.ODOO_ADMIN_LOGIN ?? "admin";
export const ODOO_ADMIN_PASSWORD = process.env.ODOO_ADMIN_PASSWORD ?? "admin";

/** Supabase — same project as the Super Admin Panel. */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Session cookie signing secret — must be a long random string in production. */
export const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-secret-do-not-use-in-production";

/** Name of the httpOnly session cookie set in the browser. */
export const SESSION_COOKIE_NAME = "kiranaSession";

/** Session lifetime in seconds (8 hours). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * Map from Supabase app slug → Odoo URL path (Odoo 18 unified web client paths).
 * These are served under /odoo/* or /pos/* (proxied from our domain via Vite dev / Nginx prod).
 *
 * ROUTING STRATEGY (Odoo 18):
 *   Odoo 18's client-side router resolves each /odoo/<segment> as an action lookup.
 *   Only path segments explicitly registered via a `path` field in an ir.actions record
 *   are valid — guessing sub-paths like /odoo/inventory/products DOES NOT WORK because
 *   'products' is not a registered path in the stock module.
 *
 *   Safe approach: use /odoo/action-<module>.<xml_id> which bypasses path registration
 *   entirely and directly loads the exact action record. This is stable across Odoo
 *   upgrades regardless of whether a friendly short path is registered.
 *
 * SPECIAL CASE — pos:
 *   The value "/pos/ui" is a base path. The open-app route handler will:
 *   1. Look up the shop's pos.config ID via Odoo RPC (odooGetPosConfigId)
 *   2. Append ?config_id=<id>&db=<db> to open the correct session directly
 *   Without config_id, Odoo redirects to the POS backend menu — not the live POS.
 *
 * To add a new app: add a row in the Supabase apps table AND add its path here.
 * To verify a path: open the raw Odoo backend, navigate to the exact target screen,
 * and copy the resulting /odoo/... URL. If it has a sub-segment not listed in the
 * module's xml path registrations, use /odoo/action-<xmlid> instead.
 */
export const APP_ODOO_PATHS: Record<string, string> = {
  // POS — handled specially in open-app/$slug.tsx (appends ?config_id=<id>)
  pos: "/pos/ui",

  // Inventory → Product list with on-hand quantities.
  // Verified: 'products' is NOT a registered path in the stock module (Odoo 18 source).
  // stock.picking_type_action_kanban has path='inventory' (the Operations overview).
  // stock.product_template_action_product has NO friendly path — must use action-xmlid.
  inventory: "/odoo/action-stock.product_template_action_product",

  // Sales → Quotations / Sales Orders list.
  // 'sales' is the registered path for sale.action_quotations_with_onboarding (sale module).
  sales: "/odoo/sales",

  // Accounting → Customer Invoices (most relevant landing for a retail shop).
  // 'accounting' is the registered path for the Accounting app root action.
  accounting: "/odoo/accounting",

  // Employees → Employee list.
  // 'employees' is the registered path for hr.open_view_employee_list_my in the hr module.
  employees: "/odoo/employees",

  // Purchase → Purchase Orders list.
  // 'purchase' is the registered path for purchase.purchase_rfq in the purchase module.
  purchase: "/odoo/purchase",

  // barcodes: no standalone app screen — scanning capability is embedded in
  // POS and Inventory. No path entry needed; the module just enables scanning.
};

/**
 * Map from Supabase app slug → Odoo permission group external ID.
 * Used when creating/updating employee access in res.groups.
 *
 * Owners get base.group_system (admin).
 * Employees get only the groups for their assigned app slugs.
 */
export const APP_ODOO_GROUPS: Record<string, string> = {
  pos: "point_of_sale.group_pos_user",
  inventory: "stock.group_stock_user",
  sales: "sales_team.group_sale_salesman",
  accounting: "account.group_account_user",
  employees: "hr.group_hr_user",
  // barcodes: no dedicated group — all internal users can scan barcodes.
  // purchase: standard purchaser group.
  purchase: "purchase.group_purchase_user",
};

/**
 * Fallback icon name (lucide-react) when app has no icon set in Supabase.
 */
export const APP_FALLBACK_ICON = "LayoutGrid";
