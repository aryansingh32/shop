import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, LayoutGrid, Lock } from "lucide-react";
import { BRAND_NAME } from "@/lib/config";
import { getDashboardDataFn } from "@/lib/shop.functions";

export const Route = createFileRoute("/_app/apps-marketplace")({
  head: () => ({ meta: [{ title: `Apps — ${BRAND_NAME}` }] }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["dashboard"], queryFn: () => getDashboardDataFn() }),
  component: AppsPage,
});

function AppsPage() {
  const fetchDashboard = useServerFn(getDashboardDataFn);
  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });
  const { plan, apps } = data;

  return (
    <div style={{ maxWidth: "900px" }}>
      <div className="page-header">
        <h1>Apps</h1>
        <p>{plan ? `${plan.name} plan includes ${apps.length} app${apps.length === 1 ? "" : "s"}` : "Apps enabled for your shop"}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {apps.map((app) => (
          <div key={app.id} className="card" style={{ padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: "var(--radius-lg)", background: "var(--color-primary-soft)", color: "var(--color-primary)", display: "grid", placeItems: "center" }}>
                <LayoutGrid size={21} />
              </div>
              <span className="badge badge-success" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <CheckCircle2 size={13} />
                Included
              </span>
            </div>
            <h2 style={{ margin: "1rem 0 0.25rem", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}>{app.name}</h2>
            <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem", margin: 0 }}>{app.description}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: "1rem", padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--color-foreground-muted)" }}>
        <Lock size={18} />
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          New paid add-ons are enabled by support after plan confirmation. This keeps billing clear and avoids surprise charges.
        </p>
      </div>
    </div>
  );
}
