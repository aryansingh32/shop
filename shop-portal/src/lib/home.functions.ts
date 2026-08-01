/**
 * Home screen server function — Feature 3
 *
 * Provides the data for the "answers-first" Home screen:
 *   - Today's Sales total (₹)
 *   - Today's Profit estimate (₹)  — OWNER ONLY
 *   - Low stock count              — only if 'inventory'/'stock' app enabled
 *
 * IMPORTANT — RBAC:
 *   The function returns different response shapes for owner vs employee sessions.
 *   For employee sessions, salesTotal and profitTotal are OMITTED ENTIRELY from
 *   the returned object (not set to null, not set to 0 — the keys are absent).
 *   This is a server-side enforcement: an employee cannot read financial totals
 *   even by inspecting the network response.
 *
 * IMPORTANT — RPC call budget:
 *   Target ≤ 4 Odoo RPC calls regardless of shop size. Uses read_group aggregation
 *   for sales totals to avoid fetching all orders and summing in JS.
 *   This endpoint is called on every Home screen open.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { readSessionFromCookies } from "./session";
import { isOdooAdmin } from "./odoo";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Owner session response — all fields present */
export interface HomeSummaryOwner {
  /** Sales total for today (₹) — sum of amount_total on paid pos.orders */
  salesTotal: number;
  /**
   * Profit estimate for today (₹).
   * Formula: sum(price_subtotal - standard_price * qty) for today's paid POS order lines.
   * NOT a full accounting P&L — a merchant-facing approximation.
   * Document: "Profit estimate = sale price minus cost price (standard_price) per line,
   * summed for today's paid orders. Not a full accounting P&L — a merchant-facing approximation."
   */
  profitTotal: number;
  /** Number of products with qty_available < LOW_STOCK_THRESHOLD. Absent if stock app not enabled. */
  lowStockCount?: number;
}

/** Employee session response — financial data excluded server-side */
export interface HomeSummaryEmployee {
  /** Absent entirely — employees cannot see sales totals */
  salesTotal?: never;
  /** Absent entirely — employees cannot see profit data */
  profitTotal?: never;
  /** Low stock count still visible to employees (not sensitive) */
  lowStockCount?: number;
}

export type HomeSummary = HomeSummaryOwner | HomeSummaryEmployee;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Threshold below which a product's qty_available is flagged as "low stock."
 * Default: 5 units. This is a product-defined heuristic for shops that have
 * not configured Odoo reorder points. When reorder points are configured for
 * a product, Odoo's own orderpoint qty_to_order is more precise — but reading
 * that requires an additional query and is deferred to a future enhancement.
 * Change this value in one place only; do not duplicate it.
 */
const LOW_STOCK_THRESHOLD = 5;

/**
 * Timezone for date boundary calculations.
 * Hardcoded to Asia/Kolkata (IST) for the initial India-only market.
 * Per-shop timezone configuration via res.company is a future enhancement
 * once timezone data is reliably set during provisioning.
 */
const SHOP_TIMEZONE = "Asia/Kolkata";

// ─────────────────────────────────────────────────────────────────────────────
// Date helper — shared with reports.functions.ts (Feature 7) via this file
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the start and end of the current calendar day in the shop's timezone,
 * formatted as Odoo-compatible datetime strings (UTC, no timezone suffix).
 *
 * Odoo stores datetimes in UTC internally. We compute the local midnight in
 * IST, then convert to UTC for the domain filter.
 */
export function getTodayBoundsUTC(): { start: string; end: string } {
  // Current time in IST
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const todayISTDate = istFormatter.format(now); // e.g. "2026-08-02"

  // Midnight IST = todayISTDate 00:00:00+05:30 in UTC = todayISTDate - 1 day 18:30:00 UTC
  // (IST is UTC+5:30, so subtract 5h30m from IST midnight to get UTC)
  const midnightIST = new Date(`${todayISTDate}T00:00:00+05:30`);
  const endOfDayIST = new Date(`${todayISTDate}T23:59:59+05:30`);

  function toOdooDatetime(d: Date): string {
    return d.toISOString().slice(0, 19).replace("T", " ");
  }

  return {
    start: toOdooDatetime(midnightIST),
    end: toOdooDatetime(endOfDayIST),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Odoo admin execute (local helper matching shop-portal's odoo.ts private fn)
// ─────────────────────────────────────────────────────────────────────────────

// We import from odoo.ts but the odooAdminExecute fn there is module-private.
// To avoid coupling, we make the dependency explicit via the exported functions
// we already need (getLoyaltyBalanceForCustomer etc.) and call the admin fn
// through a thin wrapper. In practice the functions we need are exported in
// odoo.ts so we import them. For the raw RPC we need here, we duplicate the
// tiny call pattern rather than adding a new export to odoo.ts.
import http from "node:http";
import https from "node:https";
import { ODOO_URL, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD } from "./config";

let _rpcId = 100;

async function rpcCall<T>(service: string, method: string, args: unknown[]): Promise<T> {
  const id = _rpcId++;
  const body = JSON.stringify({ jsonrpc: "2.0", method: "call", id, params: { service, method, args } });
  const url = new URL(`${ODOO_URL}/jsonrpc`);
  const client = url.protocol === "https:" ? https : http;

  const json = await new Promise<any>((resolve, reject) => {
    const req = client.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 30_000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Failed to parse Odoo response")); }
      });
    });
    req.on("error", (err) => reject(new Error(`Odoo unreachable: ${String(err)}`)));
    req.write(body);
    req.end();
  });

  if (json.error) throw new Error(`Odoo RPC [${method}]: ${json.error.data?.message ?? json.error.message}`);
  return json.result as T;
}

async function adminExecute<T>(
  db: string, model: string, method: string,
  args: unknown[] = [], kwargs: Record<string, unknown> = {},
): Promise<T> {
  const uid = await rpcCall<number | false>("common", "authenticate", [db, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD, {}]);
  if (!uid) throw new Error(`Odoo admin auth failed for "${db}"`);
  return rpcCall<T>("object", "execute_kw", [db, uid, ODOO_ADMIN_PASSWORD, model, method, args, kwargs]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server function
// ─────────────────────────────────────────────────────────────────────────────

export const getHomeSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeSummary> => {
    const request = getRequest();
    const session = readSessionFromCookies(request.headers.get("cookie"));
    if (!session) throw new Error("Not authenticated");

    const db = session.odooDb;
    const isOwner = session.isOwner;
    const hasStock = session.allowedAppSlugs.includes("inventory") || session.allowedAppSlugs.includes("stock");

    const { start: todayStart, end: todayEnd } = getTodayBoundsUTC();

    // ── RPC call 1: Today's POS orders aggregated total ──
    // Uses read_group with sum to avoid fetching individual orders.
    // Bounded to a single RPC call regardless of order volume.
    let salesTotal = 0;
    let profitTotal = 0;

    if (isOwner) {
      // Only compute financial totals for owners — employees never receive these fields.
      // RPC CALL 1: aggregate POS order totals for today
      type OrderGroup = { amount_total: number; __count: number };
      const orderGroups = await adminExecute<OrderGroup[]>(
        db, "pos.order", "read_group",
        [[
          ["date_order", ">=", todayStart],
          ["date_order", "<=", todayEnd],
          ["state", "in", ["paid", "done", "invoiced"]],
        ]],
        {
          fields: ["amount_total:sum"],
          groupby: [],
          lazy: false,
        },
      );
      salesTotal = orderGroups[0]?.amount_total ?? 0;

      // RPC CALL 2: POS order lines for today (for profit calculation)
      // We fetch lines with price_subtotal and qty — for a single shop,
      // today's line count is small (typically < 500). We do NOT fetch standard_price
      // here; instead we do a batch product lookup (RPC CALL 3).
      //
      // Profit estimate formula (product-defined approximation, not a full P&L):
      // profit = sum(price_subtotal - standard_price * qty) for today's paid order lines.
      // Document: "Profit estimate = sale price minus cost price (standard_price) per line,
      // summed for today's paid orders. Not a full accounting P&L — a merchant-facing approximation."
      type OrderLine = { product_id: [number, string] | false; price_subtotal: number; qty: number };
      const lines = await adminExecute<OrderLine[]>(
        db, "pos.order.line", "search_read",
        [[
          ["order_id.date_order", ">=", todayStart],
          ["order_id.date_order", "<=", todayEnd],
          ["order_id.state", "in", ["paid", "done", "invoiced"]],
        ]],
        { fields: ["product_id", "price_subtotal", "qty"] },
      );

      if (lines.length > 0) {
        // Collect distinct product IDs for the batch cost lookup
        const productIds = [...new Set(
          lines
            .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null))
            .filter((id): id is number => id !== null),
        )];

        // RPC CALL 3: Batch fetch standard_price for all products in today's orders
        type ProductCost = { id: number; standard_price: number };
        const products = productIds.length > 0
          ? await adminExecute<ProductCost[]>(
              db, "product.product", "read",
              [productIds],
              { fields: ["id", "standard_price"] },
            )
          : [];

        const costMap = new Map(products.map((p) => [p.id, p.standard_price ?? 0]));

        profitTotal = lines.reduce((total, line) => {
          const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
          const cost = productId !== null ? (costMap.get(productId) ?? 0) : 0;
          return total + (line.price_subtotal - cost * line.qty);
        }, 0);
      }
    }

    // ── RPC CALL 4: Low stock count (only if stock app enabled) ──
    let lowStockCount: number | undefined;
    if (hasStock) {
      lowStockCount = await adminExecute<number>(
        db, "product.product", "search_count",
        [[
          ["type", "=", "product"],          // storable products only (not services/consumables)
          ["active", "=", true],
          ["qty_available", "<", LOW_STOCK_THRESHOLD],
        ]],
      );
    }

    // ── Build response ──
    // SECURITY: employee sessions must not have salesTotal/profitTotal keys at all.
    // We intentionally build two distinct object shapes rather than setting null.
    if (isOwner) {
      const result: HomeSummaryOwner = {
        salesTotal: Math.round(salesTotal * 100) / 100,
        profitTotal: Math.round(profitTotal * 100) / 100,
      };
      if (lowStockCount !== undefined) {
        result.lowStockCount = lowStockCount;
      }
      return result;
    } else {
      // Employee: omit financial fields entirely (not null, not 0 — absent)
      const result: HomeSummaryEmployee = {};
      if (lowStockCount !== undefined) {
        result.lowStockCount = lowStockCount;
      }
      return result;
    }
  },
);
