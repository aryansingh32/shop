import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPlans, createPlan, updatePlan, archivePlan, deletePlan } from "@/lib/plans.functions";
import { listApps } from "@/lib/apps.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { formatINR } from "@/lib/format";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plans — Kshetra Ops" },
      { name: "description", content: "Manage subscription plans and their app bundles." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlansPage,
});

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price_inr: number;
  billing_cycle: string;
  trial_days: number;
  max_seats: number;
  is_archived: boolean;
  app_ids: string[];
  active_shops: number;
};

function PlansPage() {
  const fetchPlans = useServerFn(listPlans);
  const fetchApps = useServerFn(listApps);
  const { data: plans } = useSuspenseQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const { data: apps } = useSuspenseQuery({ queryKey: ["apps"], queryFn: () => fetchApps() });

  return (
    <>
      <PageHeader
        title="Plans"
        description={`${plans.length} plan${plans.length === 1 ? "" : "s"} · ${plans.filter((p) => !p.is_archived).length} active`}
        actions={
          <PlanFormDialog apps={apps}>
            <Button size="sm"><Plus className="mr-1.5 size-4" />New plan</Button>
          </PlanFormDialog>
        }
      />
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {plans.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm font-medium">No plans yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first plan to start onboarding shops.</p>
          </div>
        ) : (
          plans.map((p) => (
            <PlanCard key={p.id} plan={p} apps={apps} />
          ))
        )}
      </div>
    </>
  );
}

function PlanCard({ plan, apps }: { plan: PlanRow; apps: any[] }) {
  const includedApps = apps.filter((a) => plan.app_ids.includes(a.id));
  return (
    <Card className={`gap-3 p-5 ${plan.is_archived ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{plan.name}</h3>
            {plan.is_archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{plan.slug}</div>
        </div>
        <PlanActions plan={plan} apps={apps} />
      </div>

      {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}

      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">{formatINR(plan.monthly_price_inr)}</span>
        <span className="text-xs text-muted-foreground">/{plan.billing_cycle === "annual" ? "yr" : "mo"}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-border py-3">
        <StatCol label="Trial" value={`${plan.trial_days}d`} />
        <StatCol label="Seats" value={String(plan.max_seats)} />
        <StatCol label="Shops" value={String(plan.active_shops)} />
      </div>

      <div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Included apps</div>
        {includedApps.length === 0 ? (
          <div className="text-xs text-muted-foreground">None</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {includedApps.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                {a.name}
                <span className="font-mono text-[9px] text-muted-foreground">{a.odoo_module_name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatCol({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function PlanActions({ plan, apps }: { plan: PlanRow; apps: any[] }) {
  const qc = useQueryClient();
  const archive = useServerFn(archivePlan);
  const del = useServerFn(deletePlan);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const archiveMut = useMutation({
    mutationFn: () => archive({ data: { id: plan.id, archive: !plan.is_archived } }),
    onSuccess: () => { toast.success(plan.is_archived ? "Plan restored" : "Plan archived"); qc.invalidateQueries({ queryKey: ["plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id: plan.id } }),
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["plans"] }); setConfirmDelete(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-1">
      <PlanFormDialog apps={apps} plan={plan}>
        <Button size="icon" variant="ghost" className="size-7"><Pencil className="size-3.5" /></Button>
      </PlanFormDialog>
      <Button size="icon" variant="ghost" className="size-7" onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>
        {plan.is_archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
      </Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan "{plan.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan.active_shops > 0
                ? `This plan currently has ${plan.active_shops} subscribed shops. You cannot delete it — archive it instead.`
                : "This will permanently remove the plan. Shops previously on it are unaffected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={plan.active_shops > 0 || deleteMut.isPending}
              onClick={(e) => { e.preventDefault(); deleteMut.mutate(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanFormDialog({ children, apps, plan }: { children: React.ReactNode; apps: any[]; plan?: PlanRow }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    slug: plan?.slug ?? "",
    description: plan?.description ?? "",
    monthly_price_inr: plan?.monthly_price_inr ?? 999,
    trial_days: plan?.trial_days ?? 14,
    max_seats: plan?.max_seats ?? 5,
    billing_cycle: (plan?.billing_cycle ?? "monthly") as "monthly" | "annual",
    app_ids: plan?.app_ids ?? [],
  });
  const qc = useQueryClient();
  const create = useServerFn(createPlan);
  const update = useServerFn(updatePlan);

  const mut = useMutation({
    mutationFn: async () => {
      if (plan) return update({ data: { id: plan.id, patch: form as never } });
      return create({ data: form as never });
    },
    onSuccess: () => {
      toast.success(plan ? "Plan updated" : "Plan created");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleApp(id: string) {
    setForm((f) => ({
      ...f,
      app_ids: f.app_ids.includes(id) ? f.app_ids.filter((a) => a !== id) : [...f.app_ids, id],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            Set pricing, limits, and which apps this plan includes. Existing shops are unaffected until re-assigned.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug *</Label>
            <Input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="font-mono" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Monthly price (₹)</Label>
            <Input type="number" min={0} required value={form.monthly_price_inr} onChange={(e) => setForm({ ...form, monthly_price_inr: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Trial (days)</Label>
            <Input type="number" min={0} required value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Max seats</Label>
            <Input type="number" min={1} required value={form.max_seats} onChange={(e) => setForm({ ...form, max_seats: Number(e.target.value) })} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Included apps</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
              {apps.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/50">
                  <Checkbox checked={form.app_ids.includes(a.id)} onCheckedChange={() => toggleApp(a.id)} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{a.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{a.odoo_module_name}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {plan ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
