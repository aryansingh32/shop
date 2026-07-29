import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardMetrics, getRecentActivity } from "@/lib/dashboard.functions";
import { PageHeader } from "@/components/page-header";
import { formatINR, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Clock, TrendingUp, Store, Sparkles, Loader2, Activity, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Kshetra Ops" },
      { name: "description", content: "Platform overview: MRR, shops, provisioning health, and recent activity." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const fetchActivity = useServerFn(getRecentActivity);
  const { data: metrics } = useSuspenseQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 60_000,
  });
  const { data: activity } = useSuspenseQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetchActivity(),
    refetchInterval: 30_000,
  });

  const signupsDelta = metrics.newThisMonth - metrics.newLastMonth;
  const chartColor = "var(--color-status-success)";

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Real-time metrics across every shop and subscription."
      />

      <div className="grid gap-4 p-6 lg:grid-cols-4">
        <MetricCard
          label="Monthly recurring revenue"
          value={formatINR(metrics.mrr)}
          hint={`${metrics.activeShops} active shops`}
          icon={<TrendingUp className="size-4" />}
        />
        <MetricCard
          label="Total shops"
          value={formatNumber(metrics.totalShops)}
          hint={`${metrics.trialCount} on trial`}
          icon={<Store className="size-4" />}
        />
        <MetricCard
          label="New this month"
          value={formatNumber(metrics.newThisMonth)}
          delta={signupsDelta}
          deltaLabel="vs last month"
          icon={<Sparkles className="size-4" />}
        />
        <MetricCard
          label="Churn rate"
          value={`${metrics.churnRate.toFixed(1)}%`}
          hint={`${metrics.cancelledCount} cancelled all-time`}
          icon={<ArrowDownRight className="size-4" />}
          tone={metrics.churnRate > 5 ? "warning" : "neutral"}
        />
      </div>

      {/* Odoo provisioning health summary */}
      <div className="grid gap-3 px-6 pb-2 sm:grid-cols-4">
        <ProvisioningHealthChip label="Live" count={metrics.provisioningHealth?.live ?? 0} color="success" />
        <ProvisioningHealthChip label="Provisioning" count={metrics.provisioningHealth?.provisioning ?? 0} color="info" spinning />
        <ProvisioningHealthChip label="Failed" count={metrics.provisioningHealth?.failed ?? 0} color="danger" />
        <ProvisioningHealthChip label="Pending" count={metrics.provisioningHealth?.pending ?? 0} color="neutral" />
      </div>

      <div className="grid gap-6 px-6 pb-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 gap-0">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Revenue trend</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Monthly recurring revenue over the last 12 months</p>
              </div>
              <div className="font-mono text-xs text-muted-foreground">MRR × 12mo</div>
            </div>
          </div>
          <div className="p-5">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.growth} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mrr-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v / 1000}k`)}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [formatINR(v), "MRR"]}
                  />
                  <Area type="monotone" dataKey="mrr" stroke={chartColor} strokeWidth={2} fill="url(#mrr-fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card className="gap-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Alerts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Items needing your attention</p>
          </div>
          <div className="divide-y divide-border">
            {metrics.alerts.failedProvisioning.length === 0 && metrics.alerts.trialsEndingSoon.length === 0 && (
              <div className="px-5 py-10 text-center text-xs text-muted-foreground">
                All clear. No urgent alerts.
              </div>
            )}
            {metrics.alerts.failedProvisioning.map((a) => (
              <Link
                key={a.id}
                to="/shops/$id"
                params={{ id: a.id }}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">Provisioning failed</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{a.name}</div>
                </div>
              </Link>
            ))}
            {metrics.alerts.trialsEndingSoon.map((a) => (
              <Link
                key={a.id}
                to="/shops/$id"
                params={{ id: a.id }}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                <Clock className="mt-0.5 size-4 shrink-0 text-status-warning" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">Trial ending soon</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.name} · {formatDistanceToNow(new Date(a.ends), { addSuffix: true })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 px-6 pb-8 lg:grid-cols-3">
        <Card className="gap-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Plan mix</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Active shops by plan</p>
          </div>
          <div className="p-5">
            {metrics.planMix.length === 0 ? (
              <EmptyChart>No plans yet</EmptyChart>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.planMix} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}
                      formatter={(v: number) => [`${v} shops`, "Active"]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="var(--color-status-info)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        <Card className="gap-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Business types</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">All shops by category</p>
          </div>
          <div className="p-5">
            {metrics.totalShops === 0 ? (
              <EmptyChart>No shops yet</EmptyChart>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.businessMix} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {metrics.businessMix.map((_, i) => (
                        <Cell key={i} fill={["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-5)"][i % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        <Card className="gap-0">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest platform events</p>
            </div>
            <Link to="/audit" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-muted-foreground">No activity yet</div>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] text-foreground">{a.action}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {a.actor_email} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tracking-tight ${tone === "warning" ? "text-status-warning" : ""}`}>
          {value}
        </span>
        {delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${delta >= 0 ? "text-status-success" : "text-status-danger"}`}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {deltaLabel && !hint && <div className="text-xs text-muted-foreground">{deltaLabel}</div>}
    </Card>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function ProvisioningHealthChip({
  label,
  count,
  color,
  spinning,
}: {
  label: string;
  count: number;
  color: "success" | "danger" | "info" | "neutral";
  spinning?: boolean;
}) {
  const colors = {
    success: "bg-status-success/10 border-status-success/20 text-status-success",
    danger: "bg-status-danger/10 border-status-danger/20 text-status-danger",
    info: "bg-status-info/10 border-status-info/20 text-status-info",
    neutral: "bg-muted/60 border-border text-muted-foreground",
  };
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${colors[color]}`}>
      {spinning && count > 0 ? (
        <Loader2 className="size-3 animate-spin shrink-0" />
      ) : (
        <Activity className="size-3 shrink-0" />
      )}
      <span className="font-mono text-xs font-medium">{count}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

// Loading fallback via router (suspense)
export function LoadingFallback() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

