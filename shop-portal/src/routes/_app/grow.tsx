/**
 * Grow (Reports) — Coming Soon placeholder
 * Feature 2: This route is registered by the navigation redesign.
 * The real Grow screen (reports, top products, sales analytics) is Feature 7.
 * Until then, this placeholder is shown.
 */
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { BRAND_NAME } from "@/lib/config";

export const Route = createFileRoute("/_app/grow")({
  head: () => ({ meta: [{ title: `Grow — ${BRAND_NAME}` }] }),
  component: GrowPlaceholder,
});

function GrowPlaceholder() {
  return (
    <div style={{ maxWidth: "640px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          background: "oklch(0.92 0.08 145)",
          color: "oklch(0.38 0.20 145)",
          borderRadius: "var(--radius-xl)",
          width: "56px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 12px oklch(0.52 0.15 145 / 20%)",
        }}>
          <TrendingUp size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "1.75rem", color: "var(--color-foreground)",
            letterSpacing: "-0.02em", margin: 0,
          }}>
            Grow
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem", color: "var(--color-foreground-muted)" }}>
            Sales reports, top products, and business insights
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
          <TrendingUp size={36} style={{ color: "var(--color-foreground-muted)" }} />
        </div>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: "1.25rem", color: "var(--color-foreground)", marginBottom: "0.75rem",
        }}>
          Coming soon
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-foreground-muted)", maxWidth: "400px", margin: "0 auto 0.5rem", lineHeight: 1.6 }}>
          Today's sales, top-selling products, worst performers, and low stock alerts — in 3 numbers, not 30.
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-foreground-subtle)", marginTop: "1.5rem" }}>
          Reports designed for shop owners, not accountants. 📊
        </p>
      </div>
    </div>
  );
}
