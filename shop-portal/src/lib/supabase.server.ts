/**
 * Supabase server-side client.
 * Uses service role key — bypasses RLS — for reading shop/plan/app records.
 * Shop users never interact with Supabase directly; this is only for the portal's
 * server functions to look up configuration data.
 */

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import dns from "node:dns";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export let lastFetchLog: any = null;

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    headers.set("apikey", supabaseKey);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }


    // Fix unencoded asterisks in query params (Vite/TanStack Start environment doesn't encode * to %2A like Node/tsx does,
    // which causes PostgREST/Cloudflare to return empty array [] for unencoded select=*)
    let url = input;
    if (typeof url === "string" && url.includes("?")) {
      const [base, query] = url.split("?");
      url = `${base}?${query.replace(/\*/g, "%2A")}`;
    } else if (typeof Request !== "undefined" && url instanceof Request) {
      if (url.url.includes("?")) {
        const [base, query] = url.url.split("?");
        const newUrl = `${base}?${query.replace(/\*/g, "%2A")}`;
        url = new Request(newUrl, url);
      }
    } else if (typeof URL !== "undefined" && url instanceof URL) {
      if (url.search.includes("*")) {
        url.search = url.search.replace(/\*/g, "%2A");
      }
    }

    const afterAuth = headers.get("Authorization");
    const afterApiKey = headers.get("apikey");

    const urlStr = typeof url === "string" ? url : typeof Request !== "undefined" && url instanceof Request ? url.url : typeof URL !== "undefined" && url instanceof URL ? url.toString() : "unknown";

    const logEntry = {
      url: urlStr,
      keySlice: supabaseKey ? supabaseKey.slice(0, 15) : "null",
      isNewKey: isNewSupabaseApiKey(supabaseKey),
      afterAuth: afterAuth ? afterAuth.slice(0, 25) : null,
      afterApiKey: afterApiKey ? afterApiKey.slice(0, 25) : null,
      allHeaders: Array.from(headers.entries())
    };

    lastFetchLog = logEntry;
    console.log("📡 [createSupabaseFetch] Request:", logEntry);

    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        const res = await fetch(url, { ...init, headers });
        const bodyPreview = await res.clone().text().catch(() => "failed to read body");
        console.log(`📥 [createSupabaseFetch] Response (${res.status}): ${bodyPreview.slice(0, 150)}`);
        return res;
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) {
          console.error(`❌ [createSupabaseFetch] Failed after ${attempt} attempts:`, err?.message || err);
          throw err;
        }
        console.warn(`⚠️ [createSupabaseFetch] Attempt ${attempt} failed (${err?.message || "network error"}), retrying in ${attempt * 200}ms...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  };
}



function createSupabasePortalClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase credentials in environment");
    return createClient("https://placeholder.supabase.co", "placeholder", {
      auth: { persistSession: false },
    });
  }

  // SUPABASE_SERVICE_ROLE_KEY is the sb_secret_* key — always use it directly.
  // isNewSupabaseApiKey() will be true for sb_secret_ keys; the custom fetch
  // will strip the Authorization header and send `apikey` header instead.
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY;

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: { transport: WebSocket as any },
    global: {
      headers: {
        "x-client-info": "kirana-shop-portal",
      },
      fetch: createSupabaseFetch(supabaseKey),
    },
  });
}

// In dev mode, create a fresh client on every module reload so hot reloads pick up fetch improvements.
export const supabasePortal = createSupabasePortalClient();

// ─────────────────────────────────────────────────────────────────────────────
// Shop data types (matching Supabase schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopRecord {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string | null;
  email: string | null;
  business_type: string;
  city: string | null;
  state: string | null;
  gstin: string | null;
  subdomain: string | null;
  plan_id: string | null;
  subscription_status: string;
  provisioning_status: string;
  odoo_db_name: string | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface AppRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  odoo_module_name: string;
  is_deprecated: boolean;
}

export interface PlanRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price_inr: number;
  billing_cycle: string;
  trial_days: number;
  max_seats: number;
}
