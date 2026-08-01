/**
 * Home Screen — Feature 3: Answers-first redesign
 *
 * Answers the two questions every shop owner asks first:
 *   Q1: "How much did I make today?" → Today's Sales
 *   Q2: "Did I profit today?"        → Today's Profit estimate
 *
 * Plus one operational metric:
 *   Q3: "Do I need to restock?"      → Low Stock count (if inventory app active)
 *
 * RBAC: salesTotal and profitTotal are Owner-Only. The getHomeSummaryFn()
 * enforces this server-side — the keys are absent from the response for employee
 * sessions, not set to null. This component checks `isOwner` to decide whether
 * to render the metrics section at all (defense-in-depth, not sole enforcement).
 *
 * App grid: shows the session's allowed apps as quick-launch cards, same as
 * before but visually subordinated below the key metrics.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ShoppingCart, Package, TrendingUp, BookOpen, Users,
  LayoutGrid, ChevronRight, Clock, X, Sparkles,
  IndianRupee, AlertTriangle,
} from "lucide-react";
import { getDashboardDataFn } from "@/lib/shop.functions";
import { getHomeSummaryFn, type HomeSummaryOwner } from "@/lib/home.functions";
import { BRAND_NAME, APP_ODOO_PATHS } from "@/lib/config";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: `Home — ${BRAND_NAME}` }] }),
  loader: async ({ context }) => {
    // Parallel fetch: dashboard data (apps/plan/shop) + home summary metrics
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["dashboard"],
        queryFn: () => getDashboardDataFn(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["home-summary"],
        queryFn: () => getHomeSummaryFn(),
        // Stale after 60 seconds — metrics are near-real-time, not live-streaming
        staleTime: 60_000,
      }),
    ]);
  },
  component: HomePage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Icon + color maps (unchanged from v1 — tested and stable)
// ─────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart size={26} strokeWidth={1.5} />,
  Package:      <Package size={26} strokeWidth={1.5} />,
  TrendingUp:   <TrendingUp size={26} strokeWidth={1.5} />,
  BookOpen:     <BookOpen size={26} strokeWidth={1.5} />,
  Users:        <Users size={26} strokeWidth={1.5} />,
  LayoutGrid:   <LayoutGrid size={26} strokeWidth={1.5} />,
  // Slug-based fallbacks
  pos:          <ShoppingCart size={26} strokeWidth={1.5} />,
  inventory:    <Package size={26} strokeWidth={1.5} />,
  sales:        <TrendingUp size={26} strokeWidth={1.5} />,
  accounting:   <BookOpen size={26} strokeWidth={1.5} />,
  employees:    <Users size={26} strokeWidth={1.5} />,
};

function getIcon(app: { icon: string | null; slug: string }) {
  if (app.icon && ICON_MAP[app.icon]) return ICON_MAP[app.icon];
  if (ICON_MAP[app.slug]) return ICON_MAP[app.slug];
  return ICON_MAP.LayoutGrid;
}

const ICON_COLORS: Record<string, { bg: string; fg: string; shadow: string }> = {
  pos:        { bg: "oklch(0.90 0.08 210)", fg: "oklch(0.38 0.20 210)", shadow: "oklch(0.52 0.17 210 / 20%)" },
  inventory:  { bg: "oklch(0.90 0.07 155)", fg: "oklch(0.36 0.18 155)", shadow: "oklch(0.50 0.16 155 / 20%)" },
  sales:      { bg: "oklch(0.93 0.08 75)",  fg: "oklch(0.48 0.20 75)",  shadow: "oklch(0.65 0.18 75 / 20%)"  },
  accounting: { bg: "oklch(0.92 0.06 290)", fg: "oklch(0.44 0.18 290)", shadow: "oklch(0.52 0.17 290 / 20%)" },
  employees:  { bg: "oklch(0.93 0.06 27)",  fg: "oklch(0.46 0.20 27)",  shadow: "oklch(0.56 0.19 27 / 20%)"  },
  loyalty:    { bg: "oklch(0.92 0.07 340)", fg: "oklch(0.44 0.20 340)", shadow: "oklch(0.56 0.18 340 / 20%)" },
  barcodes:   { bg: "oklch(0.90 0.05 200)", fg: "oklch(0.42 0.16 200)", shadow: "oklch(0.52 0.12 200 / 20%)" },
  purchase:   { bg: "oklch(0.90 0.06 180)", fg: "oklch(0.40 0.18 180)", shadow: "oklch(0.50 0.16 180 / 20%)" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const TIP_KEY = "kirana_dismissed_welcome_tip";

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

function HomePage() {
  const fetchDashboard = useServerFn(getDashboardDataFn);
  const fetchSummary = useServerFn(getHomeSummaryFn);

  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });
  const { data: summary } = useSuspenseQuery({
    queryKey: ["home-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
  });

  const { shop, plan, apps, trialEndsAt } = data;
  const { session } = Route.useRouteContext();
  const isOwner = session.isOwner;

  // Cast: only access salesTotal/profitTotal when isOwner=true
  const ownerSummary = isOwner ? (summary as HomeSummaryOwner) : null;

  const [showTip, setShowTip] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(TIP_KEY)) setShowTip(true); } catch {}
  }, []);
  function dismissTip() {
    try { localStorage.setItem(TIP_KEY, "1"); } catch {}
    setShowTip(false);
  }

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;
  const isTrial = shop.subscription_status === "trial";

  return (
    <div style={{ maxWidth: "960px" }}>
      {/* ── Greeting ── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.875rem", fontWeight: 800,
          color: "var(--color-foreground)", letterSpacing: "-0.02em",
          margin: 0,
        }}>
          {getGreeting()}, {firstName(session.userName)} 👋
        </h1>
        <p style={{ marginTop: "0.375rem", fontSize: "1rem", color: "var(--color-foreground-muted)" }}>
          {shop.business_name}
          {plan && (
            <span style={{ marginLeft: "0.625rem", color: "var(--color-foreground-subtle)", fontSize: "0.875rem" }}>
              · {plan.name} plan
            </span>
          )}
        </p>
      </div>

      {/* ── First-time POS tip ── */}
      {showTip && apps.some((a: any) => a.slug === "pos") && (
        <div className="first-time-tip">
          <Sparkles size={20} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          <p>👋 <strong>Getting started?</strong> Tap <strong>Sell</strong> to ring up your first sale — it takes less than a minute.</p>
          <button className="first-time-tip-dismiss" onClick={dismissTip} aria-label="Dismiss tip">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Trial banner ── */}
      {isTrial && trialDaysLeft !== null && (
        <div style={{
          background: trialDaysLeft <= 3 ? "var(--color-warning-soft)" : "var(--color-primary-soft)",
          border: `1.5px solid ${trialDaysLeft <= 3 ? "oklch(0.85 0.1 75)" : "oklch(0.82 0.1 210)"}`,
          borderRadius: "var(--radius-xl)", padding: "1rem 1.25rem",
          marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
          <Clock size={18} style={{ color: trialDaysLeft <= 3 ? "var(--color-warning)" : "var(--color-primary)", flexShrink: 0 }} />
          <p style={{ fontSize: "0.9rem", color: "var(--color-foreground)", margin: 0 }}>
            <strong>Free trial</strong> —{" "}
            {trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} remaining (ends ${fmtDate(trialEndsAt!)})`
              : "Your trial has ended. Contact support to continue."}
          </p>
        </div>
      )}

      {/* ── Metric cards (Owner only) ── */}
      {isOwner && ownerSummary && (
        <div style={{
          display: "grid",
          gridTemplateColumns: summary.lowStockCount !== undefined ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}>
          {/* Today's Sales */}
          <MetricCard
            id="metric-sales-today"
            label="Today's sales"
            value={fmtCurrency(ownerSummary.salesTotal)}
            icon={<IndianRupee size={20} />}
            accentColor="oklch(0.38 0.20 210)"
            bgColor="oklch(0.90 0.08 210)"
            sublabel="Paid orders today"
          />

          {/* Today's Profit */}
          <MetricCard
            id="metric-profit-today"
            label="Estimated profit"
            value={fmtCurrency(ownerSummary.profitTotal)}
            icon={<TrendingUp size={20} />}
            accentColor={ownerSummary.profitTotal >= 0 ? "oklch(0.36 0.18 155)" : "oklch(0.45 0.20 25)"}
            bgColor={ownerSummary.profitTotal >= 0 ? "oklch(0.90 0.07 155)" : "oklch(0.92 0.08 25)"}
            sublabel="Sale price minus cost price"
          />

          {/* Low stock count — only if inventory enabled */}
          {summary.lowStockCount !== undefined && (
            <MetricCard
              id="metric-low-stock"
              label="Low stock"
              value={String(summary.lowStockCount)}
              icon={<AlertTriangle size={20} />}
              accentColor={summary.lowStockCount > 0 ? "oklch(0.48 0.20 75)" : "oklch(0.36 0.18 155)"}
              bgColor={summary.lowStockCount > 0 ? "oklch(0.93 0.08 75)" : "oklch(0.90 0.07 155)"}
              sublabel={`Products below ${5} units`}
            />
          )}
        </div>
      )}

      {/* Low stock only for employees (if stock app is enabled for them) */}
      {!isOwner && summary.lowStockCount !== undefined && (
        <div style={{ marginBottom: "2rem" }}>
          <MetricCard
            id="metric-low-stock-employee"
            label="Low stock"
            value={String(summary.lowStockCount)}
            icon={<AlertTriangle size={20} />}
            accentColor={summary.lowStockCount > 0 ? "oklch(0.48 0.20 75)" : "oklch(0.36 0.18 155)"}
            bgColor={summary.lowStockCount > 0 ? "oklch(0.93 0.08 75)" : "oklch(0.90 0.07 155)"}
            sublabel={`Products below 5 units`}
          />
        </div>
      )}

      {/* ── App grid ── */}
      {apps.length === 0 ? (
        <EmptyApps />
      ) : (
        <>
          <p style={{
            fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.06em",
            color: "var(--color-foreground-muted)", textTransform: "uppercase",
            marginBottom: "1rem",
          }}>
            Open an app
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: "1rem",
          }}>
            {apps.map((app: any) => <AppCard key={app.id} app={app} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  id,
  label,
  value,
  icon,
  accentColor,
  bgColor,
  sublabel,
}: {
  id: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  sublabel?: string;
}) {
  return (
    <div
      id={id}
      style={{
        background: "var(--color-surface)",
        border: "1.5px solid var(--color-border)",
        borderRadius: "var(--radius-xl)",
        padding: "1.25rem 1.25rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-foreground-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </span>
        <div style={{
          background: bgColor, color: accentColor,
          borderRadius: "var(--radius-md)",
          width: "32px", height: "32px",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontSize: "1.625rem", fontWeight: 800,
        fontFamily: "var(--font-display)",
        color: "var(--color-foreground)",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}>
        {value}
      </div>

      {sublabel && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-subtle)", marginTop: "0.125rem" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App Card
// ─────────────────────────────────────────────────────────────────────────────

function AppCard({ app }: { app: { id: string; slug: string; name: string; icon: string | null; description: string | null } }) {
  const colors = ICON_COLORS[app.slug] ?? { bg: "var(--color-accent)", fg: "var(--color-primary)", shadow: "oklch(0 0 0 / 10%)" };
  const path = APP_ODOO_PATHS[app.slug];

  const content = (
    <div
      className="app-card"
      style={{
        padding: "1.25rem 1.125rem 1rem",
        display: "flex", flexDirection: "column",
        minHeight: "150px", position: "relative",
      }}
    >
      {/* Icon */}
      <div style={{
        background: colors.bg, color: colors.fg,
        borderRadius: "var(--radius-lg)",
        width: "52px", height: "52px",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginBottom: "0.75rem",
        boxShadow: `0 4px 12px ${colors.shadow}`,
      }}>
        {getIcon(app)}
      </div>

      {/* Label */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-foreground)", lineHeight: 1.2 }}>
          {app.name}
        </div>
        {app.description && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem", color: "var(--color-foreground-muted)", lineHeight: 1.4 }}>
            {app.description}
          </div>
        )}
      </div>

      {/* Chevron */}
      <div style={{ position: "absolute", bottom: "1rem", right: "0.875rem", color: "var(--color-border-strong)" }}>
        <ChevronRight size={16} />
      </div>
    </div>
  );

  if (path) {
    return <Link to="/open-app/$slug" params={{ slug: app.slug }}>{content}</Link>;
  }
  return <div style={{ opacity: 0.5, cursor: "not-allowed" }}>{content}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyApps() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <LayoutGrid size={24} />
      </div>
      <h3>No apps set up yet</h3>
      <p>Contact your {BRAND_NAME} administrator to add apps to your account. Once set up, they'll appear here.</p>
    </div>
  );
}
