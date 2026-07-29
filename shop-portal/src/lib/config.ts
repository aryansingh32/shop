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
 * These are served under /odoo/* (proxied from our domain via Vite dev / Nginx prod).
 *
 * To add a new app: add a row in the Supabase apps table AND add its path here.
 */
export const APP_ODOO_PATHS: Record<string, string> = {
  pos: "/odoo/point-of-sale",
  inventory: "/odoo/inventory",
  sales: "/odoo/sales",
  accounting: "/odoo/accounting",
  employees: "/odoo/employees",
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
};

/**
 * Fallback icon name (lucide-react) when app has no icon set in Supabase.
 */
export const APP_FALLBACK_ICON = "LayoutGrid";
