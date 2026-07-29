import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminContext } from "./rbac.server";

export const getCurrentAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdminContext(context.supabase, context.userId);
    if (!admin) return null;
    // Best-effort update of last_login_at (rate-limited by client cadence).
    await context.supabase
      .from("admin_team_members")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", admin.id);
    return admin;
  });
