/**
 * Open App — full-page iframe that loads the real Odoo app screen.
 *
 * Architecture:
 *   - The /odoo/*, /web/*, /mail/*, /point_of_sale/*, etc. paths are all
 *     proxied to the Odoo backend by Vite (dev) or Nginx (prod).
 *   - Because the iframe is on the same origin as our portal, the Odoo
 *     session_id cookie set during login is automatically sent with every
 *     request inside the iframe.
 *   - After the iframe loads, we inject CSS directly into its document to
 *     hide all Odoo chrome (navbar, app switcher, branding).
 *   - The kirana_rebrand Odoo addon provides the same CSS at the Odoo level
 *     as a belt-and-suspenders approach.
 */

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { getSessionFn } from "@/lib/auth.functions";
import { APP_ODOO_PATHS } from "@/lib/config";
import { BRAND_NAME } from "@/lib/config";
import { getPosConfigIdFn } from "@/lib/shop.functions";

// ── Styles to inject into the Odoo iframe ─────────────────────────────────
// This hides all Odoo chrome so the shop owner only sees the app content.
// Same rules as kirana_rebrand/static/src/css/rebrand.css — applied here
// at runtime as an extra layer in case the addon hasn't been installed yet.
const ODOO_HIDE_CHROME_CSS = `
  /* Hide Odoo top navbar completely */
  .o_main_navbar, .o_navbar, nav.o_main_navbar { display: none !important; }
  
  /* Reclaim space the navbar used to occupy */
  .o_action_manager, .o_web_client > .o_action_manager { 
    top: 0 !important; padding-top: 0 !important; margin-top: 0 !important;
    height: 100% !important; max-height: 100% !important;
  }
  .o_web_client { padding-top: 0 !important; }
  :root { --o-navbar-height: 0px !important; }

  /* Hide home menu / app switcher overlay */
  .o_home_menu_container, .o_home_menu, .o_home_menu_backdrop { display: none !important; }

  /* Hide Odoo logo marks — backend and POS */
  .o_home_menu_logo, .o_menu_brand > img, img[src*="odoo-logo"],
  img[alt="Odoo"], img[title="Odoo"],
  /* POS Odoo logo component (OWL — all known wrappers) */
  .pos-sale .odoo-logo, .pos-receipt .powered-by-odoo,
  .pos-receipt .pos-receipt-logo img[src*="odoo"],
  /* The kirana_rebrand addon removes the SVG inside this div — belt-and-suspenders */
  [class*="odoo-logo"], [class*="OdooLogo"] { display: none !important; }

  /* Hide "Add your company logo" / company logo placeholder.
     Odoo shows this placeholder in receipts and POS when res.company.logo is not set.
     Classes verified against: addons/web/static/src/views/fields/image/image_field.xml */
  .o_field_image .o_image_placeholder,
  .o_field_image_url .o_image_placeholder,
  .o_company_logo_placeholder,
  /* POS receipt company logo area when empty */
  .pos-receipt .company-logo:empty,
  .pos-receipt .receipt-logo:empty { display: none !important; }

  /* Hide "Powered by Odoo" + Odoo.com links */
  .o_powered_by_odoo, [data-name="powered_by_odoo"],
  a[href*="odoo.com"], a[href*="runbot.odoo.com"] { display: none !important; }

  /* Hide debug menu */
  .o_debug_manager, .o_debug_manager_button { display: none !important; }

  /* Hide Settings → About → Odoo version info */
  .o_about_dialog .o_odoo_branding, .o_odoo_version_info,
  .o_dialog_body img[src*="odoo"] { display: none !important; }

  /* Hide chatter / messaging panel (mail.thread mixin — present on most forms). */
  .o-mail-Chatter, .o-mail-ChatterPanel,
  .o_chatter, .o_chatter_container, .o_FormRenderer_chatterContainer,
  .o-mail-Thread, .o-mail-MessageList,
  .o-mail-ActivityList, .o_Activities,
  .o-mail-Chatter-topbar, .o_chatter_topbar { display: none !important; }
  /* Reclaim width when chatter is hidden */
  .o_form_view .o_form_sheet_bg { padding-right: 0 !important; }
  .o_form_view .o_form_sheet { max-width: 100% !important; }

  /* Smart buttons — navigate out of current app (e.g. "10 Deliveries" → stock.picking) */
  .o_stat_button, .oe_stat_button { display: none !important; }

  /* Breadcrumb nav — disable intermediate crumb links (only show current record name) */
  .o_breadcrumb .o_back_button,
  .o_breadcrumb .breadcrumb-item:not(:last-child) a,
  .o_breadcrumb .breadcrumb-item:not(:last-child) button {
    pointer-events: none !important;
    cursor: default !important;
    color: #999 !important;
    text-decoration: none !important;
  }

  /* Action menu — hide Export, Import, Archive, Duplicate from the ⋮ dropdown */
  .o_cp_action_menus .dropdown-item[aria-label*="Export"],
  .o_cp_action_menus .dropdown-item[aria-label*="Import"],
  .o_cp_action_menus .dropdown-item[aria-label*="Archive"],
  .o_cp_action_menus .dropdown-item[aria-label*="Unarchive"],
  .o_cp_action_menus .dropdown-item[aria-label*="Duplicate"] { display: none !important; }
`;


// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/open-app/$slug")({
  head: () => ({
    meta: [{ title: `Loading… — ${BRAND_NAME}` }],
  }),
  beforeLoad: async ({ params }) => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    if (!session.allowedAppSlugs.includes(params.slug)) {
      throw redirect({ to: "/dashboard" });
    }
    const odooPath = APP_ODOO_PATHS[params.slug];
    if (!odooPath) throw redirect({ to: "/dashboard" });
  },
  loader: async ({ params }) => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    const db = encodeURIComponent(session.odooDb);
    const basePath = APP_ODOO_PATHS[params.slug]!;

    let iframeSrc: string;
    if (params.slug === "pos") {
      // POS: resolve the pos.config ID so we can open the session directly.
      // /pos/ui?config_id=<id>&db=<db> skips the onboarding wizard and routes
      // straight to the checkout product grid.
      // Without config_id, Odoo may redirect to the onboarding wizard or Discuss.
      const configId = await getPosConfigIdFn({ data: { db: session.odooDb } });
      if (configId) {
        iframeSrc = `${basePath}?config_id=${configId}&db=${db}`;
      } else {
        // Fallback: no config yet — open /pos/ui with db only.
        // The onboarding wizard will appear, but that's better than Discuss/Inbox.
        iframeSrc = `${basePath}?db=${db}`;
      }
    } else {
      // All other apps: standard /odoo/<path>?db=<db> URL
      iframeSrc = `${basePath}?db=${db}`;
    }

    return { session, iframeSrc, odooSessionId: session.odooSessionId };
  },
  component: OpenAppPage,
});

// ── Page ───────────────────────────────────────────────────────────────────

function OpenAppPage() {
  const { slug } = Route.useParams();
  const { iframeSrc, odooSessionId } = Route.useLoaderData();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Odoo session cookie — applied synchronously before first iframe paint ──
  //
  // THE BUG THIS FIXES:
  //   The old code used useEffect, which fires *after* the browser paints.
  //   Browsers commit iframe DOM nodes and fire the first network request in the
  //   same task as the commit — before any useEffect runs. So the cookie
  //   re-application was always a race the iframe could lose.
  //
  // THE FIX:
  //   useLayoutEffect runs synchronously after DOM mutations but *before* the
  //   browser paints. The iframe's src is initially null (no request goes out).
  //   We set the cookie in useLayoutEffect, flip cookieReady → true in the same
  //   synchronous run, and only then does the iframe receive its real src —
  //   guaranteeing every single first request carries the correct session cookie.
  const [cookieReady, setCookieReady] = useState(!odooSessionId); // skip gate if no session to apply

  useLayoutEffect(() => {
    if (!odooSessionId) {
      setCookieReady(true);
      return;
    }
    // Refresh the session_id cookie scoped to Path=/ so all proxied Odoo paths receive it.
    // SameSite=Lax (not Strict) is required because Odoo's redirect flows need to carry it.
    const maxAge = 8 * 60 * 60; // 8 hours — same as SESSION_MAX_AGE_SECONDS
    document.cookie = `session_id=${odooSessionId}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
    // Cookie is now written. Flip the gate so the iframe receives its src.
    setCookieReady(true);
  }, [odooSessionId]);


  function injectChromeHidingStyles() {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;

      // Remove any previously injected style (in case of refresh)
      doc.getElementById("kirana-rebrand-injected")?.remove();

      const style = doc.createElement("style");
      style.id = "kirana-rebrand-injected";
      style.textContent = ODOO_HIDE_CHROME_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    } catch {
      // Cross-origin guard (shouldn't happen since we proxy, but be safe)
    }
  }

  function handleLoad() {
    setLoading(false);
    setError(false);
    // Inject CSS to hide Odoo chrome immediately when the iframe finishes loading
    injectChromeHidingStyles();

    // Also set a short delay re-injection since Odoo's OWL framework may
    // re-render the DOM after the initial load event fires
    setTimeout(injectChromeHidingStyles, 800);
    setTimeout(injectChromeHidingStyles, 2000);
  }

  function handleError() {
    setLoading(false);
    setError(true);
  }

  function handleRefresh() {
    setLoading(true);
    setError(false);
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-background)",
        zIndex: 50,
      }}
    >
      {/* Thin top bar — back button + app name */}
      <div
        style={{
          height: "48px",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 1rem",
          gap: "0.75rem",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-foreground-muted)",
            fontSize: "0.875rem",
            fontWeight: 500,
            padding: "0.375rem 0.625rem",
            borderRadius: "var(--radius-md)",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-foreground)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-foreground-muted)";
          }}
        >
          <ArrowLeft size={16} />
          Dashboard
        </button>

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--color-border)",
            flexShrink: 0,
          }}
        />

        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground)", flex: 1 }}>
          {BRAND_NAME}
        </span>

        {!loading && !error && (
          <button
            onClick={handleRefresh}
            title="Refresh"
            style={{
              display: "flex",
              alignItems: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-foreground-subtle)",
              padding: "0.375rem",
              borderRadius: "var(--radius-md)",
            }}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* Loading overlay */}
      {loading && !error && (
        <div
          style={{
            position: "absolute",
            top: "48px",
            inset: "48px 0 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            background: "var(--color-background)",
            zIndex: 1,
          }}
        >
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--color-primary)" }} />
          <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.9375rem" }}>
            Opening app…
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
          }}
        >
          <AlertCircle size={40} style={{ color: "var(--color-destructive)" }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: "1.0625rem", color: "var(--color-foreground)" }}>
              App temporarily unavailable
            </p>
            <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", marginTop: "0.375rem", maxWidth: "320px" }}>
              The system is temporarily unreachable. Please try again in a moment.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-primary" onClick={handleRefresh}>
              <RefreshCw size={15} />
              Try again
            </button>
            <button className="btn-secondary" onClick={() => navigate({ to: "/dashboard" })}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}

      {/* The iframe — loads the Odoo app, fully debranded.
          src is withheld until cookieReady=true (set synchronously in useLayoutEffect)
          so the very first network request always carries the correct session_id cookie. */}
      {!error && (
        <iframe
          ref={iframeRef}
          src={cookieReady ? iframeSrc : undefined}
          title={`${BRAND_NAME} app`}
          style={{
            flex: 1,
            border: "none",
            width: "100%",
            opacity: loading ? 0 : 1,
            transition: "opacity 0.2s ease",
          }}
          onLoad={handleLoad}
          onError={handleError}
          // allow-same-origin is required so we can:
          //   1. Access iframe.contentDocument to inject our debranding CSS
          //   2. The Odoo session cookie is sent with asset/API requests
          // allow-scripts is required for the Odoo web client to run
          // Note: combining both reduces sandbox isolation — acceptable here
          // because the iframe content comes from our own proxied Odoo server.
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
          allow="camera; microphone"
        />
      )}
    </div>
  );
}
