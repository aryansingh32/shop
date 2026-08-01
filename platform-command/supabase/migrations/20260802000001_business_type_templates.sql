-- ============================================================
-- Migration: Business-Type Onboarding Templates
-- ============================================================
--
-- Feature 1 — Business-Type Onboarding Templates (P0)
--
-- Adds a business_type_templates table that drives which Odoo
-- modules are pre-enabled when a shop is provisioned.
-- This is additive-only — no existing tables or data are modified.
-- The shops.business_type_slug column is nullable so existing shops
-- and the no-template provisioning path are unaffected.
-- ============================================================

-- ============ TABLE ============
CREATE TABLE public.business_type_templates (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT          NOT NULL UNIQUE,             -- 'kirana','pharmacy', etc.
  name                  TEXT          NOT NULL,
  icon                  TEXT,                                      -- lucide-react icon name
  default_app_slugs     TEXT[]        NOT NULL DEFAULT '{}',       -- additive defaults at provisioning
  default_receipt_footer TEXT,                                     -- optional receipt footer copy
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_type_templates TO authenticated;
GRANT ALL                             ON public.business_type_templates TO service_role;
ALTER TABLE public.business_type_templates ENABLE ROW LEVEL SECURITY;

-- RLS: same pattern as public.apps
-- Any authenticated admin can SELECT (public template catalog, no PII)
CREATE POLICY "admins view business_type_templates"
  ON public.business_type_templates FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Super admin can INSERT/UPDATE/DELETE templates
CREATE POLICY "super admins manage business_type_templates"
  ON public.business_type_templates FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));

-- Public read policy for the unauthenticated onboarding screen
-- (getBusinessTypeTemplatesFn uses service_role key server-side, so
--  this policy exists to allow anon reads in a future self-serve flow)
CREATE POLICY "public can read business_type_templates"
  ON public.business_type_templates FOR SELECT TO anon
  USING (true);

-- ============ NEW COLUMN ON SHOPS ============
-- Nullable FK — existing shops keep NULL (no template applied), which
-- provisionShop() treats as "no template" (identical to pre-feature behavior).
ALTER TABLE public.shops
  ADD COLUMN business_type_slug TEXT
    REFERENCES public.business_type_templates(slug)
    ON DELETE SET NULL;

-- ============ SEED DATA — 7 Business Personas from Blueprint §4 ============
-- default_app_slugs must only reference slugs already present in public.apps.
-- As of this migration the catalog contains:
--   pos, inventory, sales, accounting, employees, barcodes, purchase
-- These are additive defaults only; they cannot exceed what the plan grants.

INSERT INTO public.business_type_templates
  (slug, name, icon, default_app_slugs, default_receipt_footer)
VALUES

  -- 1. Grocery / Kirana — core checkout + stock, simplest setup
  ('kirana', 'Kirana / Grocery', 'ShoppingCart',
   ARRAY['pos', 'inventory', 'barcodes'],
   'Thank you for shopping with us!'),

  -- 2. Pharmacy — needs inventory for stock expiry tracking + accounting for audit
  ('pharmacy', 'Pharmacy / Medical', 'Heart',
   ARRAY['pos', 'inventory', 'accounting', 'barcodes'],
   'Your health is our priority.'),

  -- 3. Electronics — sales orders for warranty tracking, accounting for returns
  ('electronics', 'Electronics', 'Cpu',
   ARRAY['pos', 'inventory', 'sales', 'accounting', 'barcodes'],
   'Thank you for your purchase. Please retain this bill for warranty claims.'),

  -- 4. Clothing — POS + inventory for sizes/variants
  ('clothing', 'Clothing / Apparel', 'Shirt',
   ARRAY['pos', 'inventory', 'barcodes'],
   'Thank you for shopping with us!'),

  -- 5. Hardware — purchase orders critical for stock replenishment
  ('hardware', 'Hardware / Tools', 'Wrench',
   ARRAY['pos', 'inventory', 'purchase', 'barcodes'],
   'Thank you for your business.'),

  -- 6. Mobile Shop — sales + accounting for EMI/warranty
  ('mobile_shop', 'Mobile Shop', 'Smartphone',
   ARRAY['pos', 'inventory', 'sales', 'accounting', 'barcodes'],
   'Thank you for your purchase. Retain bill for service claims.'),

  -- 7. Bakery — POS-first, lightweight setup (perishables, no complex inventory)
  ('bakery', 'Bakery / Food', 'Coffee',
   ARRAY['pos', 'inventory'],
   'Fresh baked with love. Thank you!');
