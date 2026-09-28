/**
 * Odoo Server Functions
 *
 * Exposes Odoo health and employee data as TanStack React Start server functions
 * so the admin panel UI can call them with type safety and auth enforcement.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireRole, writeAudit } from "@/lib/rbac.server";
import { odooAdminExecute } from "./client";
import {
  checkShopHealth,
  fetchShopEmployees,
} from "./provisioning";

/**
 * Get the real-time Odoo health status for a shop.
 * Returns whether the DB is reachable, what modules are installed,
 * and whether there's drift between plan expectation and reality.
 */
export const getOdooShopHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({ shopId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);

    // Fetch the shop's odoo_db_name and plan modules from Supabase
    const { data: shop, error } = await context.supabase
      .from("shops")
      .select("odoo_db_name, provisioning_status, plan:plans(id, name)")
      .eq("id", data.shopId)
      .maybeSingle();

    if (error) throw error;
    if (!shop) throw new Error("Shop not found");

    // Fetch plan modules
    let planModules: string[] = [];
    if (shop.plan) {
      const { data: planApps } = await context.supabase
        .from("plan_apps")
        .select("apps(odoo_module_name)")
        .eq("plan_id", (shop.plan as { id: string }).id);

      planModules = (planApps ?? [])
        .map((pa: { apps: { odoo_module_name: string } | null }) => pa.apps?.odoo_module_name)
        .filter(Boolean) as string[];
    }

    const health = await checkShopHealth(shop.odoo_db_name);

    // Drift detection: modules the plan expects that aren't installed
    const missingModules = planModules.filter(
      (m) => !health.installedModuleNames.includes(m),
    );
    const extraModules = health.installedModuleNames.filter(
      (m) =>
        !planModules.includes(m) &&
        !["base", "web", "mail", "l10n_in", "bus"].includes(m),
    );

    return {
      ...health,
      planModules,
      missingModules,
      extraModules,
      hasDrift: missingModules.length > 0,
    };
  });

/**
 * Fetch the actual employees/users of a shop from its Odoo database.
 * This reads real res.users from the shop's isolated Odoo DB.
 */
export const getShopOdooEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({ shopId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);

    const { data: shop, error } = await context.supabase
      .from("shops")
      .select("odoo_db_name, provisioning_status")
      .eq("id", data.shopId)
      .maybeSingle();

    if (error) throw error;
    if (!shop) throw new Error("Shop not found");

    if (shop.provisioning_status !== "live") {
      return { employees: [], message: "Shop is not yet live — no employees to show." };
    }

    const employees = await fetchShopEmployees(shop.odoo_db_name);
    return { employees, message: null };
  });

/**
 * Set / reset an Odoo user's password directly from the admin panel.
 * Uses superadmin credentials to execute res.users write in Odoo.
 */
export const setShopUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        shopId: z.string().uuid(),
        userId: z.number().int(),
        newPassword: z.string().min(1, "Password is required"),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin", "support"]);

    const { data: shop, error } = await context.supabase
      .from("shops")
      .select("odoo_db_name, business_name")
      .eq("id", data.shopId)
      .maybeSingle();

    if (error) throw error;
    if (!shop?.odoo_db_name) throw new Error("Shop Odoo database not found or not provisioned.");

    await odooAdminExecute(shop.odoo_db_name, "res.users", "write", [
      [data.userId],
      { password: data.newPassword },
    ]);

    await writeAudit(context.supabase, {
      actor: { id: actor.user_id, user_id: actor.user_id, email: actor.email },
      shopId: data.shopId,
      entityType: "shop",
      entityId: data.shopId,
      action: "user.password_reset",
      after: { userId: data.userId, shopName: shop.business_name, password_changed: true },
    });


    return { success: true };
  });
