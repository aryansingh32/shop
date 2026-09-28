import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import http from "node:http";
import https from "node:https";
import { readSessionFromCookies } from "./session";
import { ODOO_URL, ODOO_ADMIN_LOGIN, ODOO_ADMIN_PASSWORD } from "./config";
import { getLoyaltyBalanceForCustomer } from "./odoo";

let rpcId = 500;

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
        catch { reject(new Error("We could not read shop data right now.")); }
      });
    });
    req.on("error", () => reject(new Error("Your shop data is temporarily unavailable.")));
    req.write(body);
    req.end();
  });

  if (json.error) throw new Error("Your shop data is temporarily unavailable.");
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
  if (!uid) throw new Error("Your shop data is temporarily unavailable.");
  return rpcCall<T>("object", "execute_kw", [db, uid, ODOO_ADMIN_PASSWORD, model, method, args, kwargs]);
}

function requireSession() {
  const request = getRequest();
  const session = readSessionFromCookies(request.headers.get("cookie"));
  if (!session) throw new Error("Not authenticated");
  return session;
}

export interface CustomerRow {
  id: number;
  name: string;
  phone: string | false;
  mobile: string | false;
  email: string | false;
  city: string | false;
  credit: number;
  customer_rank: number;
  loyaltyPoints: number;
  lastVisit: string | null;
  lifetimeSpend: number;
}

export const listCustomersFn = createServerFn({ method: "GET" })
  .validator((raw: unknown) => z.object({ search: z.string().optional() }).parse(raw ?? {}))
  .handler(async ({ data }): Promise<CustomerRow[]> => {
    const session = requireSession();
    const search = data.search?.trim();
    const domain: any[] = [["customer_rank", ">", 0], ["active", "=", true]];
    if (search) {
      domain.unshift("|", "|");
      domain.push(["name", "ilike", search], ["phone", "ilike", search], ["mobile", "ilike", search]);
    }

    const partners = await adminExecute<Array<{
      id: number;
      name: string;
      phone: string | false;
      mobile: string | false;
      email: string | false;
      city: string | false;
      credit?: number;
      customer_rank: number;
    }>>(session.odooDb, "res.partner", "search_read", [domain], {
      fields: ["id", "name", "phone", "mobile", "email", "city", "credit", "customer_rank"],
      limit: 50,
      order: "write_date desc",
    });

    if (partners.length === 0) return [];
    const partnerIds = partners.map((p) => p.id);
    type OrderGroup = { partner_id: [number, string]; amount_total: number; date_order: string };
    const groups = await adminExecute<OrderGroup[]>(session.odooDb, "pos.order", "read_group", [[
      ["partner_id", "in", partnerIds],
      ["state", "in", ["paid", "done", "invoiced"]],
    ]], {
      fields: ["partner_id", "amount_total:sum", "date_order:max"],
      groupby: ["partner_id"],
      lazy: false,
    }).catch(() => []);

    const stats = new Map<number, { lifetimeSpend: number; lastVisit: string | null }>();
    for (const group of groups) {
      const partnerId = Array.isArray(group.partner_id) ? group.partner_id[0] : null;
      if (partnerId) {
        stats.set(partnerId, {
          lifetimeSpend: group.amount_total ?? 0,
          lastVisit: group.date_order ?? null,
        });
      }
    }

    return Promise.all(partners.map(async (p) => ({
      ...p,
      credit: Number(p.credit ?? 0),
      loyaltyPoints: await getLoyaltyBalanceForCustomer(session.odooDb, p.id),
      lifetimeSpend: stats.get(p.id)?.lifetimeSpend ?? 0,
      lastVisit: stats.get(p.id)?.lastVisit ?? null,
    })));
  });

export const createCustomerFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({
      name: z.string().min(2).max(120),
      phone: z.string().max(30).optional(),
      email: z.string().email().optional().or(z.literal("")),
      city: z.string().max(80).optional(),
    }).parse(raw),
  )
  .handler(async ({ data }) => {
    const session = requireSession();
    const id = await adminExecute<number>(session.odooDb, "res.partner", "create", [{
      name: data.name,
      phone: data.phone || false,
      mobile: data.phone || false,
      email: data.email || false,
      city: data.city || false,
      customer_rank: 1,
    }]);
    return { id };
  });
