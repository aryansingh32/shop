-- ============================================================
-- Migration: Redact stored Odoo passwords
-- ============================================================
--
-- First-login and reset passwords must not remain in platform tables or
-- audit JSON. Operators can set a new password through the admin reset flow.
-- ============================================================

UPDATE public.shops
SET odoo_admin_password = NULL
WHERE odoo_admin_password IS NOT NULL;

UPDATE public.audit_log
SET after_state = after_state - 'admin_password' - 'odoo_admin_password'
WHERE after_state ? 'admin_password'
   OR after_state ? 'odoo_admin_password';

UPDATE public.audit_log
SET before_state = before_state - 'admin_password' - 'odoo_admin_password'
WHERE before_state ? 'admin_password'
   OR before_state ? 'odoo_admin_password';
