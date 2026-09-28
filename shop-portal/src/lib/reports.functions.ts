import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import http from "node:http";
import https from "node:https";
import { readSessionFromCookies } from "./session";
import { ODOO_URL, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD } from "./config";
import { getTodayBoundsUTC } from "./home.functions";

let rpcId = 800;

async function rpcCall<T>(service: string, method: string, args: unknown[]): Promise<T> {
  const body = JSON.stringify({ jsonrpc: "2.0", method: "call", id: rpcId++, params: { service, method, args } });
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
        catch { reject(new Error("We could not read reports right now.")); }
      });
    });
    req.on("error", () => reject(new Error("Reports are temporarily unavailable.")));
    req.write(body);
    req.end();
  });
  if (json.error) throw new Error("Reports are temporarily unavailable.");
  return json.result as T;
}

async function adminExecute<T>(
  db: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const uid = await rpcCall<number | false>("common", "authenticate", [db, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD, {}]);
  if (!uid) throw new Error("Reports are temporarily unavailable.");
  return rpcCall<T>("object", "execute_kw", [db, uid, ODOO_ADMIN_PASSWORD, model, method, args, kwargs]);
}

function requireOwnerSession() {
  const request = getRequest();
  const session = readSessionFromCookies(request.headers.get("cookie"));
  if (!session) throw new Error("Not authenticated");
  if (!session.isOwner) throw new Error("Only the shop owner can view reports.");
  return session;
}

export interface GrowSummary {
  salesToday: number;
  ordersToday: number;
  averageBillToday: number;
  lowStockCount: number;
  topProducts: Array<{ productId: number; name: string; qty: number; sales: number }>;
  deadStock: Array<{ id: number; name: string; qtyAvailable: number }>;
  inactiveCustomers: number;
}

export const getGrowSummaryFn = createServerFn({ method: "GET" }).handler(async (): Promise<GrowSummary> => {
  const session = requireOwnerSession();
  const { start, end } = getTodayBoundsUTC();

  type OrderGroup = { amount_total: number; __count: number };
  const orderGroups = await adminExecute<OrderGroup[]>(session.odooDb, "pos.order", "read_group", [[
    ["date_order", ">=", start],
    ["date_order", "<=", end],
    ["state", "in", ["paid", "done", "invoiced"]],
  ]], {
    fields: ["amount_total:sum"],
    groupby: [],
    lazy: false,
  });

  const salesToday = orderGroups[0]?.amount_total ?? 0;
  const ordersToday = orderGroups[0]?.__count ?? 0;

  type LineGroup = { product_id: [number, string] | false; qty: number; price_subtotal: number };
  const lineGroups = await adminExecute<LineGroup[]>(session.odooDb, "pos.order.line", "read_group", [[
    ["order_id.date_order", ">=", start],
    ["order_id.date_order", "<=", end],
    ["order_id.state", "in", ["paid", "done", "invoiced"]],
  ]], {
    fields: ["product_id", "qty:sum", "price_subtotal:sum"],
    groupby: ["product_id"],
    lazy: false,
    limit: 10,
    orderby: "price_subtotal desc",
  }).catch(() => []);

  const [lowStockCount, deadStock, inactiveCustomers] = await Promise.all([
    adminExecute<number>(session.odooDb, "product.product", "search_count", [[
      ["type", "=", "product"],
      ["active", "=", true],
      ["qty_available", "<", 5],
    ]]).catch(() => 0),
    adminExecute<Array<{ id: number; display_name: string; qty_available: number }>>(session.odooDb, "product.product", "search_read", [[
      ["type", "=", "product"],
      ["active", "=", true],
      ["qty_available", ">", 0],
      ["sales_count", "=", 0],
    ]], {
      fields: ["id", "display_name", "qty_available"],
      limit: 8,
      order: "qty_available desc",
    }).catch(() => []),
    adminExecute<number>(session.odooDb, "res.partner", "search_count", [[
      ["customer_rank", ">", 0],
      ["active", "=", true],
      ["write_date", "<", start],
    ]]).catch(() => 0),
  ]);

  return {
    salesToday: Math.round(salesToday * 100) / 100,
    ordersToday,
    averageBillToday: ordersToday > 0 ? Math.round((salesToday / ordersToday) * 100) / 100 : 0,
    lowStockCount,
    topProducts: lineGroups
      .filter((g) => Array.isArray(g.product_id))
      .map((g) => ({
        productId: (g.product_id as [number, string])[0],
        name: (g.product_id as [number, string])[1],
        qty: g.qty ?? 0,
        sales: g.price_subtotal ?? 0,
      })),
    deadStock: deadStock.map((p) => ({
      id: p.id,
      name: p.display_name,
      qtyAvailable: p.qty_available ?? 0,
    })),
    inactiveCustomers,
  };
});
