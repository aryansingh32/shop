/**
 * Navigation Groups — Feature 2: Workflow-first navigation
 *
 * Replaces the ERP-module-first navigation with a workflow-first structure.
 * This is the single source of truth for both the sidebar and the dashboard
 * app-card grid — both read from NAV_GROUPS for visual consistency.
 *
 * NAMING CONVENTION (display-only, never rename underlying slugs):
 *   "Inventory" → "Stock"        (app slug still 'inventory')
 *   "Sales"     → folded into "Sell"  (app slug still 'sales')
 *   "Accounting"→ "Money"        (app slug still 'accounting')
 *   "Employees" → "Staff"        (app slug still 'employees')
 *
 * requiredAppSlugs rules:
 *   [] = always visible (Home, Settings, and placeholder items)
 *   [...slugs] = visible only if ≥1 of these slugs is in session.allowedAppSlugs
 *
 * Security: nav items with requiredAppSlugs are omitted from the DOM entirely
 * (not just hidden via CSS) when the session doesn't grant access — see SidebarNav
 * in _app.tsx for the enforcement.
 */

export interface NavGroup {
  /** Unique route key — also used as the TanStack Router `to` path */
  key: string;
  /** Merchant-facing label (workflow language, no ERP terms) */
  label: string;
  /** Lucide-react icon component name (imported in _app.tsx) */
  iconName: string;
  /** Emoji prefix for visual affordance in mobile drawers */
  emoji: string;
  /**
   * Odoo app slugs that gate visibility of this nav item.
   * Empty array = always visible (Home, placeholders, Settings).
   * Non-empty = item hidden unless at least one slug is in session.allowedAppSlugs.
   */
  requiredAppSlugs: string[];
  /**
   * If true, this item is always visible to shop owners regardless of
   * requiredAppSlugs (e.g. Team management — always an owner concern).
   */
  ownerAlways?: boolean;
  /** Full TanStack Router route path (e.g. "/dashboard", "/open-app/$slug") */
  route: string;
  /**
   * For items that open an Odoo app (open-app/$slug), this is the slug to pass.
   * Undefined for portal-native routes (dashboard, settings, placeholders).
   */
  appSlug?: string;
  /** If true, this item links to a "Coming soon" placeholder — not yet built */
  comingSoon?: boolean;
  /** Brief one-line description for the placeholder screen */
  description?: string;
}

/**
 * The 9 top-level workflow navigation items.
 * Order here determines render order — do not reorder without product sign-off.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    label: "Home",
    iconName: "Home",
    emoji: "🏠",
    requiredAppSlugs: [],
    route: "/dashboard",
  },
  {
    key: "sell",
    label: "Sell",
    iconName: "ShoppingCart",
    emoji: "🧾",
    requiredAppSlugs: ["pos"],
    route: "/open-app/$slug",
    appSlug: "pos",
    description: "Billing counter — ring up sales fast",
  },
  {
    key: "stock",
    label: "Stock",
    iconName: "Package",
    emoji: "📦",
    requiredAppSlugs: ["inventory"],
    route: "/open-app/$slug",
    appSlug: "inventory",
    description: "Manage products, quantities, and reordering",
  },
  {
    key: "customers",
    label: "Customers",
    iconName: "UserCircle",
    emoji: "👥",
    requiredAppSlugs: [], // always visible — placeholder for now
    route: "/customers",
    comingSoon: true,
    description: "View customer profiles, loyalty points, and credit",
  },
  {
    key: "money",
    label: "Money",
    iconName: "BookOpen",
    emoji: "💰",
    requiredAppSlugs: ["accounting"],
    route: "/open-app/$slug",
    appSlug: "accounting",
    description: "GST invoices, payments, and books",
  },
  {
    key: "grow",
    label: "Grow",
    iconName: "TrendingUp",
    emoji: "📈",
    requiredAppSlugs: [], // always visible — placeholder for now
    route: "/grow",
    comingSoon: true,
    description: "Sales reports, top products, and business insights",
  },
  {
    key: "staff",
    label: "Team",
    iconName: "Users",
    emoji: "👨‍💼",
    // ownerAlways: Team management is always available to owners — they need
    // to create employees even if the Odoo 'employees' module isn't installed.
    // filterNavGroups() checks this flag alongside isOwner.
    requiredAppSlugs: ["employees"],
    ownerAlways: true,
    // Portal-native route — the Team page lives in our portal (/employees),
    // not in Odoo. It manages Odoo res.users via our API but has its own UI.
    route: "/employees",
    description: "Add staff and manage which apps they can access",
  },
  {
    key: "apps",
    label: "Apps",
    iconName: "LayoutGrid",
    emoji: "🛒",
    requiredAppSlugs: [], // always visible — marketplace placeholder for now
    route: "/apps-marketplace",
    comingSoon: true,
    description: "Explore and enable apps for your shop",
  },
  {
    key: "settings",
    label: "Settings",
    iconName: "Settings",
    emoji: "⚙️",
    requiredAppSlugs: [],
    route: "/shop-settings",
  },
];

/**
 * Filter NAV_GROUPS to only items the current session is allowed to see.
 *
 * @param allowedAppSlugs  The session's allowed app slugs
 * @param isOwner          Whether the current user is a shop owner
 * @returns                Filtered ordered subset of NAV_GROUPS
 */
export function filterNavGroups(allowedAppSlugs: string[], isOwner = false): NavGroup[] {
  return NAV_GROUPS.filter(
    (item) =>
      item.requiredAppSlugs.length === 0 ||
      (item.ownerAlways && isOwner) ||
      item.requiredAppSlugs.some((slug) => allowedAppSlugs.includes(slug)),
  );
}
