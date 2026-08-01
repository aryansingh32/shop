-- ============================================================
-- Migration: Add pricing fields to apps table
-- ============================================================
--
-- Feature 4 — Marketplace Price Transparency (P0)
--
-- Adds three pricing-metadata columns to the existing public.apps table:
--   monthly_price_inr : visible price for marketplace display
--   is_addon          : true = sold separately; false = bundled in plan tiers
--   pricing_note      : optional human-readable pricing context
--
-- This is purely additive schema — no existing rows or RLS policies
-- are changed. All 7 existing app rows get monthly_price_inr = 0 and
-- is_addon = false via the column defaults (they are bundled in plan
-- tiers today, not sold separately).
--
-- IMPORTANT: monthly_price_inr = 0 does NOT mean "free forever" — it means
-- "not sold separately at this time." Billing/invoicing integration for
-- non-zero add-on pricing is out of scope for this pass.
-- ============================================================

ALTER TABLE public.apps
  ADD COLUMN monthly_price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN is_addon           BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN pricing_note       TEXT;

-- Price fields are non-sensitive — all authenticated admins may read them.
-- Write access remains super_admin-only via the existing apps table RLS.
-- No new RLS policies needed; the existing ones cover the new columns.

COMMENT ON COLUMN public.apps.monthly_price_inr IS
  'Merchant-visible monthly price in INR. 0 = bundled in plan tier (not sold separately). Non-zero = add-on price for is_addon apps.';
COMMENT ON COLUMN public.apps.is_addon IS
  'true = this app is sold separately (add-on beyond plan tier); false = included in one or more plan tiers.';
COMMENT ON COLUMN public.apps.pricing_note IS
  'Optional human-readable pricing context shown in marketplace (e.g. "Included in Growth plan").';
