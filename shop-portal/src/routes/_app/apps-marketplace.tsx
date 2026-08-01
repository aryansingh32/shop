/**
 * Apps Marketplace — Coming Soon placeholder
 * Feature 2: This route is registered by the navigation redesign.
 * The real marketplace (Feature 5) will replace this placeholder.
 * Until then, this "Coming soon" state is shown.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { BRAND_NAME } from "@/lib/config";

export const Route = createFileRoute("/_app/apps-marketplace")({
  head: () => ({ meta: [{ title: `Apps — ${BRAND_NAME}` }] }),
  component: AppsMarketplacePlaceholder,
});

function AppsMarketplacePlaceholder() {
  return (
    <div style={{ maxWidth: "640px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          background: "oklch(0.90 0.07 75)",
          color: "oklch(0.42 0.20 75)",
          borderRadius: "var(--radius-xl)",
          width: "56px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 12px oklch(0.60 0.18 75 / 20%)",
        }}>
          <LayoutGrid size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "1.75rem", color: "var(--color-foreground)",
            letterSpacing: "-0.02em", margin: 0,
          }}>
            Apps
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem", color: "var(--color-foreground-muted)" }}>
            Explore and enable tools for your shop — with clear, transparent pricing
          </p>
        </div>
      </div>

      <div style={{
        background: "var(--color-surface)",
        border: "1.5px solid var(--color-border)",
        borderRadius: "var(--radius-xl)",
        padding: "2.5rem",
        textAlign: "center",
      }}>
        <div style={{
          width: "72px", height: "72px",
          background: "var(--color-accent)",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1.5rem",
        }}>
          <LayoutGrid size={36} style={{ color: "var(--color-foreground-muted)" }} />
        </div>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: "1.25rem", color: "var(--color-foreground)", marginBottom: "0.75rem",
        }}>
          Coming soon
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-foreground-muted)", maxWidth: "400px", margin: "0 auto 0.5rem", lineHeight: 1.6 }}>
          Enable only the apps your shop needs. Every price shown upfront — no surprises, no hidden fees.
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-foreground-subtle)", marginTop: "1.5rem" }}>
          No more calling to ask "how much does this feature cost?" 💬
        </p>
      </div>
    </div>
  );
}
