/**
 * Dashboard — the main screen shop users land on after login.
 *
 * Displays app cards based on:
 *   - The shop's subscribed plan apps (from Supabase)
 *   - Filtered to this user's allowed apps (from session, enforced by Odoo groups)
 *
 * Clicking a card navigates to /open-app/:slug which opens the full Odoo screen.
 * App names and icons come from the Supabase apps table — NOT hardcoded.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Package,
  TrendingUp,
  BookOpen,
  Users,
  LayoutGrid,
  ChevronRight,
  AlertCircle,
  Clock,
} from "lucide-react";
import { getDashboardDataFn } from "@/lib/shop.functions";
import { BRAND_NAME, APP_ODOO_PATHS } from "@/lib/config";

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: `Dashboard — ${BRAND_NAME}` }] }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["dashboard"],
      queryFn: () => getDashboardDataFn(),
    }),
  component: DashboardPage,
});

// ── Icon map (fallbacks when Supabase app has no icon) ────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart size={32} strokeWidth={1.5} />,
  Package: <Package size={32} strokeWidth={1.5} />,
  TrendingUp: <TrendingUp size={32} strokeWidth={1.5} />,
  BookOpen: <BookOpen size={32} strokeWidth={1.5} />,
  Users: <Users size={32} strokeWidth={1.5} />,
  LayoutGrid: <LayoutGrid size={32} strokeWidth={1.5} />,
  // POS-specific
  pos: <ShoppingCart size={32} strokeWidth={1.5} />,
  inventory: <Package size={32} strokeWidth={1.5} />,
  sales: <TrendingUp size={32} strokeWidth={1.5} />,
  accounting: <BookOpen size={32} strokeWidth={1.5} />,
  employees: <Users size={32} strokeWidth={1.5} />,
};

function getIcon(app: { icon: string | null; slug: string }) {
  if (app.icon && ICON_MAP[app.icon]) return ICON_MAP[app.icon];
  if (ICON_MAP[app.slug]) return ICON_MAP[app.slug];
  return ICON_MAP.LayoutGrid;
}

// ── Icon accent colors per slug ───────────────────────────────────────────
const ICON_COLORS: Record<string, { bg: string; fg: string }> = {
  pos:         { bg: "oklch(0.92 0.06 210)", fg: "oklch(0.42 0.17 210)" },
  inventory:   { bg: "oklch(0.93 0.05 155)", fg: "oklch(0.40 0.16 155)" },
  sales:       { bg: "oklch(0.95 0.06 75)",  fg: "oklch(0.52 0.18 75)"  },
  accounting:  { bg: "oklch(0.94 0.04 290)", fg: "oklch(0.48 0.16 290)" },
  employees:   { bg: "oklch(0.94 0.04 27)",  fg: "oklch(0.50 0.18 27)"  },
};

// ── Dashboard page ────────────────────────────────────────────────────────

function DashboardPage() {
  const fetch = useServerFn(getDashboardDataFn);
  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fetch() });
  const { shop, plan, apps, trialEndsAt } = data;
  const { session } = Route.useRouteContext();

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;
  const isTrial = shop.subscription_status === "trial";

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Greeting */}
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}
        >
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

      {/* Trial banner */}
      {isTrial && trialDaysLeft !== null && (
        <div
          style={{
            background: trialDaysLeft <= 3 ? "var(--color-warning-soft)" : "var(--color-primary-soft)",
            border: `1.5px solid ${trialDaysLeft <= 3 ? "oklch(0.85 0.1 75)" : "oklch(0.82 0.1 210)"}`,
            borderRadius: "var(--radius-xl)",
            padding: "1rem 1.25rem",
            marginBottom: "1.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
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
          <h2 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-foreground-subtle)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Your apps
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "1rem",
            }}
          >
            {apps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── App card ──────────────────────────────────────────────────────────────

function AppCard({ app }: { app: { id: string; slug: string; name: string; icon: string | null; description: string | null } }) {
  const colors = ICON_COLORS[app.slug] ?? { bg: "var(--color-accent)", fg: "var(--color-primary)" };
  const path = APP_ODOO_PATHS[app.slug];

  const content = (
    <div
      className="app-card"
      style={{
        padding: "1.5rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.875rem",
        minHeight: "140px",
      }}
    >
      {/* Icon */}
      <div
        style={{
          background: colors.bg,
          color: colors.fg,
          borderRadius: "var(--radius-lg)",
          width: "52px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {getIcon(app)}
      </div>

      {/* Label */}
      <div>
        <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-foreground)", lineHeight: 1.2 }}>
          {app.name}
        </div>
        {app.description && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem", color: "var(--color-foreground-muted)", lineHeight: 1.4 }}>
            {app.description}
          </div>
        )}
      </div>
    </div>
  );

  if (path) {
    return (
      <Link to="/open-app/$slug" params={{ slug: app.slug }}>
        {content}
      </Link>
    );
  }

  // Fallback if no Odoo path mapped (shouldn't happen in practice)
  return <div style={{ opacity: 0.5, cursor: "not-allowed" }}>{content}</div>;
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyApps() {
  return (
    <div
      style={{
        border: "2px dashed var(--color-border-strong)",
        borderRadius: "var(--radius-2xl)",
        padding: "4rem 2rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <AlertCircle size={36} style={{ color: "var(--color-foreground-subtle)" }} />
      <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-foreground)" }}>No apps available</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", maxWidth: "320px" }}>
        Your account doesn't have access to any apps yet. Contact your shop owner or {BRAND_NAME} support.
      </p>
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string) {
  return fullName.split(" ")[0];
}
