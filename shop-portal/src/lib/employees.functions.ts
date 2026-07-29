/**
 * Employee management server functions.
 * All operations go directly to the shop's Odoo database (res.users + res.groups).
 * The UI never touches Supabase for employee data — employees ARE Odoo users.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { readSessionFromCookies } from "./session";
import {
  getShopEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
} from "./odoo";

function requireOwnerSession(cookieHeader: string | null) {
  const session = readSessionFromCookies(cookieHeader);
  if (!session) throw new Error("Not authenticated");
  if (!session.isOwner) throw new Error("Access denied — shop owners only");
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// List employees
// ─────────────────────────────────────────────────────────────────────────────

export const getEmployeesFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = requireOwnerSession(request.headers.get("cookie"));
  const employees = await getShopEmployees(session.odooDb);
  return employees;
});

// ─────────────────────────────────────────────────────────────────────────────
// Create employee
// ─────────────────────────────────────────────────────────────────────────────

export const createEmployeeFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({
      name: z.string().min(2).max(120),
      login: z.string().min(3).max(120),
      password: z.string().min(6).max(100),
      appSlugs: z.array(z.string()),
    }).parse(raw)
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = requireOwnerSession(request.headers.get("cookie"));
    // Only allow slugs from the shop's own plan (security: don't let owners grant
    // access to apps they don't have)
    const safeSlugs = data.appSlugs.filter((s) => session.allowedAppSlugs.includes(s));
    const userId = await createEmployee(session.odooDb, data.name, data.login, data.password, safeSlugs);
    return { ok: true, userId };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Update employee
// ─────────────────────────────────────────────────────────────────────────────

export const updateEmployeeFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({
      userId: z.number().int().positive(),
      name: z.string().min(2).max(120).optional(),
      password: z.string().min(6).max(100).optional(),
      appSlugs: z.array(z.string()).optional(),
    }).parse(raw)
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = requireOwnerSession(request.headers.get("cookie"));
    const safeSlugs = data.appSlugs?.filter((s) => session.allowedAppSlugs.includes(s));
    await updateEmployee(session.odooDb, data.userId, {
      name: data.name,
      password: data.password,
      appSlugs: safeSlugs,
    });
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Deactivate / reactivate employee
// ─────────────────────────────────────────────────────────────────────────────

export const deactivateEmployeeFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => z.object({ userId: z.number().int().positive() }).parse(raw))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = requireOwnerSession(request.headers.get("cookie"));
    await deactivateEmployee(session.odooDb, data.userId);
    return { ok: true };
  });

export const reactivateEmployeeFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => z.object({ userId: z.number().int().positive() }).parse(raw))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = requireOwnerSession(request.headers.get("cookie"));
    await reactivateEmployee(session.odooDb, data.userId);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Change own password
// ─────────────────────────────────────────────────────────────────────────────

export const changeMyPasswordFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) =>
    z.object({ newPassword: z.string().min(6).max(100) }).parse(raw)
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = readSessionFromCookies(request.headers.get("cookie"));
    if (!session) throw new Error("Not authenticated");
    await updateEmployee(session.odooDb, session.odooUid, { password: data.newPassword });
    return { ok: true };
  });
