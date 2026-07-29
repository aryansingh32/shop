
-- ============ ENUMS ============
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'billing_admin', 'support');
CREATE TYPE public.admin_status AS ENUM ('active', 'invited', 'suspended');
CREATE TYPE public.shop_subscription_status AS ENUM ('trial', 'active', 'past_due', 'suspended', 'cancelled');
CREATE TYPE public.shop_provisioning_status AS ENUM ('pending', 'provisioning', 'live', 'failed', 'suspended', 'deleted');
CREATE TYPE public.shop_business_type AS ENUM ('mobile_shop', 'clothing_shop', 'mall', 'other');

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ ADMIN TEAM MEMBERS ============
CREATE TABLE public.admin_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.admin_role NOT NULL DEFAULT 'support',
  status public.admin_status NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_team_members TO authenticated;
GRANT ALL ON public.admin_team_members TO service_role;
ALTER TABLE public.admin_team_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_admin_team_members_updated BEFORE UPDATE ON public.admin_team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ROLE HELPER (SECURITY DEFINER, avoids RLS recursion) ============
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id UUID, _role public.admin_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_team_members
    WHERE user_id = _user_id AND role = _role AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_team_members
    WHERE user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS public.admin_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.admin_team_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

-- Policies for admin_team_members
CREATE POLICY "admins can view team" ON public.admin_team_members FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "super admins manage team" ON public.admin_team_members FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));

-- ============ BOOTSTRAP: first user becomes super admin ============
CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing_count INT;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM public.admin_team_members;
  IF existing_count = 0 THEN
    INSERT INTO public.admin_team_members (user_id, name, email, role, status)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email, 'super_admin', 'active');
  ELSE
    -- If invited (email exists as invited row), link the user_id
    UPDATE public.admin_team_members SET user_id = NEW.id, status = 'active'
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_user();

-- ============ PLANS ============
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  monthly_price_inr INTEGER NOT NULL CHECK (monthly_price_inr >= 0),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  trial_days INTEGER NOT NULL DEFAULT 14 CHECK (trial_days >= 0),
  max_seats INTEGER NOT NULL DEFAULT 5 CHECK (max_seats > 0),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "admins view plans" ON public.plans FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "super admins manage plans" ON public.plans FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));

-- ============ APPS ============
CREATE TABLE public.apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  odoo_module_name TEXT NOT NULL,
  is_deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apps TO authenticated;
GRANT ALL ON public.apps TO service_role;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_apps_updated BEFORE UPDATE ON public.apps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "admins view apps" ON public.apps FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "super admins manage apps" ON public.apps FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));

-- ============ PLAN <-> APPS ============
CREATE TABLE public.plan_apps (
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, app_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_apps TO authenticated;
GRANT ALL ON public.plan_apps TO service_role;
ALTER TABLE public.plan_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view plan_apps" ON public.plan_apps FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "super admins manage plan_apps" ON public.plan_apps FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));

-- ============ SHOPS ============
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  business_type public.shop_business_type NOT NULL DEFAULT 'other',
  city TEXT,
  state TEXT,
  gstin TEXT,
  subdomain TEXT UNIQUE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  subscription_status public.shop_subscription_status NOT NULL DEFAULT 'trial',
  provisioning_status public.shop_provisioning_status NOT NULL DEFAULT 'pending',
  provisioning_error TEXT,
  odoo_db_name TEXT,
  trial_ends_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shops_status ON public.shops(subscription_status);
CREATE INDEX idx_shops_provisioning ON public.shops(provisioning_status);
CREATE INDEX idx_shops_plan ON public.shops(plan_id);
CREATE INDEX idx_shops_created ON public.shops(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_shops_updated BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "admins view shops" ON public.shops FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "super admins manage shops" ON public.shops FOR ALL TO authenticated
  USING (public.has_admin_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));
CREATE POLICY "billing admins update shops" ON public.shops FOR UPDATE TO authenticated
  USING (public.has_admin_role(auth.uid(), 'billing_admin'))
  WITH CHECK (public.has_admin_role(auth.uid(), 'billing_admin'));

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_shop ON public.audit_log(shop_id);
CREATE INDEX idx_audit_actor ON public.audit_log(actor_id);
CREATE INDEX idx_audit_entity ON public.audit_log(entity_type, entity_id);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view audit" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins insert audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND actor_id = auth.uid());

-- ============ SEED DATA ============
INSERT INTO public.apps (slug, name, description, icon, odoo_module_name) VALUES
  ('pos', 'Point of Sale', 'In-shop billing and checkout terminal', 'ShoppingCart', 'point_of_sale'),
  ('inventory', 'Inventory', 'Stock tracking and warehouse management', 'Package', 'stock'),
  ('sales', 'Sales', 'Sales orders, quotations, invoicing', 'TrendingUp', 'sale_management'),
  ('accounting', 'Accounting & GST', 'GST-compliant invoicing and books', 'BookOpen', 'account'),
  ('employees', 'Employee Management', 'Employee profiles, roles, and attendance', 'Users', 'hr');

INSERT INTO public.plans (name, slug, description, monthly_price_inr, trial_days, max_seats) VALUES
  ('Standard', 'standard', 'Core POS + Inventory for small shops', 999, 14, 3),
  ('Premium', 'premium', 'Everything: POS, Inventory, Sales, Accounting, Employees', 1499, 14, 10);

-- Map plans to apps
INSERT INTO public.plan_apps (plan_id, app_id)
SELECT p.id, a.id FROM public.plans p, public.apps a
WHERE p.slug = 'standard' AND a.slug IN ('pos', 'inventory');

INSERT INTO public.plan_apps (plan_id, app_id)
SELECT p.id, a.id FROM public.plans p, public.apps a
WHERE p.slug = 'premium' AND a.slug IN ('pos', 'inventory', 'sales', 'accounting', 'employees');
