import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireRole, writeAudit } from "./rbac.server";

const planSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
  description: z.string().max(500).optional().nullable(),
  monthly_price_inr: z.number().int().min(0).max(10_000_000),
  billing_cycle: z.enum(["monthly", "annual"]).default("monthly"),
  trial_days: z.number().int().min(0).max(365),
  max_seats: z.number().int().min(1).max(1000),
  app_ids: z.array(z.string().uuid()).default([]),
});

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const [plans, planApps, shops] = await Promise.all([
      context.supabase.from("plans").select("*").order("monthly_price_inr", { ascending: true }),
      context.supabase.from("plan_apps").select("plan_id, app_id"),
      context.supabase.from("shops").select("plan_id, subscription_status"),
    ]);
    if (plans.error) throw plans.error;

    const shopCounts = new Map<string, number>();
    for (const s of shops.data ?? []) {
      if (!s.plan_id) continue;
      if (s.subscription_status === "cancelled") continue;
      shopCounts.set(s.plan_id, (shopCounts.get(s.plan_id) ?? 0) + 1);
    }
    const appsByPlan = new Map<string, string[]>();
    for (const pa of planApps.data ?? []) {
      const arr = appsByPlan.get(pa.plan_id) ?? [];
      arr.push(pa.app_id);
      appsByPlan.set(pa.plan_id, arr);
    }
    return (plans.data ?? []).map((p) => ({
      ...p,
      app_ids: appsByPlan.get(p.id) ?? [],
      active_shops: shopCounts.get(p.id) ?? 0,
    }));
  });

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => planSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { app_ids, ...rest } = data;
    const { data: created, error } = await context.supabase
      .from("plans")
      .insert(rest)
      .select()
      .single();
    if (error) throw error;
    if (app_ids.length > 0) {
      const rows = app_ids.map((app_id) => ({ plan_id: created.id, app_id }));
      const { error: peErr } = await context.supabase.from("plan_apps").insert(rows);
      if (peErr) throw peErr;
    }
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "plan",
      entityId: created.id,
      action: "plan.created",
      after: { ...created, app_ids },
    });
    return created;
  });

export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: planSchema.partial() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: before } = await context.supabase
      .from("plans")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Plan not found");

    const { app_ids, ...rest } = data.patch;
    if (Object.keys(rest).length > 0) {
      const { error } = await context.supabase.from("plans").update(rest as never).eq("id", data.id);
      if (error) throw error;
    }
    if (app_ids !== undefined) {
      await context.supabase.from("plan_apps").delete().eq("plan_id", data.id);
      if (app_ids.length > 0) {
        const rows = app_ids.map((app_id) => ({ plan_id: data.id, app_id }));
        const { error: peErr } = await context.supabase.from("plan_apps").insert(rows);
        if (peErr) throw peErr;
      }
    }
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "plan",
      entityId: data.id,
      action: "plan.updated",
      before,
      after: data.patch,
    });
    return { ok: true };
  });

export const archivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), archive: z.boolean() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { error } = await context.supabase
      .from("plans")
      .update({ is_archived: data.archive })
      .eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "plan",
      entityId: data.id,
      action: data.archive ? "plan.archived" : "plan.unarchived",
    });
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    // Refuse if any shops are on it
    const { count } = await context.supabase
      .from("shops")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete plan: ${count} shops are still subscribed. Archive it instead.`);
    }
    const { error } = await context.supabase.from("plans").delete().eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "plan",
      entityId: data.id,
      action: "plan.deleted",
    });
    return { ok: true };
  });
