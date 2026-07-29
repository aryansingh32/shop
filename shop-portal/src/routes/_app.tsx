/**
 * Authenticated shell layout.
 *
 * Every route under /_app/ is protected here. If no valid session cookie:
 * → redirect to /login (never to Odoo's login page).
 *
 * Renders a consistent top navigation bar and sidebar navigation.
 * Session data (user name, role, allowed apps) is passed via route context.
 */

import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
  isRedirect,
} from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Store,
  LayoutGrid,
  Users,
  Settings,
  CreditCard,
  User,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { getSessionFn, logoutFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import type { ShopSession } from "@/lib/session";

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: AppShell,
});

// ── Shell layout ───────────────────────────────────────────────────────────

function AppShell() {
  const { session } = Route.useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <TopBar session={session} onMenuToggle={() => setMobileMenuOpen((v) => !v)} menuOpen={mobileMenuOpen} />

      <div style={{ display: "flex", flex: 1 }}>
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex"
          style={{
            width: "220px",
            flexShrink: 0,
            flexDirection: "column",
            borderRight: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            padding: "1.5rem 0.75rem",
            gap: "0.25rem",
          }}
        >
          <SidebarNav session={session} />
        </aside>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
            }}
            className="md:hidden"
          >
            <div
              style={{ position: "absolute", inset: 0, background: "oklch(0 0 0 / 40%)" }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside
              style={{
                position: "relative",
                width: "260px",
                height: "100%",
                background: "var(--color-surface)",
                padding: "1.5rem 0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                overflowY: "auto",
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <SidebarNav session={session} />
            </aside>
          </div>
        )}

        {/* Page content */}
        <main style={{ flex: 1, minWidth: 0, padding: "2rem 1.5rem", maxWidth: "1200px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────

function TopBar({
  session,
  onMenuToggle,
  menuOpen,
}: {
  session: ShopSession;
  onMenuToggle: () => void;
  menuOpen: boolean;
}) {
  const router = useRouter();
  const doLogout = useServerFn(logoutFn);

  async function handleLogout() {
    try {
      // Clear cookie client-side immediately (server-side deleteCookie also dropped by same TanStack bug)
      document.cookie = `kiranaSession=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      await doLogout({});
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error("Logout failed:", err);
    }
    window.location.href = "/login";
  }

  return (
    <header
      style={{
        height: "60px",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 1.25rem",
        gap: "1rem",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="md:hidden"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-foreground)",
          display: "flex",
          alignItems: "center",
          padding: "0.25rem",
        }}
        aria-label="Toggle menu"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flex: 1 }}>
        <div
          style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-foreground)",
            borderRadius: "var(--radius-md)",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Store size={17} strokeWidth={2} />
        </div>
        <span style={{ fontWeight: 700, fontSize: "1.0625rem", color: "var(--color-foreground)", letterSpacing: "-0.01em" }}>
          {BRAND_NAME}
        </span>
      </div>

      {/* User menu (minimal) */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ textAlign: "right", display: "none" }} className="sm:block">
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground)" }}>
            {session.userName}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
            {session.isOwner ? "Owner" : "Staff"}
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            background: "none",
            border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            color: "var(--color-foreground-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-destructive)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-destructive)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-foreground-muted)";
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

// ── Sidebar nav ────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: <LayoutGrid size={18} />, label: "Dashboard" },
  { to: "/employees", icon: <Users size={18} />, label: "Team", ownerOnly: true },
  { to: "/shop-settings", icon: <Settings size={18} />, label: "Shop settings", ownerOnly: true },
  { to: "/subscription", icon: <CreditCard size={18} />, label: "Subscription", ownerOnly: true },
  { to: "/profile", icon: <User size={18} />, label: "My profile" },
];

function SidebarNav({ session }: { session: ShopSession }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || session.isOwner);

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
      {visibleItems.map((item) => {
        const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.625rem 0.875rem",
              borderRadius: "var(--radius-lg)",
              fontSize: "0.9375rem",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--color-primary)" : "var(--color-foreground-muted)",
              background: isActive ? "var(--color-primary-soft)" : "transparent",
              textDecoration: "none",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-accent)";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-foreground)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-foreground-muted)";
              }
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
