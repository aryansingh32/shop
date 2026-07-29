/**
 * Shop data server functions.
 * Reads shop configuration from Supabase (plan, apps) + Odoo (company profile).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { supabasePortal, type AppRecord, type PlanRecord, type ShopRecord } from "./supabase.server";
import { resolveShopFromRequest } from "./subdomain";
import { readSessionFromCookies } from "./session";
import { getOdooCompany, updateOdooCompany } from "./odoo";

// ─────────────────────────────────────────────────────────────────────────────
// Get shop + plan + allowed apps for dashboard rendering
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardApp extends AppRecord {
  odooPath: string;
}

export interface DashboardData {
  shop: ShopRecord;
  plan: PlanRecord | null;
  apps: DashboardApp[];
  trialEndsAt: string | null;
}

export const getDashboardDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = readSessionFromCookies(request.headers.get("cookie"));
  if (!session) throw new Error("Not authenticated");

  // Get shop from Supabase
  const { data: shop } = await supabasePortal
    .from("shops")
    .select("*, plan:plans(id, name, slug, description, monthly_price_inr, billing_cycle, trial_days, max_seats)")
    .eq("id", session.shopId)
    .maybeSingle();

  if (!shop) throw new Error("Shop not found");

  // Get the full app records for the user's allowed slugs (preserving catalog order)
  const { data: allApps } = await supabasePortal
    .from("apps")
    .select("*")
    .in("slug", session.allowedAppSlugs.length > 0 ? session.allowedAppSlugs : ["__none__"])
    .eq("is_deprecated", false);

  // Maintain ordering from allowedAppSlugs
  const appsOrdered = session.allowedAppSlugs
    .map((slug) => (allApps ?? []).find((a: any) => a.slug === slug))
    .filter(Boolean) as AppRecord[];

  return {
    shop: shop as ShopRecord,
    plan: (shop as any).plan ?? null,
    apps: appsOrdered,
    trialEndsAt: shop.trial_ends_at ?? null,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Get shop profile (for settings page)
// ─────────────────────────────────────────────────────────────────────────────

export const getShopProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = readSessionFromCookies(request.headers.get("cookie"));
  if (!session) throw new Error("Not authenticated");
  if (!session.isOwner) throw new Error("Access denied — owners only");

  const company = await getOdooCompany(session.odooDb);
  const { data: shop } = await supabasePortal
    .from("shops")
    .select("gstin, city, state, phone, email, business_name")
    .eq("id", session.shopId)
    .maybeSingle();

  return { company, shop };
});

// ─────────────────────────────────────────────────────────────────────────────
// Update shop profile
// ─────────────────────────────────────────────────────────────────────────────

export const updateShopProfileFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({
      companyId: z.number(),
      name: z.string().min(2).max(120).optional(),
      street: z.string().max(200).optional(),
      city: z.string().max(80).optional(),
      phone: z.string().max(30).optional(),
      email: z.string().email().optional(),
      vat: z.string().max(20).optional(),
    }).parse(raw)
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = readSessionFromCookies(request.headers.get("cookie"));
    if (!session) throw new Error("Not authenticated");
    if (!session.isOwner) throw new Error("Access denied — owners only");

    const { companyId, ...patch } = data;
    await updateOdooCompany(session.odooDb, companyId, patch);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Get subscription info (read-only, from Supabase)
// ─────────────────────────────────────────────────────────────────────────────

export const getSubscriptionFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = readSessionFromCookies(request.headers.get("cookie"));
  if (!session) throw new Error("Not authenticated");

  const { data: shop } = await supabasePortal
    .from("shops")
    .select("subscription_status, trial_ends_at, plan:plans(name, monthly_price_inr, billing_cycle, max_seats, description)")
    .eq("id", session.shopId)
    .maybeSingle();

  return shop ?? null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Get dev shops list (for local dev shop switcher when accessing bare localhost)
// ─────────────────────────────────────────────────────────────────────────────

export const getDevShopsFn = createServerFn({ method: "GET" }).handler(async () => {
  if (process.env.NODE_ENV === "production") return [];
  const { data: shops } = await supabasePortal
    .from("shops")
    .select("id, business_name, subdomain, odoo_db_name, provisioning_status")
    .order("created_at", { ascending: false });
  return shops ?? [];
});

