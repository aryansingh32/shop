import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getShop,
  updateShop,
  changeShopPlan,
  suspendShop,
  reactivateShop,
  deleteShop,
  retryProvisioning,
  markProvisioningResult,
} from "@/lib/shops.functions";
import { listPlans } from "@/lib/plans.functions";
import { getOdooShopHealth, getShopOdooEmployees, setShopUserPassword } from "@/lib/odoo/odoo.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  StatusBadge,
  subscriptionStatusTone,
  provisioningStatusTone,
} from "@/components/status-badge";
import { formatINR } from "@/lib/format";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle2,
  XCircle,
  Activity,
  Users,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  WifiOff,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/shops/$id")({
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${(loaderData as { shop: { business_name: string } }).shop.business_name} — Kshetra Ops`
          : "Shop — Kshetra Ops",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["shop", params.id],
      queryFn: () => getShop({ data: { id: params.id } }),
    }),
  component: ShopDetailPage,
});

function ShopDetailPage() {
  const { id } = Route.useParams();
  const fetchShop = useServerFn(getShop);
  const fetchPlans = useServerFn(listPlans);
  const { data } = useSuspenseQuery({
    queryKey: ["shop", id],
    queryFn: () => fetchShop({ data: { id } }),
  });
  const { data: plans } = useSuspenseQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
  });
  const shop = data.shop;

  const ODOO_URL = typeof window !== "undefined"
    ? (import.meta.env.VITE_ODOO_URL ?? "http://localhost:8069")
    : "http://localhost:8069";

  const BASE_DOMAIN = typeof window !== "undefined"
    ? (import.meta.env.VITE_BASE_DOMAIN ?? "localhost:3001")
    : "localhost:3001";
  const shopPortalUrl = `http://${shop.subdomain}.${BASE_DOMAIN}`;

  return (
    <>
      <div className="border-b border-border bg-background">
        <div className="px-6 pt-6">
          <Link
            to="/shops"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            All shops
          </Link>
        </div>
        <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{shop.business_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{shop.owner_name}</span>
              {shop.city && (
                <>
                  <span>·</span>
                  <span>
                    {shop.city}
                    {shop.state ? `, ${shop.state}` : ""}
                  </span>
                </>
              )}
              <span>·</span>
              <a
                href={shopPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded"
              >
                {shop.subdomain}.{BASE_DOMAIN}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={subscriptionStatusTone(shop.subscription_status)}>
                {shop.subscription_status.replace("_", " ")}
              </StatusBadge>
              <StatusBadge tone={provisioningStatusTone(shop.provisioning_status)}>
                Odoo: {shop.provisioning_status}
              </StatusBadge>
              {shop.plan && (
                <span className="rounded-md border border-border px-2 py-0.5 text-xs">
                  {shop.plan.name} ·{" "}
                  <span className="font-mono">{formatINR(shop.plan.monthly_price_inr)}/mo</span>
                </span>
              )}
              {/* Open Shop Portal button */}
              <a
                href={`${shopPortalUrl}/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground font-medium px-2.5 py-0.5 text-xs hover:bg-primary/90 transition-colors shadow-sm"
              >
                Open Shop Portal
                <ExternalLink className="size-3" />
              </a>
              {/* Open in Odoo link — only shown when live */}
              {shop.provisioning_status === "live" && shop.odoo_db_name && (
                <a
                  href={`${ODOO_URL}/web?db=${shop.odoo_db_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted/50 transition-colors"
                >
                  Open in Odoo
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
          <ShopActionsMenu shop={shop} />
        </div>
      </div>


      {shop.provisioning_status === "failed" && (
        <div className="mx-6 mt-4 rounded-md border border-status-danger/20 bg-status-danger-soft px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-status-danger">Provisioning failed</div>
              {shop.provisioning_error && (
                <div className="mt-0.5 font-mono text-xs text-status-danger/80">
                  {shop.provisioning_error}
                </div>
              )}
            </div>
            <RetryButton id={shop.id} />
          </div>
        </div>
      )}

      {shop.provisioning_status === "provisioning" && (
        <div className="mx-6 mt-4 rounded-md border border-status-info/20 bg-status-info-soft px-4 py-3">
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 animate-spin text-status-info" />
            <div>
              <div className="text-sm font-medium text-status-info">Provisioning in progress</div>
              <div className="mt-0.5 text-xs text-status-info/80">
                Creating Odoo database and installing modules. This typically takes 2–5 minutes.
              </div>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="px-6 pt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plan">Plan &amp; Apps</TabsTrigger>
          <TabsTrigger value="odoo">
            <Activity className="mr-1.5 size-3.5" />
            Odoo Health
          </TabsTrigger>
          <TabsTrigger value="employees">
            <Users className="mr-1.5 size-3.5" />
            Employees
          </TabsTrigger>
          <TabsTrigger value="activity">Audit &amp; System Logs ({data.activity?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 pb-8">
          <OverviewTab shop={shop} activity={data.activity || []} currentPassword={data.currentPassword} />
        </TabsContent>

        <TabsContent value="plan" className="mt-6 pb-8">
          <PlanTab shop={shop} plans={plans} />
        </TabsContent>

        <TabsContent value="odoo" className="mt-6 pb-8">
          <OdooHealthTab shopId={shop.id} shop={shop} />
        </TabsContent>

        <TabsContent value="employees" className="mt-6 pb-8">
          <EmployeesTab shopId={shop.id} shop={shop} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6 pb-8">
          <ActivityTab activity={data.activity} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ shop, activity = [], currentPassword = "admin" }: { shop: any; activity?: any[]; currentPassword?: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    business_name: shop.business_name,
    owner_name: shop.owner_name,
    phone: shop.phone ?? "",
    email: shop.email ?? "",
    city: shop.city ?? "",
    state: shop.state ?? "",
    gstin: shop.gstin ?? "",
    business_type: shop.business_type as "mobile_shop" | "clothing_shop" | "mall" | "other",
  });
  const update = useServerFn(updateShop);
  const mut = useMutation({
    mutationFn: () => update({ data: { id: shop.id, patch: form as never } }),
    onSuccess: () => {
      toast.success("Shop details updated");
      qc.invalidateQueries({ queryKey: ["shop", shop.id] });
      qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adminEmail = shop.email || `admin@${shop.subdomain || "shop"}.kshetra.app`;
  const odooUrl = typeof window !== "undefined" ? (import.meta.env.VITE_ODOO_URL ?? "http://localhost:8069") : "http://localhost:8069";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 gap-0 lg:col-span-2">
        <h2 className="text-sm font-semibold">Business details</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="mt-4 grid grid-cols-2 gap-4"
        >
          <div className="col-span-2 space-y-1.5">
            <Label>Business name</Label>
            <Input
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Input
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Business type</Label>
            <Select
              value={form.business_type}
              onValueChange={(v) => setForm({ ...form, business_type: v as typeof form.business_type })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_shop">Mobile shop</SelectItem>
                <SelectItem value="clothing_shop">Clothing shop</SelectItem>
                <SelectItem value="mall">Mall</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" size="sm" disabled={mut.isPending}>
              {mut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-6">
        <Card className="p-5 gap-3">
          <h2 className="text-sm font-semibold">Shop Domain &amp; Credentials</h2>
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Portal Domain</span>
            <a
              href={`http://${shop.subdomain}.${typeof window !== "undefined" ? (import.meta.env.VITE_BASE_DOMAIN ?? "localhost:3001") : "localhost:3001"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              {shop.subdomain}.{typeof window !== "undefined" ? (import.meta.env.VITE_BASE_DOMAIN ?? "localhost:3001") : "localhost:3001"}
              <ExternalLink className="size-3" />
            </a>
          </div>
          <MetaRow k="Status" v={shop.provisioning_status} />
          <MetaRow k="Database" v={shop.odoo_db_name ?? "Not created"} mono />
          <MetaRow k="Admin Logins" v={adminEmail === "admin" ? "admin" : `admin  /  ${adminEmail}`} mono />
          <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin Password</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-xs font-semibold">
                <span>{currentPassword}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentPassword);
                    setCopied(true);
                    toast.success("Password copied");
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  title="Copy password"
                >
                  {copied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                </button>
              </div>
              <ChangeUserPasswordDialog shopId={shop.id} userId={2} login={adminEmail} />
            </div>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <a
              href={`http://${shop.subdomain}.${typeof window !== "undefined" ? (import.meta.env.VITE_BASE_DOMAIN ?? "localhost:3001") : "localhost:3001"}/login`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground font-medium py-1.5 text-xs hover:bg-primary/90 transition-colors shadow-sm"
            >
              Login to Shop Portal
              <ExternalLink className="size-3" />
            </a>
            {shop.provisioning_status === "live" && shop.odoo_db_name && (
              <a
                href={`${odooUrl}/web?db=${shop.odoo_db_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
              >
                Launch Odoo Admin <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </Card>


        <Card className="p-5 gap-3">
          <h2 className="text-sm font-semibold">Recent Logs &amp; Activity</h2>
          {activity.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 text-center">No logs recorded yet.</div>
          ) : (
            <div className="space-y-2.5">
              {activity.slice(0, 4).map((a) => (
                <div key={a.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium">{a.action}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {a.actor_email} · {a.entity_type}
                  </div>
                </div>
              ))}
              {activity.length > 4 && (
                <div className="text-center pt-1">
                  <span className="text-[11px] text-muted-foreground">View all in Audit &amp; System Logs tab</span>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 gap-3">
          <h2 className="text-sm font-semibold">Instance metadata</h2>
          <MetaRow k="Subdomain" v={shop.subdomain ?? "—"} mono />
          <MetaRow k="Created" v={format(new Date(shop.created_at), "d MMM yyyy 'at' HH:mm")} />
          <MetaRow
            k="Last active"
            v={
              shop.last_active_at
                ? formatDistanceToNow(new Date(shop.last_active_at), { addSuffix: true })
                : "Never"
            }
          />
          <MetaRow
            k="Trial ends"
            v={shop.trial_ends_at ? format(new Date(shop.trial_ends_at), "d MMM yyyy") : "—"}
          />
        </Card>
      </div>
    </div>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{k}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} truncate max-w-[180px] text-right`}>
        {v}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Tab
// ─────────────────────────────────────────────────────────────────────────────

function PlanTab({ shop, plans }: { shop: any; plans: any[] }) {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string>(shop.plan_id ?? "");
  const changePlan = useServerFn(changeShopPlan);
  const mut = useMutation({
    mutationFn: () => changePlan({ data: { id: shop.id, plan_id: planId } }),
    onSuccess: () => {
      toast.success("Plan updated. App install/uninstall queued.");
      qc.invalidateQueries({ queryKey: ["shop", shop.id] });
      qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 gap-4">
        <div>
          <h2 className="text-sm font-semibold">Current plan</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Changing the plan triggers Odoo module install/uninstall for the difference.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans
                .filter((p) => !p.is_archived || p.id === shop.plan_id)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {formatINR(p.monthly_price_inr)}/mo
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending || planId === shop.plan_id}
        >
          {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Apply plan change
        </Button>
      </Card>

      <Card className="p-5 gap-3">
        <h2 className="text-sm font-semibold">Included apps</h2>
        <p className="text-xs text-muted-foreground">
          {selectedPlan
            ? `Apps included in ${selectedPlan.name}`
            : "Choose a plan to see its included apps"}
        </p>
        <div className="mt-2 space-y-2">
          {selectedPlan?.app_ids?.length ? (
            <PlanApps planId={selectedPlan.id} />
          ) : (
            <div className="text-xs text-muted-foreground">No apps in this plan</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PlanApps({ planId }: { planId: string }) {
  const fetchPlans = useServerFn(listPlans);
  const { data: plans } = useSuspenseQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
  });
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return null;
  return <PlanAppChips appIds={plan.app_ids} />;
}

function PlanAppChips({ appIds }: { appIds: string[] }) {
  const { data: apps } = useSuspenseQuery({
    queryKey: ["apps"],
    queryFn: async () => {
      const { listApps } = await import("@/lib/apps.functions");
      return listApps();
    },
  });
  const selected = apps.filter((a) => appIds.includes(a.id));
  if (selected.length === 0) return <div className="text-xs text-muted-foreground">None</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {selected.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
        >
          <span>{a.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{a.odoo_module_name}</span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Odoo Health Tab
// ─────────────────────────────────────────────────────────────────────────────

function OdooHealthTab({ shopId, shop }: { shopId: string; shop: any }) {
  const fetchHealth = useServerFn(getOdooShopHealth);
  const [enabled, setEnabled] = useState(false);

  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["odoo-health", shopId],
    queryFn: () => fetchHealth({ data: { shopId } }),
    enabled,
    staleTime: 30_000,
  });

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <Activity className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Live Odoo Status</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Check the real-time health of this shop's Odoo database, including installed modules and
          drift detection.
        </p>
        <Button size="sm" className="mt-4" onClick={() => setEnabled(true)}>
          Check Live Status
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Pinging Odoo...</span>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Status cards */}
      <div className="lg:col-span-3 grid gap-4 sm:grid-cols-3">
        <Card className="p-4 gap-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Odoo reachability
          </div>
          <div className="flex items-center gap-2">
            {health.reachable ? (
              <CheckCircle className="size-4 text-status-success" />
            ) : (
              <WifiOff className="size-4 text-status-danger" />
            )}
            <span className={`text-sm font-medium ${health.reachable ? "text-status-success" : "text-status-danger"}`}>
              {health.reachable ? "Online" : "Unreachable"}
            </span>
          </div>
          {health.odooVersion && (
            <div className="font-mono text-[11px] text-muted-foreground">v{health.odooVersion}</div>
          )}
        </Card>

        <Card className="p-4 gap-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Database status
          </div>
          <div className="flex items-center gap-2">
            {health.dbExists ? (
              <CheckCircle className="size-4 text-status-success" />
            ) : (
              <XCircle className="size-4 text-status-danger" />
            )}
            <span className={`text-sm font-medium ${health.dbExists ? "text-status-success" : "text-status-danger"}`}>
              {health.dbExists ? "Exists" : "Not found"}
            </span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {shop.odoo_db_name ?? "—"}
          </div>
        </Card>

        <Card className="p-4 gap-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Plan drift
          </div>
          <div className="flex items-center gap-2">
            {health.hasDrift ? (
              <ShieldAlert className="size-4 text-status-warning" />
            ) : (
              <CheckCircle className="size-4 text-status-success" />
            )}
            <span className={`text-sm font-medium ${health.hasDrift ? "text-status-warning" : "text-status-success"}`}>
              {health.hasDrift
                ? `${health.missingModules.length} module(s) missing`
                : "In sync"}
            </span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {health.installedModules.length} installed · {health.userCount} users
          </div>
        </Card>
      </div>

      {/* Drift details */}
      {health.hasDrift && (
        <Card className="p-5 gap-3 lg:col-span-3 border-status-warning/30 bg-status-warning-soft">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-warning" />
            <h3 className="text-sm font-semibold text-status-warning">Module Drift Detected</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            The following modules are assigned by the plan but not installed in Odoo. Use
            "Apply plan change" in the Plan tab to trigger installation.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {health.missingModules.map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-md bg-status-warning/10 border border-status-warning/20 px-2 py-0.5 font-mono text-[11px] text-status-warning"
              >
                {m}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Installed modules list */}
      <Card className="p-5 gap-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Installed modules</h3>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        </div>
        {health.installedModules.length === 0 ? (
          <div className="text-xs text-muted-foreground">No modules data available</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {health.installedModules.map((m) => (
              <span
                key={m.id}
                className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] ${
                  health.planModules.includes(m.name)
                    ? "bg-status-success/10 border-status-success/20 text-status-success"
                    : "bg-muted/40 border-border text-muted-foreground"
                }`}
              >
                {m.name}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-status-success/10 border border-status-success/20 mr-1" />
          Green = included in current plan.
        </p>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employees Tab
// ─────────────────────────────────────────────────────────────────────────────

function EmployeesTab({ shopId, shop }: { shopId: string; shop: any }) {
  const fetchEmployees = useServerFn(getShopOdooEmployees);
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["odoo-employees", shopId],
    queryFn: () => fetchEmployees({ data: { shopId } }),
    enabled,
    staleTime: 60_000,
  });

  if (shop.provisioning_status !== "live") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <Users className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">No employees available</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Employees are visible once the shop's Odoo instance is live.
          Current status: <strong>{shop.provisioning_status}</strong>
        </p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <Users className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Shop Employees</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Load the actual user accounts from this shop's Odoo database.
        </p>
        <Button size="sm" className="mt-4" onClick={() => setEnabled(true)}>
          Load Employees
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading employees from Odoo...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <Card className="gap-0 p-0 overflow-hidden">
      {data.message && (
        <div className="px-5 py-3 text-xs text-muted-foreground border-b border-border bg-muted/30">
          {data.message}
        </div>
      )}
      {data.employees.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No employees found in this shop's Odoo instance.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-5 py-3 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Name
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Login / Email
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Status
              </th>
              <th className="px-5 py-3 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((emp) => (
              <tr key={emp.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">{emp.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {emp.login}
                  {emp.email && emp.email !== emp.login && (
                    <div className="text-[11px] opacity-70">{emp.email}</div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge tone={emp.active ? "success" : "neutral"}>
                    {emp.active ? "Active" : "Inactive"}
                  </StatusBadge>
                </td>
                <td className="px-5 py-3 text-right">
                  <ChangeUserPasswordDialog shopId={shopId} userId={emp.id} login={emp.login} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ChangeUserPasswordDialog({ shopId, userId, login }: { shopId: string; userId: number; login: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const qc = useQueryClient();
  const router = useRouter();
  const resetPwd = useServerFn(setShopUserPassword);
  const mut = useMutation({
    mutationFn: () => resetPwd({ data: { shopId, userId, newPassword: password } }),
    onSuccess: () => {
      toast.success(`Password updated for ${login}`);
      qc.invalidateQueries({ queryKey: ["shop", shopId] });
      router.invalidate();
      setOpen(false);
      setPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
          <KeyRound className="mr-1.5 size-3 text-muted-foreground" />
          Set Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Odoo Password</DialogTitle>
          <DialogDescription>
            Set a new Odoo login password for user <strong>{login}</strong> (ID: {userId}).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`pwd-${userId}`}>New Password</Label>
            <Input
              id={`pwd-${userId}`}
              required
              type="text"
              placeholder="e.g. admin123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending || !password}>
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Tab
// ─────────────────────────────────────────────────────────────────────────────

function ActivityTab({ activity }: { activity: any[] }) {
  if (activity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        No activity recorded for this shop yet.
      </div>
    );
  }
  return (
    <Card className="p-0 gap-0">
      {activity.map((a, i) => (
        <div
          key={a.id}
          className={`px-5 py-3 ${i < activity.length - 1 ? "border-b border-border" : ""}`}
        >
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-xs">{a.action}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {a.actor_email} · {a.entity_type}
              </div>
            </div>
            <div className="shrink-0 text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action buttons
// ─────────────────────────────────────────────────────────────────────────────

function ShopActionsMenu({ shop }: { shop: any }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shop.provisioning_status === "provisioning" && <MarkResultButtons shopId={shop.id} />}
      {shop.provisioning_status === "failed" && <RetryButton id={shop.id} />}
      {shop.subscription_status !== "suspended" ? (
        <SuspendButton shopId={shop.id} name={shop.business_name} />
      ) : (
        <ReactivateButton shopId={shop.id} />
      )}
      <DeleteButton shopId={shop.id} name={shop.business_name} />
    </div>
  );
}

function RetryButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const retry = useServerFn(retryProvisioning);
  const mut = useMutation({
    mutationFn: () => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Provisioning retry started");
      qc.invalidateQueries({ queryKey: ["shop", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? (
        <Loader2 className="mr-2 size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 size-3.5" />
      )}
      Retry provisioning
    </Button>
  );
}

function MarkResultButtons({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const mark = useServerFn(markProvisioningResult);
  const success = useMutation({
    mutationFn: () => mark({ data: { id: shopId, result: "live" } }),
    onSuccess: () => {
      toast.success("Marked live");
      qc.invalidateQueries({ queryKey: ["shop", shopId] });
      qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fail = useMutation({
    mutationFn: () =>
      mark({ data: { id: shopId, result: "failed", error: "Manually marked failed by admin" } }),
    onSuccess: () => {
      toast.success("Marked failed");
      qc.invalidateQueries({ queryKey: ["shop", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => success.mutate()} disabled={success.isPending}>
        <CheckCircle2 className="mr-1.5 size-3.5 text-status-success" />
        Mark live
      </Button>
      <Button size="sm" variant="outline" onClick={() => fail.mutate()} disabled={fail.isPending}>
        <XCircle className="mr-1.5 size-3.5 text-status-danger" />
        Mark failed
      </Button>
    </div>
  );
}

function SuspendButton({ shopId, name }: { shopId: string; name: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const suspend = useServerFn(suspendShop);
  const mut = useMutation({
    mutationFn: () => suspend({ data: { id: shopId, reason: "Manual suspension by admin" } }),
    onSuccess: () => {
      toast.success("Shop suspended");
      qc.invalidateQueries({ queryKey: ["shop", shopId] });
      qc.invalidateQueries({ queryKey: ["shops"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pause className="mr-2 size-3.5" />
          Suspend
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suspend {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately deactivate all Odoo user accounts for this shop. Data is preserved
            and the shop can be reactivated at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Suspend shop</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReactivateButton({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const reactivate = useServerFn(reactivateShop);
  const mut = useMutation({
    mutationFn: () => reactivate({ data: { id: shopId } }),
    onSuccess: () => {
      toast.success("Shop reactivated");
      qc.invalidateQueries({ queryKey: ["shop", shopId] });
      qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => mut.mutate()} disabled={mut.isPending}>
      <Play className="mr-2 size-3.5" />
      Reactivate
    </Button>
  );
}

function DeleteButton({ shopId, name }: { shopId: string; name: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const del = useServerFn(deleteShop);
  const mut = useMutation({
    mutationFn: () => del({ data: { id: shopId, confirmName: confirm } }),
    onSuccess: () => {
      toast.success("Shop deleted");
      qc.invalidateQueries({ queryKey: ["shops"] });
      navigate({ to: "/shops" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete this shop?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block">
              This action is <b>irreversible</b>. The shop's Odoo database and all data will be
              permanently destroyed.
            </span>
            <span className="mt-3 block">
              Type the shop name <b className="font-mono">{name}</b> to confirm:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={name}
          className="font-mono"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirm !== name || mut.isPending}
            onClick={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
