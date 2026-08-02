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
  Home, ShoppingCart, Package, UserCircle, BookOpen,
  TrendingUp, Users, LayoutGrid, Settings,
  Store, LogOut, Menu, X, User,
} from "lucide-react";
import { getSessionFn, logoutFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import { filterNavGroups, type NavGroup } from "@/lib/navigation";
import type { ShopSession } from "@/lib/session";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: AppShell,
});

// ─────────────────────────────────────────────────────────────────────────────
// Icon resolver — maps iconName strings from NAV_GROUPS to lucide-react nodes
// ─────────────────────────────────────────────────────────────────────────────

const ICON_COMPONENTS: Record<string, React.ReactNode> = {
  Home:        <Home size={18} />,
  ShoppingCart:<ShoppingCart size={18} />,
  Package:     <Package size={18} />,
  UserCircle:  <UserCircle size={18} />,
  BookOpen:    <BookOpen size={18} />,
  TrendingUp:  <TrendingUp size={18} />,
  Users:       <Users size={18} />,
  LayoutGrid:  <LayoutGrid size={18} />,
  Settings:    <Settings size={18} />,
};

function getNavIcon(iconName: string): React.ReactNode {
  return ICON_COMPONENTS[iconName] ?? <LayoutGrid size={18} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
}

/**
 * Resolve the actual href for a nav item.
 * Items with appSlug navigate to /open-app/$slug.
 * All others navigate to their route directly.
 */
function resolveNavHref(item: NavGroup): string {
  if (item.appSlug) {
    return `/open-app/${item.appSlug}`;
  }
  return item.route;
}

// ─────────────────────────────────────────────────────────────────────────────
// App Shell
// ─────────────────────────────────────────────────────────────────────────────

function AppShell() {
  const { session } = Route.useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", display: "flex", flexDirection: "column" }}>
      <TopBar session={session} onMenuToggle={() => setMobileMenuOpen((v) => !v)} menuOpen={mobileMenuOpen} />

      <div style={{ display: "flex", flex: 1 }}>
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex"
          style={{
            width: "224px", flexShrink: 0, flexDirection: "column",
            borderRight: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            padding: "1.25rem 0.75rem", gap: "0.125rem",
          }}
        >
          <SidebarNav session={session} />
        </aside>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex" }} className="md:hidden">
            <div
              style={{ position: "absolute", inset: 0, background: "oklch(0 0 0 / 45%)", backdropFilter: "blur(2px)" }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside style={{
              position: "relative", width: "260px", height: "100%",
              background: "var(--color-surface)",
              padding: "1.25rem 0.75rem",
              display: "flex", flexDirection: "column", gap: "0.125rem", overflowY: "auto",
              boxShadow: "4px 0 24px oklch(0 0 0 / 15%)",
            }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <SidebarNav session={session} />
            </aside>
          </div>
        )}

        {/* Page content */}
        <main style={{ flex: 1, minWidth: 0, padding: "2rem 1.75rem", maxWidth: "1200px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Bar
// ─────────────────────────────────────────────────────────────────────────────

function TopBar({ session, onMenuToggle, menuOpen }: { session: ShopSession; onMenuToggle: () => void; menuOpen: boolean }) {
  const doLogout = useServerFn(logoutFn);

  async function handleLogout() {
    try {
      document.cookie = `kiranaSession=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      await doLogout({});
    } catch (err) {
      if (isRedirect(err)) throw err;
    }
    window.location.href = "/login";
  }

  const initials = getInitials(session.userName);

  return (
    <header style={{
      height: "64px", background: "var(--color-surface)",
      borderBottom: "1px solid var(--color-border)",
      boxShadow: "0 1px 3px oklch(0 0 0 / 5%)",
      display: "flex", alignItems: "center",
      padding: "0 1.25rem", gap: "1rem",
      position: "sticky", top: 0, zIndex: 30,
    }}>
      <button
        onClick={onMenuToggle} className="md:hidden"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-foreground)", display: "flex", alignItems: "center", padding: "0.25rem" }}
        aria-label="Toggle menu"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flex: 1 }}>
        <div style={{
          background: "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.42 0.19 230) 100%)",
          color: "white",
          borderRadius: "var(--radius-md)",
          width: "34px", height: "34px",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 6px oklch(0.52 0.17 210 / 30%)",
        }}>
          <Store size={18} strokeWidth={2} />
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.125rem", color: "var(--color-foreground)", letterSpacing: "-0.01em" }}>
          {BRAND_NAME}
        </span>
      </div>

      {/* Right: avatar + name + logout */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {/* Name + role (hidden on xs) */}
        <div className="hidden sm:block" style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground)", lineHeight: 1.2 }}>
            {session.userName}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
            {session.isOwner ? "Owner" : "Staff"}
          </div>
        </div>

        {/* Avatar circle */}
        <div className="avatar" style={{ width: "36px", height: "36px", fontSize: "0.8125rem" }}>
          {initials}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            background: "none", border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-md)", cursor: "pointer",
            color: "var(--color-foreground-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "36px", height: "36px", transition: "border-color 0.15s, color 0.15s",
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

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Navigation — Feature 2: Workflow-first nav from NAV_GROUPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders sidebar navigation from NAV_GROUPS (navigation.ts).
 *
 * Security: nav items whose requiredAppSlugs are not in session.allowedAppSlugs
 * are NOT rendered at all (not CSS-hidden) to avoid leaking route existence.
 * filterNavGroups() enforces this — only items the session can actually access
 * are returned to this component for rendering.
 */
function SidebarNav({ session }: { session: ShopSession }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Filter items to only those the session can access.
  // Always-visible items (requiredAppSlugs: []) are always included.
  const visibleItems = filterNavGroups(session.allowedAppSlugs, session.isOwner);

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 0 }} aria-label="Main navigation">
      {visibleItems.map((item) => {
        const href = resolveNavHref(item);

        // Determine active state: exact match or prefix match for nested routes.
        // For open-app items, match against the app slug path.
        const isActive = item.appSlug
          ? pathname === `/open-app/${item.appSlug}` || pathname.startsWith(`/open-app/${item.appSlug}/`)
          : pathname === item.route || pathname.startsWith(item.route + "/");

        return (
          <Link
            key={item.key}
            to={href as any}
            style={{
              display: "flex", alignItems: "center", gap: "0.625rem",
              padding: "0.625rem 0.875rem",
              borderRadius: "var(--radius-lg)",
              fontSize: "0.9375rem",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--color-primary)" : "var(--color-foreground-muted)",
              background: isActive ? "var(--color-primary-soft)" : "transparent",
              textDecoration: "none",
              transition: "background 0.12s, color 0.12s",
              position: "relative",
              marginBottom: "0.125rem",
              borderLeft: isActive ? "3px solid var(--color-primary)" : "3px solid transparent",
              paddingLeft: isActive ? "calc(0.875rem - 3px)" : "0.875rem",
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
            {getNavIcon(item.iconName)}
            <span>{item.label}</span>
            {item.comingSoon && (
              <span style={{
                marginLeft: "auto",
                fontSize: "0.6rem", fontWeight: 700,
                background: "var(--color-accent)",
                color: "var(--color-foreground-muted)",
                padding: "0.1rem 0.35rem",
                borderRadius: "var(--radius-sm)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                Soon
              </span>
            )}
          </Link>
        );
      })}

      {/* Profile link — always visible at bottom */}
      <div style={{ height: "1px", background: "var(--color-border)", margin: "0.5rem 0.5rem" }} />
      <Link
        to="/profile"
        style={{
          display: "flex", alignItems: "center", gap: "0.625rem",
          padding: "0.625rem 0.875rem",
          borderRadius: "var(--radius-lg)",
          fontSize: "0.9375rem", fontWeight: 500,
          color: pathname === "/profile" ? "var(--color-primary)" : "var(--color-foreground-muted)",
          background: pathname === "/profile" ? "var(--color-primary-soft)" : "transparent",
          textDecoration: "none",
          transition: "background 0.12s, color 0.12s",
          marginBottom: "0.125rem",
          borderLeft: pathname === "/profile" ? "3px solid var(--color-primary)" : "3px solid transparent",
          paddingLeft: pathname === "/profile" ? "calc(0.875rem - 3px)" : "0.875rem",
        }}
        onMouseEnter={(e) => {
          if (pathname !== "/profile") {
            (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-accent)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-foreground)";
          }
        }}
        onMouseLeave={(e) => {
          if (pathname !== "/profile") {
            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-foreground-muted)";
          }
        }}
      >
        <User size={18} />
        <span>My profile</span>
      </Link>
    </nav>
  );
}
