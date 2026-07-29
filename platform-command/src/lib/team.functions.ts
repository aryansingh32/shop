import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireRole, writeAudit } from "./rbac.server";

const roleSchema = z.enum(["super_admin", "billing_admin", "support"]);

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("admin_team_members")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        email: z.string().email(),
        role: roleSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: created, error } = await context.supabase
      .from("admin_team_members")
      .insert({
        name: data.name,
        email: data.email.toLowerCase(),
        role: data.role,
        status: "invited",
        invited_by: actor.id,
      } as never)
      .select()
      .single();
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "team_member",
      entityId: created.id,
      action: "team.invited",
      after: created,
    });
    return created;
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(2).max(120).optional(),
          role: roleSchema.optional(),
          status: z.enum(["active", "invited", "suspended"]).optional(),
        }),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: before } = await context.supabase
      .from("admin_team_members")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Team member not found");
    // Prevent removing the last active super_admin
    if (before.role === "super_admin" && (data.patch.role || data.patch.status)) {
      const { count } = await context.supabase
        .from("admin_team_members")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) {
        throw new Error("Cannot demote or suspend the last active Super Admin.");
      }
    }
    const { error } = await context.supabase
      .from("admin_team_members")
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "team_member",
      entityId: data.id,
      action: "team.updated",
      before,
      after: data.patch,
    });
    return { ok: true };
  });

export const revokeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: before } = await context.supabase
      .from("admin_team_members")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Team member not found");
    if (before.user_id === actor.id) throw new Error("You can't revoke your own access.");
    if (before.role === "super_admin") {
      const { count } = await context.supabase
        .from("admin_team_members")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Error("Cannot revoke the last Super Admin.");
    }
    const { error } = await context.supabase
      .from("admin_team_members")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "team_member",
      entityId: data.id,
      action: "team.revoked",
      before,
    });
    return { ok: true };
  });
