import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useState, useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDevShopsFn } from "@/lib/shop.functions";

import appCss from "../styles.css?url";
import { BRAND_NAME } from "@/lib/config";

// ── Shell ──────────────────────────────────────────────────────────────────

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: "var(--font-sans)", borderRadius: "var(--radius-lg)" },
        }}
      />
    </QueryClientProvider>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────

function NotFoundComponent() {
  const [shops, setShops] = useState<any[]>([]);
  const fetchDevShops = useServerFn(getDevShopsFn);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      fetchDevShops().then(setShops).catch(() => {});
    }
  }, []);

  const handleSelectShop = (sub: string) => {
    document.cookie = `dev_shop_subdomain=${encodeURIComponent(sub)}; path=/; max-age=86400; SameSite=Lax`;
    window.location.href = `/login?shop=${encodeURIComponent(sub)}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: "var(--color-background)" }}>
      <div className="max-w-md w-full text-center">
        <div className="text-5xl font-bold" style={{ color: "var(--color-primary)" }}>404</div>
        <h1 className="mt-4 text-2xl font-semibold" style={{ color: "var(--color-foreground)" }}>
          Shop not found
        </h1>
        <p className="mt-2 text-base" style={{ color: "var(--color-foreground-muted)" }}>
          The URL you visited doesn't belong to any shop on {BRAND_NAME}. Check the link and try again.
        </p>

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 p-6 text-left rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
                ⚡ Dev Mode: Shop Switcher
              </span>
              <span className="text-xs text-muted-foreground">{shops.length} provisioned</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Select a shop below to set your local dev cookie and jump straight to its portal:
            </p>
            {shops.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground bg-muted/50 rounded-lg">
                No shops created yet. Go to the Admin Panel (port 3000) to add one!
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {shops.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectShop(s.subdomain)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-left group"
                  >
                    <div>
                      <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {s.business_name}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {s.subdomain}.localhost:3001
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary">
                      Test ↗
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Error ──────────────────────────────────────────────────────────────────

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--color-background)" }}>
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--color-foreground)" }}>
          Something went wrong
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-foreground-muted)" }}>
          {error.message || "An unexpected error occurred. Please try refreshing the page."}
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </div>
    </div>
  );
}

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Title set per-route; this is the fallback
      { title: BRAND_NAME },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=Nunito:wght@700;800;900&display=swap",
      },
      // Favicon is intentionally a generic /favicon.ico — replace with brand asset in production
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
