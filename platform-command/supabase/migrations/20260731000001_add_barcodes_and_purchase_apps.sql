-- ============================================================
-- Migration: Add barcodes and purchase to the app catalog
-- ============================================================
--
-- Fix 5 from the routing/provisioning audit (2026-07-31):
--
-- 1. BARCODES — was missing from the catalog entirely.
--    Barcode scanning is core to fast POS checkout and is native to every
--    Odoo installation (the barcodes module ships with base). It must be
--    in every plan tier — it is NOT a premium add-on, fast barcode-driven
--    checkout is the whole product's value proposition.
--    Technical module name: barcodes
--    NOTE: barcodes is also now hardcoded into provisionShop() so it is
--    always installed regardless of plan assignment. This catalog entry
--    exists so admins can see it in the panel and manage it explicitly.
--
-- 2. PURCHASE — closes the reorder-from-supplier gap.
--    Shop owners need to record restocking from suppliers. The purchase
--    module provides Purchase Orders (vendor bills, receipts from suppliers).
--    Technical module name: purchase
--    Included in: Premium plan only (a very small single-counter shop may
--    not need supplier ordering immediately; it's a meaningful mid-tier
--    differentiator).
--    NOTE: If a shop on the Standard plan later needs this, the super admin
--    can upgrade their plan or manually add it to plan_apps.
--
-- 3. LOYALTY — no catalog entry added. loyalty is already native to
--    point_of_sale/sale and ships automatically. Whether to expose it as a
--    distinct plan-gated feature (to sell as a higher-tier differentiator)
--    versus leaving it always-on is a product/pricing decision that was
--    flagged back to the product team — not decided unilaterally here.
-- ============================================================

-- Add barcodes app
INSERT INTO public.apps (slug, name, description, icon, odoo_module_name)
VALUES (
  'barcodes',
  'Barcode Scanning',
  'Native barcode scanning for fast POS checkout — scan products at the counter instead of typing names',
  'Scan',
  'barcodes'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  odoo_module_name = EXCLUDED.odoo_module_name;

-- Add purchase app
INSERT INTO public.apps (slug, name, description, icon, odoo_module_name)
VALUES (
  'purchase',
  'Purchase & Reordering',
  'Create purchase orders from suppliers to restock inventory — track vendor bills and receiving',
  'ShoppingBag',
  'purchase'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  odoo_module_name = EXCLUDED.odoo_module_name;

-- Wire barcodes into ALL existing plans (Standard + Premium)
-- Barcodes is a core capability, not a premium add-on.
INSERT INTO public.plan_apps (plan_id, app_id)
SELECT p.id, a.id
FROM public.plans p, public.apps a
WHERE a.slug = 'barcodes'
  AND p.is_archived = FALSE
ON CONFLICT DO NOTHING;

-- Wire purchase into Premium plan ONLY
-- Standard (₹999) is designed for the smallest single-counter shop that
-- may not deal with supplier ordering. Premium (₹1499) shops are more
-- established businesses that need the full reorder workflow.
INSERT INTO public.plan_apps (plan_id, app_id)
SELECT p.id, a.id
FROM public.plans p, public.apps a
WHERE p.slug = 'premium'
  AND a.slug = 'purchase'
ON CONFLICT DO NOTHING;
