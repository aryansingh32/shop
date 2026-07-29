import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./rbac.server";

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        entityType: z.string().optional(),
        shopId: z.string().optional(),
        actorEmail: z.string().optional(),
        action: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("audit_log")
      .select("*, shop:shops(id, business_name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.entityType && data.entityType !== "all") q = q.eq("entity_type", data.entityType);
    if (data.shopId) q = q.eq("shop_id", data.shopId);
    if (data.actorEmail) q = q.ilike("actor_email", `%${data.actorEmail}%`);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
