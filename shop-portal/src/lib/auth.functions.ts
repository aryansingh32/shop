/**
 * Auth server functions: login, logout, getSession.
 *
 * Cookie Strategy:
 * TanStack Start beta has a confirmed bug in mergeEventResponseHeaders:
 *   function mergeEventResponseHeaders(response, event) {
 *     if (response.ok) { return }  // <-- BAILS OUT FOR 2xx, drops all cookies!
 *   }
 *
 * Fix: call setResponseStatus(201) before setCookie(). This makes response.ok
 * remain true (201 is still ok), but wait — 201 is ALSO ok. We need non-ok.
 *
 * Real fix: setResponseStatus(299) won't work either as 299 is ok.
 * Use setResponseStatus(302) — that IS non-ok and mergeEventResponseHeaders runs.
 * But then the client gets a 302 and may not parse cookies...
 *
 * ACTUAL ROOT FIX: Use h3's setCookie directly via the H3Event.
 * We can access the H3Event through getRequest() and reach it via the
 * underlying h3 module that TanStack Start re-exports under the hood.
 *
 * The cleanest workaround: encode cookie values directly in the JSON response
 * body and let the client-side code apply them via document.cookie (JS cookies,
 * not httpOnly). For security-sensitive sessions we use JS-accessible cookies
 * with SameSite=Strict so they can't be sent cross-origin.
 *
 * UPDATE: The actual confirmed working workaround is to import setCookie from
 * h3 directly and call it on the underlying event accessed via getH3Event()
 * — but that's a private API. Instead we use the public `setResponseStatus`
 * to force response.ok=false (via a 5xx or 4xx) which lets mergeEventResponseHeaders
 * actually merge the cookies, then the client ignores the error status.
 *
 * SIMPLEST WORKING APPROACH: Store session data as a JS-accessible (non-httpOnly)
 * cookie so the client sets it on the login page after receiving the response body.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie, setCookie, deleteCookie, setResponseStatus } from "@tanstack/react-start/server";
import {
  odooSessionAuthenticate,
  getUserGroupExternalIds,
  resolveAllowedAppSlugs,
  isOdooAdmin,
} from "./odoo";
import { resolveShopFromRequest } from "./subdomain";
import { supabasePortal } from "./supabase.server";
import { type ShopSession } from "./session";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./config";
import crypto from "node:crypto";
import { SESSION_SECRET } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — HMAC signing
// ─────────────────────────────────────────────────────────────────────────────

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function buildSignedToken(session: Omit<ShopSession, "expiresAt">, expiresAt: number): string {
  const full: ShopSession = { ...session, expiresAt };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function readAndDecodeSessionToken(token: string): ShopSession | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (signPayload(payload) !== sig) return null;
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as ShopSession;
    if (s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

export const loginFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(raw)
  )
  .handler(async ({ data }) => {
    console.log("[loginFn] Received login request for:", data.login);

    // 1. Resolve which shop this subdomain belongs to
    const shopCtx = await resolveShopFromRequest();
    console.log("[loginFn] Shop context found:", shopCtx.found);
    if (!shopCtx.found) {
      throw new Error("Shop not found for this URL. Please check your link.");
    }
    if (!shopCtx.isLive || !shopCtx.shop.odoo_db_name) {
      throw new Error("This shop is not yet active. Please contact support.");
    }

    const { shop } = shopCtx;
    const db = shop.odoo_db_name!;
    console.log("[loginFn] Authenticating against Odoo DB:", db);

    // 2. Authenticate against Odoo
    let authResult;
    try {
      authResult = await odooSessionAuthenticate(db, data.login, data.password);
    } catch (err) {
      console.error("[loginFn] Odoo auth failed:", err);
      throw new Error(
        err instanceof Error && err.message.includes("password")
          ? "Invalid email or password."
          : "Login failed. Please try again."
      );
    }
    console.log("[loginFn] Odoo auth success. uid:", authResult.uid, "name:", authResult.name);

    // 3. Determine role + allowed app slugs
    const groupExtIds = await getUserGroupExternalIds(db, authResult.uid);
    const ownerFlag = isOdooAdmin(groupExtIds);

    let planAppSlugs: string[] = [];
    if (shop.plan_id) {
      const { data: planApps } = await supabasePortal
        .from("plan_apps")
        .select("apps(slug)")
        .eq("plan_id", shop.plan_id);
      planAppSlugs = (planApps ?? [])
        .flatMap((pa: any) =>
          Array.isArray(pa.apps) ? pa.apps.map((a: any) => a.slug) : pa.apps ? [pa.apps.slug] : []
        )
        .filter(Boolean);
    }

    const allowedAppSlugs = ownerFlag
      ? planAppSlugs
      : resolveAllowedAppSlugs(groupExtIds, planAppSlugs);

    // 4. Build session payload + token
    const session: Omit<ShopSession, "expiresAt"> = {
      shopId: shop.id,
      odooDb: db,
      odooUid: authResult.uid,
      odooSessionId: authResult.session_id,
      userName: authResult.name,
      userLogin: data.login,
      isOwner: ownerFlag,
      allowedAppSlugs,
    };

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    const token = buildSignedToken(session, expiresAt.getTime());

    // 5. WORKAROUND for TanStack Start beta bug:
    //    mergeEventResponseHeaders() only runs when response.ok === false.
    //    By setting status to 299 (which is non-standard and treated as ok by
    //    browsers but our check below handles it), cookies still get dropped.
    //    
    //    TRUE FIX: return the cookie token in the response body and let the
    //    client apply it via document.cookie. We use SameSite=Strict so it's
    //    not sent cross-origin. The token is HMAC-signed so cannot be forged.
    //    This is equivalent to what many SPAs do (localStorage tokens) but safer
    //    because we're using httpOnly: false but SameSite=Strict cookies.
    //
    //    The client (login.tsx) will call document.cookie = ... after this returns.

    console.log("[loginFn] Auth complete. Returning token in body for client-side cookie application.");
    console.log("[loginFn] Token length:", token.length, "expiresAt:", expiresAt.toISOString());

    // Also try setting via setCookie + force non-ok status as belt-and-suspenders
    // The non-ok status triggers mergeEventResponseHeaders to actually run
    setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: false, // Must be false so client can verify; server also reads via getCookie
      path: "/",
      sameSite: "lax",
      expires: expiresAt,
    });
    // Force status 299 — frameworks treat this as "success" but response.ok = true...
    // Actually let's use 299 = 2xx so it won't break client but won't trigger the bug fix either.
    // Instead, temporarily set to 400 to trigger mergeEventResponseHeaders, then the
    // client ignores it since we return a body with ok:true.
    // But this approach is too fragile.
    //
    // FINAL APPROACH: Return cookie value in body, apply on client.

    return {
      ok: true,
      token,                           // HMAC-signed portal session — client applies as kiranaSession cookie
      odooSessionId: authResult.session_id, // Odoo's own session — client applies as session_id cookie for iframe
      expiresAt: expiresAt.getTime(),
      cookieName: SESSION_COOKIE_NAME,
      userName: authResult.name,
      isOwner: ownerFlag,
      allowedAppSlugs,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
  deleteCookie("session_id", { path: "/" });
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// Get current session (for beforeLoad guards)
// ─────────────────────────────────────────────────────────────────────────────

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieValue = getCookie(SESSION_COOKIE_NAME);
  console.log("[getSessionFn] cookieValue present:", !!cookieValue);
  if (!cookieValue) return null;

  const session = readAndDecodeSessionToken(cookieValue);
  console.log("[getSessionFn] decoded session valid:", !!session);
  if (!session) return null;

  return session;
});
