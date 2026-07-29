-- Migration: Add odoo_admin_password column to shops table
-- This allows the admin panel to reliably show/reset the shop's Odoo admin password
-- without digging through audit logs

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS odoo_admin_password TEXT;

-- Also add odoo_admin_email for tracking the login email set in the shop's Odoo DB
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS odoo_admin_email TEXT;

-- Backfill existing shops from audit_log (best-effort)
-- For shops with provisioning.queued audit entries, extract the stored password
UPDATE public.shops s
SET odoo_admin_password = (
  SELECT (al.after_state->>'admin_password')
  FROM public.audit_log al
  WHERE al.shop_id = s.id
    AND al.action IN ('provisioning.queued', 'shop.created')
    AND al.after_state->>'admin_password' IS NOT NULL
  ORDER BY al.created_at DESC
  LIMIT 1
)
WHERE s.odoo_admin_password IS NULL;
