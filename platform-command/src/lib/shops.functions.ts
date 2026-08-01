import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin, requireRole, writeAudit } from "./rbac.server";
import {
  provisionShop,
  deprovisionShop,
  suspendShopOdoo,
  reactivateShopOdoo,
  syncPlanModules,
  generateDbName,
} from "./odoo/provisioning";


const businessType = z.enum(["mobile_shop", "clothing_shop", "mall", "other"]);

const createShopSchema = z.object({
  business_name: z.string().min(2).max(120),
  owner_name: z.string().min(2).max(120),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  business_type: businessType,
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
  subdomain: z.string().regex(/^[a-z0-9-]+$/i).min(3).max(60).optional().nullable(),
  plan_id: z.string().uuid().optional().nullable(),
  admin_password: z.string().min(3).max(100).optional(),
  /** Feature 1 — Business-Type Onboarding Templates: optional slug that pre-selects
   * Odoo modules at provisioning time. If omitted, provisioning uses plan modules only
   * (identical to pre-feature behavior). */
  business_type_slug: z.string().max(60).optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Unique subdomain generator
// ─────────────────────────────────────────────────────────────────────────────

export async function generateUniqueSubdomain(
  supabase: SupabaseClient,
  baseName: string,
  currentShopId?: string
): Promise<string> {
  const cleanSlug = baseName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shop";

  let candidate = cleanSlug;
  let counter = 1;

  while (true) {
    let q = supabase.from("shops").select("id").eq("subdomain", candidate);
    if (currentShopId) {
      q = q.neq("id", currentShopId);
    }

    const { data } = await q.maybeSingle();
    if (!data) {
      return candidate;
    }
    candidate = `${cleanSlug}-${counter}`;
    counter++;
  }
}

// Check Subdomain Availability server function
export const checkSubdomainAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ subdomain: z.string(), shopId: z.string().optional() }).parse(raw)
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const suggested = await generateUniqueSubdomain(context.supabase, data.subdomain, data.shopId);
    return {
      available: suggested === data.subdomain.toLowerCase().trim(),
      suggested,
    };
  });


// ─────────────────────────────────────────────────────────────────────────────
// Helper: fetch plan module names from Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function getPlanModules(
  supabase: SupabaseClient,
  planId: string | null | undefined,
): Promise<string[]> {
  if (!planId) return [];
  const { data } = await supabase
    .from("plan_apps")
    .select("apps(odoo_module_name)")
    .eq("plan_id", planId);
  return (data ?? [])
    .flatMap((pa: any) =>
      Array.isArray(pa.apps)
        ? pa.apps.map((a: any) => a.odoo_module_name)
        : pa.apps
        ? [pa.apps.odoo_module_name]
        : [],
    )
    .filter(Boolean) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// List shops
// ─────────────────────────────────────────────────────────────────────────────

export const listShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        businessType: z.string().optional(),
        planId: z.string().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("shops")
      .select("*, plan:plans(id, name, monthly_price_inr)")
      .order("created_at", { ascending: false });

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "").trim();
      q = q.or(
        `business_name.ilike.%${s}%,owner_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,gstin.ilike.%${s}%`,
      );
    }
    if (data.status && data.status !== "all") q = q.eq("subscription_status", data.status as never);
    if (data.businessType && data.businessType !== "all")
      q = q.eq("business_type", data.businessType as never);
    if (data.planId && data.planId !== "all") q = q.eq("plan_id", data.planId);

    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((s: any) => ({
      ...s,
      subdomain: s.subdomain || s.business_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    }));
  });

// ─────────────────────────────────────────────────────────────────────────────
// Get single shop
// ─────────────────────────────────────────────────────────────────────────────

export const getShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: shop, error } = await context.supabase
      .from("shops")
      .select("*, plan:plans(id, name, monthly_price_inr, trial_days, max_seats)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!shop) throw new Error("Shop not found");

    // Auto-backfill subdomain for legacy shops if missing in database
    if (!shop.subdomain) {
      const generated = await generateUniqueSubdomain(context.supabase, shop.business_name, shop.id);
      await context.supabase.from("shops").update({ subdomain: generated }).eq("id", shop.id);
      shop.subdomain = generated;
    }

    const { data: activity } = await context.supabase
      .from("audit_log")
      .select("id, action, entity_type, actor_email, before_state, after_state, created_at")
      .eq("shop_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Prefer the direct column; fall back to audit log for legacy records; then default to 'admin'
    const currentPassword =
      (shop as any).odoo_admin_password ||
      (() => {
        const entry = (activity ?? []).find((a: any) => {
          const st = a.after_state as any;
          return st && typeof st.admin_password === "string" && st.admin_password.length > 0;
        });
        return entry ? (entry.after_state as any).admin_password : "admin";
      })();

    return { shop, activity: activity ?? [], currentPassword };
  });


// ─────────────────────────────────────────────────────────────────────────────
// Create shop — wires real Odoo provisioning
// ─────────────────────────────────────────────────────────────────────────────

export const createShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createShopSchema.parse(raw))
  .handler(async ({ context, data }) => {
    console.log("🔥 PROVISIONING STARTED", data.business_name);
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    // Determine trial_ends_at from plan
    let trialEndsAt: string | null = null;
    if (data.plan_id) {
      const { data: plan } = await context.supabase
        .from("plans")
        .select("trial_days")
        .eq("id", data.plan_id)
        .maybeSingle();
      if (plan) {
        const dt = new Date();
        dt.setDate(dt.getDate() + (plan.trial_days ?? 14));
        trialEndsAt = dt.toISOString();
      }
    }

    // Generate guaranteed unique subdomain to prevent duplicacy
    const subdomain = await generateUniqueSubdomain(
      context.supabase,
      data.subdomain || data.business_name
    );

    // Generate a unique Odoo DB name
    const odooDbName = generateDbName(subdomain);


    // Determine admin credentials for this shop's Odoo instance
    // Use owner email if provided, else generate from business name
    const ownerEmail = data.email ?? `admin@${subdomain}.kshetra.app`;
    const ownerPassword = data.admin_password || "admin"; // Use provided password or default to 'admin'

    // Insert shop into Supabase with provisioning_status = 'provisioning'
    // Store admin credentials directly so the panel can always display/reset them.
    const { data: created, error } = await context.supabase
      .from("shops")
      .insert({
        business_name: data.business_name,
        owner_name: data.owner_name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        business_type: data.business_type,
        city: data.city ?? null,
        state: data.state ?? null,
        gstin: data.gstin ?? null,
        subdomain,
        plan_id: data.plan_id ?? null,
        subscription_status: "trial",
        provisioning_status: "provisioning",
        odoo_db_name: odooDbName,
        odoo_admin_email: ownerEmail,
        odoo_admin_password: ownerPassword,
        trial_ends_at: trialEndsAt,
        // Feature 1: store the chosen business type for future reference
        business_type_slug: data.business_type_slug ?? null,
      } as any)
      .select()
      .single();
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: created.id,
      entityType: "shop",
      entityId: created.id,
      action: "shop.created",
      after: { ...created, admin_password: ownerPassword },
    });
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: created.id,
      entityType: "shop",
      entityId: created.id,
      action: "provisioning.queued",
      after: { odoo_db_name: odooDbName, admin_password: ownerPassword },
    });

    // Fetch modules for the assigned plan
    const moduleNames = await getPlanModules(context.supabase, data.plan_id);

    // Kick off Odoo provisioning — runs async, writes result back to Supabase
    // We do NOT await this — return immediately so the UI isn't blocked.
    // The shop will transition from 'provisioning' → 'live' or 'failed' in the background.
    runProvisioningAsync(
      context.supabase,
      created.id,
      odooDbName,
      ownerEmail,
      ownerPassword,
      moduleNames,
      actor,
      // Feature 1: pass the chosen business type slug so provisionShop() can
      // look up and merge the template's default_app_slugs at install time.
      data.business_type_slug ?? undefined,
    ).catch(err => {
      console.error("🔥 FATAL: runProvisioningAsync threw an unhandled error:", err);
    });

    return created;
  });

/** Non-blocking provisioning runner — updates Supabase when done */
async function runProvisioningAsync(
  supabase: SupabaseClient,
  shopId: string,
  odooDbName: string,
  ownerEmail: string,
  ownerPassword: string,
  moduleNames: string[],
  actor: { id: string; email: string },
  /** Feature 1: optional business-type slug forwarded to provisionShop() */
  businessTypeSlug?: string,
) {
  const result = await provisionShop(odooDbName, ownerEmail, ownerPassword, moduleNames, businessTypeSlug);

  if (result.success) {
    await supabaseAdmin
      .from("shops")
      .update({ provisioning_status: "live" })
      .eq("id", shopId);
    await writeAudit(supabaseAdmin, {
      actor,
      shopId,
      entityType: "shop",
      entityId: shopId,
      action: "provisioning.live",
      after: { odoo_db_name: odooDbName, modules: result.installedModules },
    });
  } else {
    await supabaseAdmin
      .from("shops")
      .update({
        provisioning_status: "failed",
        provisioning_error: result.error,
      })
      .eq("id", shopId);
    await writeAudit(supabaseAdmin, {
      actor,
      shopId,
      entityType: "shop",
      entityId: shopId,
      action: "provisioning.failed",
      after: { error: result.error },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update shop details
// ─────────────────────────────────────────────────────────────────────────────

export const updateShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: createShopSchema.partial(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin", "billing_admin"]);
    const { data: before } = await context.supabase
      .from("shops")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Shop not found");

    const { data: updated, error } = await context.supabase
      .from("shops")
      .update(data.patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "shop.updated",
      before,
      after: updated,
    });
    return updated;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Change plan — triggers Odoo module sync
// ─────────────────────────────────────────────────────────────────────────────

export const changeShopPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), plan_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin", "billing_admin"]);
    const { data: shop } = await context.supabase
      .from("shops")
      .select("id, plan_id, odoo_db_name, provisioning_status")
      .eq("id", data.id)
      .maybeSingle();
    if (!shop) throw new Error("Shop not found");

    const { error } = await context.supabase
      .from("shops")
      .update({ plan_id: data.plan_id })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "shop.plan_changed",
      before: { plan_id: shop.plan_id },
      after: { plan_id: data.plan_id },
    });

    // Sync Odoo modules if the shop is live
    if (shop.provisioning_status === "live" && shop.odoo_db_name) {
      const [oldModules, newModules] = await Promise.all([
        getPlanModules(context.supabase, shop.plan_id),
        getPlanModules(context.supabase, data.plan_id),
      ]);

      // Run async — module install can take minutes
      void syncPlanModules(shop.odoo_db_name, oldModules, newModules)
        .then(({ installed, uninstalled }) => {
          if (installed.length > 0 || uninstalled.length > 0) {
            void writeAudit(context.supabase, {
              actor,
              shopId: data.id,
              entityType: "shop",
              entityId: data.id,
              action: "shop.modules_synced",
              after: { installed, uninstalled },
            });
          }
        })
        .catch((err) => {
          void writeAudit(context.supabase, {
            actor,
            shopId: data.id,
            entityType: "shop",
            entityId: data.id,
            action: "shop.module_sync_failed",
            after: { error: String(err) },
          });
        });
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Suspend — blocks Odoo access, preserves data
// ─────────────────────────────────────────────────────────────────────────────

export const suspendShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().optional() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    const { data: shop } = await context.supabase
      .from("shops")
      .select("odoo_db_name, provisioning_status")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("shops")
      .update({
        subscription_status: "suspended",
        provisioning_status: "suspended",
        suspended_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "shop.suspended",
      after: { reason: data.reason ?? null },
    });

    // Deactivate Odoo users (non-blocking)
    if (shop?.odoo_db_name) {
      void suspendShopOdoo(shop.odoo_db_name).catch((err) => {
        void writeAudit(context.supabase, {
          actor,
          shopId: data.id,
          entityType: "shop",
          entityId: data.id,
          action: "shop.odoo_suspend_failed",
          after: { error: String(err) },
        });
      });
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Reactivate — restores Odoo access
// ─────────────────────────────────────────────────────────────────────────────

export const reactivateShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    const { data: shop } = await context.supabase
      .from("shops")
      .select("odoo_db_name")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("shops")
      .update({
        subscription_status: "active",
        provisioning_status: "live",
        suspended_at: null,
      })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "shop.reactivated",
    });

    // Re-enable Odoo users (non-blocking)
    if (shop?.odoo_db_name) {
      void reactivateShopOdoo(shop.odoo_db_name).catch((err) => {
        void writeAudit(context.supabase, {
          actor,
          shopId: data.id,
          entityType: "shop",
          entityId: data.id,
          action: "shop.odoo_reactivate_failed",
          after: { error: String(err) },
        });
      });
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Delete — drops Odoo DB and removes Supabase record
// ─────────────────────────────────────────────────────────────────────────────

export const deleteShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), confirmName: z.string() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const { data: shop } = await context.supabase
      .from("shops")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!shop) throw new Error("Shop not found");
    if (shop.business_name !== data.confirmName) {
      throw new Error("Confirmation name did not match");
    }

    // Log before deletion (audit_log has shop_id ON DELETE SET NULL so entry survives)
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "shop.deleted",
      before: shop,
    });

    // Drop Odoo database first (non-blocking — don't wait)
    void deprovisionShop(shop.odoo_db_name).catch(() => {
      // Log failure silently — Supabase record is already gone at this point
    });

    const { error } = await context.supabase.from("shops").delete().eq("id", data.id);
    if (error) throw error;

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Retry provisioning
// ─────────────────────────────────────────────────────────────────────────────

export const retryProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    const { data: shop } = await context.supabase
      .from("shops")
      .select("odoo_db_name, plan_id, email, subdomain, business_name, odoo_admin_password")
      .eq("id", data.id)
      .maybeSingle();
    if (!shop) throw new Error("Shop not found");

    const { error } = await context.supabase
      .from("shops")
      .update({
        provisioning_status: "provisioning",
        provisioning_error: null,
      })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: "provisioning.retry_queued",
    });

    // Re-run provisioning
    const moduleNames = await getPlanModules(context.supabase, shop.plan_id);
    const ownerEmail = shop.email ?? `admin@${shop.subdomain}.kshetra.app`;
    const ownerPassword = shop.odoo_admin_password || "admin";

    // Use existing db name if we already have one, else generate new
    const odooDbName = shop.odoo_db_name ?? generateDbName(shop.subdomain ?? shop.business_name);

    void runProvisioningAsync(
      context.supabase,
      data.id,
      odooDbName,
      ownerEmail,
      ownerPassword,
      moduleNames,
      actor,
    );

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Manual override: mark provisioning result (super admin ops escape hatch)
// ─────────────────────────────────────────────────────────────────────────────

export const markProvisioningResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        result: z.enum(["live", "failed"]),
        error: z.string().optional(),
        odoo_db_name: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);
    const patch =
      data.result === "live"
        ? {
            provisioning_status: "live" as const,
            provisioning_error: null,
            subscription_status: "trial" as const,
            odoo_db_name: data.odoo_db_name ?? null,
          }
        : {
            provisioning_status: "failed" as const,
            provisioning_error: data.error ?? "Provisioning failed",
          };
    const { error } = await context.supabase.from("shops").update(patch).eq("id", data.id);
    if (error) throw error;
    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      shopId: data.id,
      entityType: "shop",
      entityId: data.id,
      action: `provisioning.${data.result}`,
      after: patch,
    });
    return { ok: true };
  });
