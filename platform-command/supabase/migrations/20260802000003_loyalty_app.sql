-- ============================================================
-- Migration: Add loyalty app to catalog
-- ============================================================
--
-- Feature 6 — Loyalty Install + Balance Widget (P0)
--
-- Adds a 'loyalty' app row to the public.apps table.
-- Does NOT associate it with any plan_apps row — the product team
-- must decide which plan tier(s) include loyalty before this is wired.
-- Until then, loyalty can be enabled per-shop as an add-on via
-- the marketplace (Feature 5) once that is built.
--
-- Note: this migration only handles the Supabase catalog entry.
-- The Odoo-side provisioning changes (odooCreateLoyaltyProgram call
-- in provisionShop) are in platform-command/src/lib/odoo/provisioning.ts
-- and platform-command/src/lib/odoo/client.ts.
-- ============================================================

INSERT INTO public.apps (slug, name, description, icon, odoo_module_name)
VALUES (
  'loyalty',
  'Rewards',
  'Give regular customers points on every purchase — redeemable for discounts at checkout',
  'Star',
  'loyalty'
)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  icon             = EXCLUDED.icon,
  odoo_module_name = EXCLUDED.odoo_module_name;

-- ============================================================
-- OPEN QUESTION (product decision required before resolving):
-- Which plan tier(s) should include loyalty?
--
-- Option A: Premium plan only (differentiator from Standard)
-- Option B: All plans (loyalty as a baseline feature for all shops)
-- Option C: Add-on only (merchants must explicitly purchase)
--
-- Until product decides, no plan_apps row is inserted here.
-- To add loyalty to a plan once decided, run:
--   INSERT INTO public.plan_apps (plan_id, app_id)
--   SELECT p.id, a.id FROM public.plans p, public.apps a
--   WHERE p.slug = '<plan_slug>' AND a.slug = 'loyalty'
--   ON CONFLICT DO NOTHING;
-- ============================================================
