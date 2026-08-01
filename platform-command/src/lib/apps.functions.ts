import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireRole, writeAudit } from "./rbac.server";

const appSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
  odoo_module_name: z.string().min(2).max(120),
  is_deprecated: z.boolean().default(false),
  /** Feature 4 — Marketplace Price Transparency */
  monthly_price_inr: z.number().min(0).default(0),
  is_addon: z.boolean().default(false),
  pricing_note: z.string().max(300).optional().nullable(),
});

export const listApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const [apps, planApps, plans] = await Promise.all([
      context.supabase.from("apps").select("*").order("name"),
      context.supabase.from("plan_apps").select("plan_id, app_id"),
      context.supabase.from("plans").select("id, name"),
    ]);
    if (apps.error) throw apps.error;
    const planNames = new Map((plans.data ?? []).map((p) => [p.id, p.name]));
    const plansByApp = new Map<string, { id: string; name: string }[]>();
    for (const pa of planApps.data ?? []) {
      const arr = plansByApp.get(pa.app_id) ?? [];
      const name = planNames.get(pa.plan_id);
      if (name) arr.push({ id: pa.plan_id, name });
      plansByApp.set(pa.app_id, arr);
    }
    return (apps.data ?? []).map((a) => ({ ...a, plans: plansByApp.get(a.id) ?? [] }));
  });

export const createApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => appSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: created, error } = await context.supabase.from("apps").insert(data as any).select().single();
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "app",
      entityId: created.id,
      action: "app.created",
      after: created,
    });
    return created;
  });

export const updateApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: appSchema.partial() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: before } = await context.supabase
      .from("apps")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("App not found");
    const { error } = await context.supabase.from("apps").update(data.patch as never).eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "app",
      entityId: data.id,
      action: "app.updated",
      before,
      after: data.patch,
    });
    return { ok: true };
  });

export const deleteApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { error } = await context.supabase.from("apps").delete().eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "app",
      entityId: data.id,
      action: "app.deleted",
    });
    return { ok: true };
  });
