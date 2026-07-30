import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ShoppingCart, Package, TrendingUp, BookOpen, Users,
  LayoutGrid, ChevronRight, Clock, X, Sparkles,
} from "lucide-react";
import { getDashboardDataFn } from "@/lib/shop.functions";
import { BRAND_NAME, APP_ODOO_PATHS } from "@/lib/config";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: `Dashboard — ${BRAND_NAME}` }] }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["dashboard"], queryFn: () => getDashboardDataFn() }),
  component: DashboardPage,
});

const ICON_MAP: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart size={28} strokeWidth={1.5} />,
  Package: <Package size={28} strokeWidth={1.5} />,
  TrendingUp: <TrendingUp size={28} strokeWidth={1.5} />,
  BookOpen: <BookOpen size={28} strokeWidth={1.5} />,
  Users: <Users size={28} strokeWidth={1.5} />,
  LayoutGrid: <LayoutGrid size={28} strokeWidth={1.5} />,
  pos: <ShoppingCart size={28} strokeWidth={1.5} />,
  inventory: <Package size={28} strokeWidth={1.5} />,
  sales: <TrendingUp size={28} strokeWidth={1.5} />,
  accounting: <BookOpen size={28} strokeWidth={1.5} />,
  employees: <Users size={28} strokeWidth={1.5} />,
};

function getIcon(app: { icon: string | null; slug: string }) {
  if (app.icon && ICON_MAP[app.icon]) return ICON_MAP[app.icon];
  if (ICON_MAP[app.slug]) return ICON_MAP[app.slug];
  return ICON_MAP.LayoutGrid;
}

const ICON_COLORS: Record<string, { bg: string; fg: string; shadow: string }> = {
  pos:         { bg: "oklch(0.90 0.08 210)", fg: "oklch(0.38 0.20 210)", shadow: "oklch(0.52 0.17 210 / 20%)" },
  inventory:   { bg: "oklch(0.90 0.07 155)", fg: "oklch(0.36 0.18 155)", shadow: "oklch(0.50 0.16 155 / 20%)" },
  sales:       { bg: "oklch(0.93 0.08 75)",  fg: "oklch(0.48 0.20 75)",  shadow: "oklch(0.65 0.18 75 / 20%)"  },
  accounting:  { bg: "oklch(0.92 0.06 290)", fg: "oklch(0.44 0.18 290)", shadow: "oklch(0.52 0.17 290 / 20%)" },
  employees:   { bg: "oklch(0.93 0.06 27)",  fg: "oklch(0.46 0.20 27)",  shadow: "oklch(0.56 0.19 27 / 20%)"  },
};

const TIP_KEY = "kirana_dismissed_welcome_tip";

function DashboardPage() {
  const fetch = useServerFn(getDashboardDataFn);
  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fetch() });
  const { shop, plan, apps, trialEndsAt } = data;
  const { session } = Route.useRouteContext();

  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TIP_KEY)) setShowTip(true);
    } catch {}
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
      {/* Greeting */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.875rem", fontWeight: 800,
          color: "var(--color-foreground)", letterSpacing: "-0.02em",
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

      {/* First-time tip */}
      {showTip && apps.some((a: any) => a.slug === "pos") && (
        <div className="first-time-tip">
          <Sparkles size={20} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          <p>👋 <strong>Getting started?</strong> Tap <strong>Billing Counter</strong> to ring up your first sale — it takes less than a minute.</p>
          <button className="first-time-tip-dismiss" onClick={dismissTip} aria-label="Dismiss tip">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Trial banner */}
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

      {/* App grid */}
      {apps.length === 0 ? (
        <EmptyApps />
      ) : (
        <>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground-muted)", marginBottom: "1rem" }}>
            Open an app to get started
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: "1rem",
          }}>
            {apps.map((app: any) => <AppCard key={app.id} app={app} />)}
          </div>
        </>
      )}
    </div>
  );
}

function AppCard({ app }: { app: { id: string; slug: string; name: string; icon: string | null; description: string | null } }) {
  const colors = ICON_COLORS[app.slug] ?? { bg: "var(--color-accent)", fg: "var(--color-primary)", shadow: "oklch(0 0 0 / 10%)" };
  const path = APP_ODOO_PATHS[app.slug];

  const content = (
    <div
      className="app-card"
      style={{
        padding: "1.5rem 1.25rem 1.25rem",
        display: "flex", flexDirection: "column",
        minHeight: "170px", position: "relative",
      }}
    >
      {/* Icon */}
      <div style={{
        background: colors.bg, color: colors.fg,
        borderRadius: "var(--radius-lg)",
        width: "60px", height: "60px",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginBottom: "0.875rem",
        boxShadow: `0 4px 12px ${colors.shadow}`,
      }}>
        {getIcon(app)}
      </div>

      {/* Label */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "1.0625rem", color: "var(--color-foreground)", lineHeight: 1.2 }}>
          {app.name}
        </div>
        {app.description && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem", color: "var(--color-foreground-muted)", lineHeight: 1.4 }}>
            {app.description}
          </div>
        )}
      </div>

      {/* Chevron */}
      <div style={{
        position: "absolute", bottom: "1rem", right: "1rem",
        color: "var(--color-border-strong)",
      }}>
        <ChevronRight size={16} />
      </div>
    </div>
  );

  if (path) {
    return <Link to="/open-app/$slug" params={{ slug: app.slug }}>{content}</Link>;
  }
  return <div style={{ opacity: 0.5, cursor: "not-allowed" }}>{content}</div>;
}

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

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function firstName(fullName: string) { return fullName.split(" ")[0]; }
