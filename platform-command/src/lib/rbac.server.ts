import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminRole = "super_admin" | "billing_admin" | "support";

export async function getAdminContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ id: string; user_id: string; name: string; email: string; role: AdminRole; status: string } | null> {
  const { data } = await supabase
    .from("admin_team_members")
    .select("id, user_id, name, email, role, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return data as { id: string; user_id: string; name: string; email: string; role: AdminRole; status: string };
}

export async function requireAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ id: string; user_id: string; name: string; email: string; role: AdminRole }> {
  const ctx = await getAdminContext(supabase, userId);
  if (!ctx) {
    throw new Error("Forbidden: not an active admin team member");
  }
  return ctx;
}

export async function requireRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  allowed: AdminRole[],
): Promise<{ id: string; user_id: string; name: string; email: string; role: AdminRole }> {
  const ctx = await requireAdmin(supabase, userId);
  if (!allowed.includes(ctx.role)) {
    throw new Error(`Forbidden: this action requires role ${allowed.join(" or ")}`);
  }
  return ctx;
}

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function writeAudit(
  supabase: SupabaseClient<Database>,
  args: {
    actor: { id: string; user_id?: string; email: string };
    shopId?: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    const actorId = args.actor.user_id || args.actor.id;
    const { error } = await supabaseAdmin.from("audit_log").insert({
      actor_id: actorId,
      actor_email: args.actor.email,
      shop_id: args.shopId ?? null,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      action: args.action,
      before_state: (args.before as never) ?? null,
      after_state: (args.after as never) ?? null,
    });
    if (error) console.error("⚠️ writeAudit error:", error);
  } catch (err) {
    console.error("⚠️ writeAudit threw:", err);
  }
}
