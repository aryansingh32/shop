import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, IndianRupee, Package, ReceiptText, TrendingUp, Users } from "lucide-react";
import { BRAND_NAME } from "@/lib/config";
import { getSessionFn } from "@/lib/auth.functions";
import { getGrowSummaryFn } from "@/lib/reports.functions";

export const Route = createFileRoute("/_app/grow")({
  head: () => ({ meta: [{ title: `Grow — ${BRAND_NAME}` }] }),
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    if (!session.isOwner) throw redirect({ to: "/dashboard" });
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["grow-summary"], queryFn: () => getGrowSummaryFn() }),
  component: GrowPage,
});

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function GrowPage() {
  const fetchSummary = useServerFn(getGrowSummaryFn);
  const { data } = useSuspenseQuery({ queryKey: ["grow-summary"], queryFn: () => fetchSummary() });

  return (
    <div style={{ maxWidth: "980px" }}>
      <div className="page-header">
        <h1>Grow</h1>
        <p>Daily answers for sales, stock, and customer follow-up</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <SummaryCard label="Sales today" value={fmtCurrency(data.salesToday)} icon={<IndianRupee size={20} />} />
        <SummaryCard label="Bills today" value={String(data.ordersToday)} icon={<ReceiptText size={20} />} />
        <SummaryCard label="Average bill" value={fmtCurrency(data.averageBillToday)} icon={<TrendingUp size={20} />} />
        <SummaryCard label="Low stock" value={String(data.lowStockCount)} icon={<AlertTriangle size={20} />} tone={data.lowStockCount > 0 ? "warning" : "normal"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "1rem" }}>
        <section className="section-card">
          <div className="section-card-header">
            <div>
              <h2>Top products today</h2>
              <p>What is earning money at the counter</p>
            </div>
          </div>
          <div className="section-card-body">
            {data.topProducts.length === 0 ? (
              <EmptyLine icon={<Package size={26} />} text="No paid bills yet today." />
            ) : (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {data.topProducts.map((p, index) => (
                  <div key={p.productId} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr) 90px 110px", gap: "0.75rem", alignItems: "center", padding: "0.75rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                    <div style={{ fontWeight: 800, color: "var(--color-foreground-muted)" }}>{index + 1}</div>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ color: "var(--color-foreground-muted)" }}>{p.qty} sold</div>
                    <div style={{ fontWeight: 800, textAlign: "right" }}>{fmtCurrency(p.sales)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="section-card">
          <div className="section-card-header">
            <div>
              <h2>Action list</h2>
              <p>What needs attention</p>
            </div>
          </div>
          <div className="section-card-body" style={{ display: "grid", gap: "0.75rem" }}>
            <ActionItem icon={<AlertTriangle size={18} />} label="Products low on stock" value={String(data.lowStockCount)} />
            <ActionItem icon={<Users size={18} />} label="Customers to re-engage" value={String(data.inactiveCustomers)} />
            <ActionItem icon={<Package size={18} />} label="Dead stock candidates" value={String(data.deadStock.length)} />
          </div>
        </section>
      </div>

      <section className="section-card" style={{ marginTop: "1rem" }}>
        <div className="section-card-header">
          <div>
            <h2>Dead stock candidates</h2>
            <p>Items with stock but no recorded sales yet</p>
          </div>
        </div>
        <div className="section-card-body">
          {data.deadStock.length === 0 ? (
            <EmptyLine icon={<TrendingUp size={26} />} text="No dead stock candidates found." />
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {data.deadStock.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.75rem", borderBottom: "1px solid var(--color-border)" }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  <span style={{ color: "var(--color-foreground-muted)" }}>{p.qtyAvailable} in stock</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone = "normal" }: { label: string; value: string; icon: React.ReactNode; tone?: "normal" | "warning" }) {
  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: tone === "warning" ? "var(--color-warning)" : "var(--color-primary)" }}>
        {icon}
      </div>
      <div style={{ marginTop: "0.75rem", fontSize: "1.45rem", fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--color-foreground-muted)", fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function ActionItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.75rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2rem", color: "var(--color-foreground-muted)" }}>
      {icon}
      {text}
    </div>
  );
}
