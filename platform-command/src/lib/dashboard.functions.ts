import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./rbac.server";

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Load all shops + plans (small-scale ops tool; direct aggregation is fine)
    const [shopsRes, plansRes] = await Promise.all([
      supabase
        .from("shops")
        .select("id, business_name, business_type, subscription_status, provisioning_status, plan_id, trial_ends_at, created_at"),
      supabase.from("plans").select("id, name, monthly_price_inr"),
    ]);
    if (shopsRes.error) throw shopsRes.error;
    if (plansRes.error) throw plansRes.error;

    const shops = shopsRes.data ?? [];
    const plans = plansRes.data ?? [];
    const planPrice = new Map(plans.map((p) => [p.id, p.monthly_price_inr]));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const active = shops.filter((s) => s.subscription_status === "active");
    const trials = shops.filter((s) => s.subscription_status === "trial");
    const cancelled = shops.filter((s) => s.subscription_status === "cancelled");

    const mrr = active.reduce((sum, s) => sum + (planPrice.get(s.plan_id ?? "") ?? 0), 0);

    const newThisMonth = shops.filter((s) => new Date(s.created_at) >= startOfMonth).length;
    const newLastMonth = shops.filter(
      (s) => new Date(s.created_at) >= startOfPrevMonth && new Date(s.created_at) < startOfMonth,
    ).length;

    // Churn: cancelled shops with updated_at in current month vs active count last month
    // Simple proxy: churned this month / (active + churned this month)
    const churned = cancelled.length;
    const churnRate = active.length + churned > 0 ? (churned / (active.length + churned)) * 100 : 0;

    // Growth series: 12 months of new signups + estimated MRR
    const months: { month: string; label: string; signups: number; shops: number; mrr: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthShops = shops.filter((s) => new Date(s.created_at) < end);
      const monthActive = monthShops.filter((s) => new Date(s.created_at) < end);
      const signups = shops.filter(
        (s) => new Date(s.created_at) >= start && new Date(s.created_at) < end,
      ).length;
      const monthMrr = monthActive
        .filter((s) => s.subscription_status === "active" || new Date(s.created_at) < end)
        .reduce((sum, s) => sum + (planPrice.get(s.plan_id ?? "") ?? 0), 0);
      months.push({
        month: start.toISOString(),
        label: start.toLocaleDateString("en-IN", { month: "short" }),
        signups,
        shops: monthShops.length,
        mrr: monthMrr,
      });
    }

    // Plan mix
    const planMix = plans.map((p) => ({
      name: p.name,
      count: active.filter((s) => s.plan_id === p.id).length,
      price: p.monthly_price_inr,
    }));

    // Business type mix
    const bizTypes = ["mobile_shop", "clothing_shop", "mall", "other"] as const;
    const typeLabels: Record<(typeof bizTypes)[number], string> = {
      mobile_shop: "Mobile",
      clothing_shop: "Clothing",
      mall: "Mall",
      other: "Other",
    };
    const businessMix = bizTypes.map((t) => ({
      name: typeLabels[t],
      count: shops.filter((s) => s.business_type === t).length,
    }));

    // Alerts
    const failedProvisioning = shops.filter((s) => s.provisioning_status === "failed");
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const trialsEndingSoon = trials.filter(
      (s) => s.trial_ends_at && new Date(s.trial_ends_at) <= threeDaysFromNow,
    );

    // Provisioning health summary
    const provisioningHealth = {
      live: shops.filter((s) => s.provisioning_status === "live").length,
      provisioning: shops.filter((s) => s.provisioning_status === "provisioning").length,
      failed: shops.filter((s) => s.provisioning_status === "failed").length,
      pending: shops.filter((s) => s.provisioning_status === "pending").length,
    };

    return {
      mrr,
      activeShops: active.length,
      totalShops: shops.length,
      trialCount: trials.length,
      newThisMonth,
      newLastMonth,
      churnRate,
      cancelledCount: churned,
      growth: months,
      planMix,
      businessMix,
      provisioningHealth,
      alerts: {
        failedProvisioning: failedProvisioning.map((s) => ({
          id: s.id,
          name: s.business_name,
        })),
        trialsEndingSoon: trialsEndingSoon.map((s) => ({
          id: s.id,
          name: s.business_name,
          ends: s.trial_ends_at!,
        })),
      },
    };
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("audit_log")
      .select("id, action, entity_type, actor_email, shop_id, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw error;
    return data ?? [];
  });
