/**
 * Session management via HMAC-signed httpOnly cookies.
 *
 * No external dependencies — uses Node's built-in crypto.
 * The signed cookie stores the user's shop context and Odoo session reference
 * so every server function can verify the user without hitting Supabase or Odoo
 * on every request.
 *
 * Cookie format: base64url(JSON) + "." + HMAC-SHA256(base64url(JSON))
 */

import crypto from "node:crypto";
import { SESSION_SECRET, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopSession {
  /** Supabase shop row ID */
  shopId: string;
  /** Odoo database name for this shop (e.g. "shop_mobileworld_abc1") */
  odooDb: string;
  /** Odoo authenticated user ID */
  odooUid: number;
  /** Odoo session_id (passed as cookie to /odoo/* proxied requests) */
  odooSessionId: string;
  /** Display name of the logged-in user */
  userName: string;
  /** Odoo login (email or username) of the logged-in user */
  userLogin: string;
  /**
   * true = shop owner / admin (has base.group_system in Odoo)
   * false = employee (restricted to assigned apps)
   */
  isOwner: boolean;
  /**
   * Supabase app slugs this user is allowed to access.
   * For owners: all slugs in the shop's plan.
   * For employees: only slugs whose corresponding Odoo group they belong to.
   */
  allowedAppSlugs: string[];
  /** Expiry as unix timestamp ms (checked on every decode) */
  expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signing helpers
// ─────────────────────────────────────────────────────────────────────────────

function sign(data: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

function encode(session: ShopSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): ShopSession | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (sign(payload) !== sig) return null; // tampered
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as ShopSession;
    if (session.expiresAt < Date.now()) return null; // expired
    return session;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie helpers (uses Vinxi/H3 request context)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bake a fresh session cookie value from a ShopSession.
 * Returns the raw cookie string to be passed to the Set-Cookie header.
 */
export function bakeSessionCookie(session: Omit<ShopSession, "expiresAt">): string {
  const full: ShopSession = {
    ...session,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const value = encode(full);
  const expires = new Date(full.expiresAt).toUTCString();
  return (
    `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`
  );
}

/**
 * Bake an Odoo session cookie so the browser sends it with every /odoo/* request.
 * The Vite proxy forwards /odoo/* to Odoo, which validates this cookie.
 */
export function bakeOdooSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toUTCString();
  return `session_id=${sessionId}; Path=/odoo; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

/** Clear cookie (sets Max-Age=0). */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read session from raw cookie header string
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the ShopSession from the Cookie header string.
 * Returns null if cookie is absent, tampered, or expired.
 */
export function readSessionFromCookies(cookieHeader: string | null): ShopSession | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME && rest.length > 0) {
      return decode(rest.join("="));
    }
  }
  return null;
}
