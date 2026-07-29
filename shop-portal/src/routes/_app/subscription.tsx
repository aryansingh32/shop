/**
 * Subscription info — read-only plan details from Supabase.
 * Shows current plan, billing, trial status. No payment flows here.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CreditCard, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { getSubscriptionFn } from "@/lib/shop.functions";
import { BRAND_NAME } from "@/lib/config";


export const Route = createFileRoute("/_app/subscription")({
  head: () => ({ meta: [{ title: `Subscription — ${BRAND_NAME}` }] }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["subscription"], queryFn: () => getSubscriptionFn() }),
  component: SubscriptionPage,
});

const STATUS_CONFIG = {
  active: { label: "Active", icon: <CheckCircle2 size={16} />, badgeClass: "badge-success" },
  trial: { label: "Free trial", icon: <Clock size={16} />, badgeClass: "badge-warning" },
  suspended: { label: "Suspended", icon: <AlertCircle size={16} />, badgeClass: "badge-danger" },
  cancelled: { label: "Cancelled", icon: <AlertCircle size={16} />, badgeClass: "badge-neutral" },
};

function SubscriptionPage() {
  const fetchSub = useServerFn(getSubscriptionFn);
  const { data } = useSuspenseQuery({ queryKey: ["subscription"], queryFn: () => fetchSub() });

  if (!data) {
    return <div style={{ color: "var(--color-foreground-muted)" }}>Subscription info not available.</div>;
  }

  const statusKey = data.subscription_status as keyof typeof STATUS_CONFIG;
  const status = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.active;
  const plan = (data as any).plan;
  const trialEndsAt = data.trial_ends_at;

  return (
    <div style={{ maxWidth: "560px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem" }}>
        <CreditCard size={22} style={{ color: "var(--color-primary)" }} />
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
          Subscription
        </h1>
      </div>

      {/* Current plan card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-foreground-subtle)", marginBottom: "0.375rem" }}>
              Current plan
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
              {plan?.name ?? "No plan"}
            </div>
            {plan?.description && (
              <div style={{ fontSize: "0.9rem", color: "var(--color-foreground-muted)", marginTop: "0.375rem" }}>
                {plan.description}
              </div>
            )}
          </div>
          <span className={`badge ${status.badgeClass}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.875rem" }}>
            {status.icon}
            {status.label}
          </span>
        </div>

        {plan && (
          <div
            style={{
              marginTop: "1.25rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--color-border)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-subtle)", marginBottom: "0.25rem" }}>Price</div>
              <div style={{ fontWeight: 600, color: "var(--color-foreground)", fontSize: "1.0625rem" }}>
                {plan.monthly_price_inr > 0
                  ? `₹${plan.monthly_price_inr.toLocaleString("en-IN")} / ${plan.billing_cycle === "monthly" ? "month" : "year"}`
                  : "Custom pricing"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-subtle)", marginBottom: "0.25rem" }}>Max seats</div>
              <div style={{ fontWeight: 600, color: "var(--color-foreground)", fontSize: "1.0625rem" }}>
                {plan.max_seats} users
              </div>
            </div>
          </div>
        )}

        {trialEndsAt && statusKey === "trial" && (
          <div
            style={{
              marginTop: "1rem",
              background: "var(--color-warning-soft)",
              border: "1.5px solid oklch(0.85 0.1 75)",
              borderRadius: "var(--radius-lg)",
              padding: "0.875rem 1rem",
              fontSize: "0.9rem",
              color: "var(--color-foreground)",
            }}
          >
            <strong>Trial ends</strong> on {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(trialEndsAt))}.
          </div>
        )}
      </div>

      {/* Contact sales CTA */}
      <div
        className="card"
        style={{ padding: "1.5rem", background: "var(--color-primary-soft)", border: "1.5px solid oklch(0.82 0.1 210)" }}
      >
        <p style={{ fontSize: "0.9375rem", color: "var(--color-foreground)", marginBottom: "0.75rem", fontWeight: 500 }}>
          Want to upgrade or change your plan?
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
          Contact {BRAND_NAME} support to discuss plan changes, additional seats, or billing questions.
        </p>
      </div>
    </div>
  );
}
