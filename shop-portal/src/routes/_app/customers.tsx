/**
 * Customers — Coming Soon placeholder
 * Feature 2: This route is registered by the navigation redesign.
 * The real Customers screen (credit book, loyalty, contacts) is planned
 * for Feature 10 (Credit Book). Until then, this placeholder is shown.
 */
import { createFileRoute } from "@tanstack/react-router";
import { UserCircle } from "lucide-react";
import { BRAND_NAME } from "@/lib/config";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: `Customers — ${BRAND_NAME}` }] }),
  component: CustomersPlaceholder,
});

function CustomersPlaceholder() {
  return (
    <div style={{ maxWidth: "640px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          background: "oklch(0.90 0.06 250)",
          color: "oklch(0.38 0.18 250)",
          borderRadius: "var(--radius-xl)",
          width: "56px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 12px oklch(0.52 0.15 250 / 20%)",
        }}>
          <UserCircle size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "1.75rem", color: "var(--color-foreground)",
            letterSpacing: "-0.02em", margin: 0,
          }}>
            Customers
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem", color: "var(--color-foreground-muted)" }}>
            Know your regulars, track loyalty, and manage credit
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
          <UserCircle size={36} style={{ color: "var(--color-foreground-muted)" }} />
        </div>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: "1.25rem", color: "var(--color-foreground)", marginBottom: "0.75rem",
        }}>
          Coming soon
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-foreground-muted)", maxWidth: "400px", margin: "0 auto 0.5rem", lineHeight: 1.6 }}>
          See who your best customers are, reward loyalty, and manage credit accounts — all in one place.
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-foreground-subtle)", marginTop: "1.5rem" }}>
          We're building this now. It'll be worth the wait. 🙏
        </p>
      </div>
    </div>
  );
}
