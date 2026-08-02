-- ============================================================
-- Migration: Wire loyalty app to Premium plan
-- ============================================================
--
-- Feature 6 — Follow-up: Loyalty plan wiring
--
-- The 20260802000003_loyalty_app.sql migration left loyalty without
-- a plan_apps row, with a comment asking product to decide which
-- tier includes it.
--
-- PRODUCT DECISION (recorded here):
--   Loyalty → Premium plan only for launch.
--   Rationale: Loyalty programs require the merchant to have enough
--   repeat customers to benefit. Premium merchants (₹1499/mo) are
--   the segment most likely to have this. Standard shops can upgrade.
--   This can be extended to Standard later without a breaking change.
--
-- Standard plan inclusion (if decided later):
--   Run the block below with p.slug = 'standard' as well.
-- ============================================================

INSERT INTO public.plan_apps (plan_id, app_id)
SELECT p.id, a.id
FROM public.plans p, public.apps a
WHERE p.slug = 'premium'
  AND a.slug = 'loyalty'
  AND p.is_archived = FALSE
ON CONFLICT DO NOTHING;
