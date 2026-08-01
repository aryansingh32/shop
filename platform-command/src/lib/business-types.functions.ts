/**
 * Business-Type Templates — server functions
 *
 * Provides read access to the business_type_templates catalog.
 * Used at shop creation time to pre-select default Odoo modules
 * based on the merchant's business type.
 *
 * No PII is stored in this table — it is safe to expose publicly
 * for the onboarding screen.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole, writeAudit } from "./rbac.server";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BusinessTypeTemplate {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  default_app_slugs: string[];
  default_receipt_footer: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public read — no auth required (onboarding step is pre-login)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all business-type templates.
 *
 * Intentionally unauthenticated — this data is non-sensitive catalog
 * information that the onboarding screen must display before a user has
 * logged in. Uses the service-role Supabase client (server-side only,
 * never exposed to the browser) to bypass RLS.
 *
 * @returns All business type template rows, ordered alphabetically by name.
 */
export const getBusinessTypeTemplatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BusinessTypeTemplate[]> => {
    const { data, error } = await supabaseAdmin
      .from("business_type_templates" as any)
      .select("id, slug, name, icon, default_app_slugs, default_receipt_footer, created_at")
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as BusinessTypeTemplate[];
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Get a single template by slug (used server-side by provisionShop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a single business-type template by slug.
 * Returns null if not found — callers must treat null as "no template applied."
 *
 * @param slug  The business type slug (e.g. 'pharmacy', 'kirana')
 * @returns     The matching template row or null
 */
export async function getBusinessTypeTemplateBySlug(
  slug: string,
): Promise<BusinessTypeTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from("business_type_templates" as any)
    .select("id, slug, name, icon, default_app_slugs, default_receipt_footer, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.warn(`[getBusinessTypeTemplateBySlug] Supabase error for slug "${slug}":`, error);
    return null;
  }
  return (data as BusinessTypeTemplate | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin CRUD (write) — restricted to super_admin role
// ─────────────────────────────────────────────────────────────────────────────

const templateWriteSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_]+$/).min(2).max(60),
  name: z.string().min(2).max(80),
  icon: z.string().max(60).optional().nullable(),
  default_app_slugs: z.array(z.string()).default([]),
  default_receipt_footer: z.string().max(200).optional().nullable(),
});

/** Create a new business-type template. Super-admin only. */
export const createBusinessTypeTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => templateWriteSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    const { data: created, error } = await context.supabase
      .from("business_type_templates" as any)
      .insert(data as any)
      .select()
      .single();
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "business_type_template",
      entityId: (created as any).id,
      action: "business_type_template.created",
      after: created,
    });

    return created as unknown as BusinessTypeTemplate;
  });

/** Update an existing business-type template. Super-admin only. */
export const updateBusinessTypeTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: templateWriteSchema.partial() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireRole(context.supabase, context.userId, ["super_admin"]);

    const { data: before } = await context.supabase
      .from("business_type_templates" as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Business type template not found");

    const { error } = await context.supabase
      .from("business_type_templates" as any)
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(context.supabase, {
      actor: { id: actor.id, email: actor.email },
      entityType: "business_type_template",
      entityId: data.id,
      action: "business_type_template.updated",
      before,
      after: data.patch,
    });

    return { ok: true };
  });
