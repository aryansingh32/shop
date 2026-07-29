/**
 * Subdomain resolution — the first thing every request does.
 *
 * Extracts the shop subdomain from the Host header, looks it up in Supabase,
 * and returns the shop record. If no match, callers show a branded 404.
 *
 * Works for:
 *   - Local dev:    shopname.localhost:3001  → subdomain = "shopname"
 *   - Production:   shopname.kirana.dev       → subdomain = "shopname"
 *   - Apex (no sub): kirana.dev / localhost:3001 → subdomain = null
 */

import { getRequest } from "@tanstack/react-start/server";
import { supabasePortal, type ShopRecord } from "./supabase.server";

/**
 * Extract subdomain from a Host header string.
 * Returns null for apex domain or bare localhost.
 */
export function extractSubdomainFromHost(host: string): string | null {
  if (!host) return null;
  const hostNoPort = host.split(":")[0].trim().toLowerCase();
  const parts = hostNoPort.split(".");

  // shopname.localhost → ["shopname", "localhost"] → "shopname"
  if (parts.length === 2 && parts[1] === "localhost") {
    return parts[0];
  }

  // shopname.kirana.dev → ["shopname", "kirana", "dev"] → "shopname"
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

export function extractSubdomain(host: string): string | null {
  const sub = extractSubdomainFromHost(host);
  if (sub) return sub;
  return null;
}

export type ShopContext =
  | { found: false; subdomain: string | null }
  | { found: true; subdomain: string; shop: ShopRecord; isLive: boolean };

/**
 * Resolve the current request's subdomain to a shop record.
 * Call this inside server functions (not on the client) — reads Host, Referer, and Origin headers.
 */
export async function resolveShopFromRequest(): Promise<ShopContext> {
  const request = getRequest();
  const headers = request.headers;

  // Gather candidate hosts from X-Forwarded-Host, Host, Referer, and Origin
  const candidateHosts: string[] = [];
  const xHost = headers.get("x-forwarded-host");
  if (xHost) candidateHosts.push(xHost);
  const hostHeader = headers.get("host");
  if (hostHeader) candidateHosts.push(hostHeader);
  const referer = headers.get("referer");
  if (referer) {
    try { candidateHosts.push(new URL(referer).host); } catch {}
  }
  const origin = headers.get("origin");
  if (origin) {
    try { candidateHosts.push(new URL(origin).host); } catch {}
  }

  let subdomain: string | null = null;
  for (const h of candidateHosts) {
    const sub = extractSubdomainFromHost(h);
    if (sub && sub !== "localhost") {
      subdomain = sub;
      break;
    }
  }

  // In dev mode, check for ?shop= query parameter or dev_shop_subdomain cookie if no subdomain found in hostname
  if (!subdomain && process.env.NODE_ENV !== "production") {
    try {
      const urlObj = new URL(request.url);
      const shopParam = urlObj.searchParams.get("shop");
      if (shopParam) subdomain = shopParam;
    } catch {}

    if (!subdomain && referer) {
      try {
        const refObj = new URL(referer);
        const shopParam = refObj.searchParams.get("shop");
        if (shopParam) subdomain = shopParam;
      } catch {}
    }

    if (!subdomain) {
      const cookieHeader = headers.get("cookie") || "";
      const match = cookieHeader.match(/(?:^|;\s*)dev_shop_subdomain=([^;]+)/);
      if (match) subdomain = decodeURIComponent(match[1]);
    }
  }

  if (!subdomain) return { found: false, subdomain: null };

  const cleanSub = subdomain.toLowerCase().trim();

  // 1. Try exact or case-insensitive match on subdomain
  let { data: shop, error: err1 } = await supabasePortal
    .from("shops")
    .select("*")
    .ilike("subdomain", cleanSub)
    .maybeSingle();

  // 2. Fallback for legacy shops created before subdomain column was populated:
  // Match by business_name slug or odoo_db_name matching shop_{cleanSub}_*
  let err2 = null;
  let shopsCount = 0;
  if (!shop) {
    const res = await supabasePortal.from("shops").select("*");
    const shops = res.data;
    err2 = res.error;
    shopsCount = shops?.length ?? 0;

    shop = (shops ?? []).find((s: any) => {
      if (s.subdomain && s.subdomain.toLowerCase().trim() === cleanSub) return true;
      const bSlug = s.business_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (bSlug === cleanSub) return true;
      if (s.odoo_db_name && (s.odoo_db_name === `shop_${cleanSub}` || s.odoo_db_name.startsWith(`shop_${cleanSub}_`))) return true;
      return false;
    }) ?? null;
  }

  console.log("🔍 [resolveShopFromRequest] Resolved:", {
    candidateHosts,
    subdomain: cleanSub,
    found: !!shop,
    shopName: shop?.business_name,
    odooDb: shop?.odoo_db_name,
    err1,
    err2,
    shopsCount,
  });

  if (!shop) return { found: false, subdomain: cleanSub };

  // Auto-backfill subdomain in Supabase if missing
  if (!(shop as ShopRecord).subdomain) {
    try {
      await supabasePortal.from("shops").update({ subdomain: cleanSub }).eq("id", (shop as ShopRecord).id);
      (shop as ShopRecord).subdomain = cleanSub;
    } catch (e) {
      console.error("Subdomain backfill warning:", e);
    }
  }

  const isLive = (shop as ShopRecord).provisioning_status === "live";
  return { found: true, subdomain: cleanSub, shop: shop as ShopRecord, isLive };
}



