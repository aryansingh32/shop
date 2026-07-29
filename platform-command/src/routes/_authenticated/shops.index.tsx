import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listShops, createShop, retryProvisioning } from "@/lib/shops.functions";
import { listPlans } from "@/lib/plans.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { StatusBadge, subscriptionStatusTone, provisioningStatusTone } from "@/components/status-badge";
import { Plus, Search, Store, Loader2, ArrowUpDown, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/shops/")({
  head: () => ({
    meta: [
      { title: "Shops — Kshetra Ops" },
      { name: "description", content: "Manage every shop on the platform: plans, provisioning, subscriptions." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShopsPage,
});

type SortKey = "created_at" | "business_name" | "last_active_at";

function ShopsPage() {
  const fetchShops = useServerFn(listShops);
  const fetchPlans = useServerFn(listPlans);
  const navigate = useNavigate({ from: Route.fullPath });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [bizType, setBizType] = useState("all");
  const [planId, setPlanId] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: shops } = useSuspenseQuery({
    queryKey: ["shops", { search, status, bizType, planId }],
    queryFn: () => fetchShops({ data: { search, status, businessType: bizType, planId } }),
  });
  const { data: plans } = useSuspenseQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
  });

  const sorted = [...shops].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <>
      <PageHeader
        title="Shops"
        description={`${shops.length} shop${shops.length === 1 ? "" : "s"} across the platform`}
        actions={
          <CreateShopDialog plans={plans}>
            <Button size="sm">
              <Plus className="mr-1.5 size-4" />
              Add shop
            </Button>
          </CreateShopDialog>
        }
      />

      <div className="p-6 space-y-4">
        <Card className="gap-0 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Business name, phone, email, GSTIN…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="past_due">Past due</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Business type</Label>
              <Select value={bizType} onValueChange={setBizType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="mobile_shop">Mobile shop</SelectItem>
                  <SelectItem value="clothing_shop">Clothing shop</SelectItem>
                  <SelectItem value="mall">Mall</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plans</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-0 overflow-hidden">
          {shops.length === 0 ? (
            <EmptyState onCreate={() => document.getElementById("create-shop-trigger")?.click()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>
                    <SortHeader label="Shop" active={sortKey === "business_name"} dir={sortDir} onClick={() => toggleSort("business_name")} />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Provisioning</TableHead>
                  <TableHead>
                    <SortHeader label="Created" active={sortKey === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")} />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate({ to: `/shops/${s.id}` as any })}
                  >
                    <TableCell className="max-w-[280px]">
                      <div className="font-medium flex items-center gap-1.5">
                        <span>{s.business_name}</span>
                        {s.subdomain && (
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {s.subdomain}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{s.owner_name}</span>
                        {s.city && <span>· {s.city}</span>}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="block text-sm capitalize">{s.business_type.replace("_", " ")}</span>
                    </TableCell>
                    <TableCell>
                      {s.plan ? (
                        <div className="text-sm">
                          <div className="font-medium">{s.plan.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{formatINR(s.plan.monthly_price_inr)}/mo</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No plan</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={subscriptionStatusTone(s.subscription_status)}>
                        {s.subscription_status.replace("_", " ")}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {s.provisioning_status === "provisioning" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-status-info/10 border border-status-info/20 px-2 py-0.5 text-xs text-status-info">
                          <Loader2 className="size-3 animate-spin" />
                          provisioning
                        </span>
                      ) : (
                        <StatusBadge tone={provisioningStatusTone(s.provisioning_status)}>
                          {s.provisioning_status}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="block text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {s.provisioning_status === "failed" && (
                          <RetryTableButton id={s.id} />
                        )}
                        {s.provisioning_status === "live" && s.odoo_db_name && (
                          <a
                            href={`${typeof window !== "undefined" ? (import.meta.env.VITE_ODOO_URL ?? "http://localhost:8069") : "http://localhost:8069"}/web?db=${s.odoo_db_name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                          >
                            Odoo <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

function RetryTableButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const retry = useServerFn(retryProvisioning);
  const mut = useMutation({
    mutationFn: () => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Provisioning retry started");
      qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-status-danger/30 text-status-danger hover:bg-status-danger/10" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}
      Retry
    </Button>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
      {label}
      <ArrowUpDown className={`size-3 ${active ? "text-foreground" : "opacity-40"}`} />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted">
        <Store className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">No shops match your filters</h3>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Clear the filters or add the first shop to get started.
      </p>
    </div>
  );
}

function CreateShopDialog({ plans, children }: { plans: { id: string; name: string; monthly_price_inr: number }[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    subdomain: "",
    owner_name: "",
    phone: "",
    email: "",
    business_type: "mobile_shop" as "mobile_shop" | "clothing_shop" | "mall" | "other",
    city: "",
    state: "",
    gstin: "",
    plan_id: plans[0]?.id ?? "",
    admin_password: "admin",
  });
  const qc = useQueryClient();
  const create = useServerFn(createShop);
  const mut = useMutation({
    mutationFn: (input: typeof form) => create({ data: input as never }),
    onSuccess: () => {
      toast.success("Shop created — provisioning queued");
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      qc.invalidateQueries({ queryKey: ["dashboard-activity"] });
      setOpen(false);
      setSubdomainTouched(false);
      setForm({ ...form, business_name: "", subdomain: "", owner_name: "", phone: "", email: "", city: "", state: "", gstin: "", admin_password: "admin" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleNameChange = (val: string) => {
    const slug = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    setForm((prev) => ({
      ...prev,
      business_name: val,
      subdomain: subdomainTouched ? prev.subdomain : slug,
    }));
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild id="create-shop-trigger">{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a new shop</DialogTitle>
          <DialogDescription>
            Creating a shop queues Odoo provisioning. Trial starts once provisioning succeeds.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(form); }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="bn">Business name *</Label>
            <Input id="bn" required value={form.business_name} onChange={(e) => handleNameChange(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="subdomain">Subdomain / Domain Prefix *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="subdomain"
                required
                placeholder="mobile-world"
                value={form.subdomain}
                onChange={(e) => {
                  setSubdomainTouched(true);
                  setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "") });
                }}
              />
              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">.localhost:3001</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Unique subdomain assigned to this shop portal. If duplicate, system automatically appends -1, -2, etc.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="on">Owner name *</Label>
            <Input id="on" required value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt">Business type</Label>
            <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v as typeof form.business_type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_shop">Mobile shop</SelectItem>
                <SelectItem value="clothing_shop">Clothing shop</SelectItem>
                <SelectItem value="mall">Mall</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph">Phone</Label>
            <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input id="gstin" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan">Plan</Label>
            <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {formatINR(p.monthly_price_inr)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwd">Odoo Admin Password *</Label>
            <Input id="pwd" required type="text" placeholder="admin" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create shop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
