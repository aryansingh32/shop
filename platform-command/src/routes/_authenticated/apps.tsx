import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listApps, createApp, updateApp, deleteApp } from "@/lib/apps.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/apps")({
  head: () => ({
    meta: [
      { title: "Apps — Kshetra Ops" },
      { name: "description", content: "Manage the catalog of business apps and their Odoo module mappings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppsPage,
});

function AppsPage() {
  const fetchApps = useServerFn(listApps);
  const { data: apps } = useSuspenseQuery({ queryKey: ["apps"], queryFn: () => fetchApps() });

  return (
    <>
      <PageHeader
        title="App catalog"
        description={`${apps.length} app${apps.length === 1 ? "" : "s"} available for plan bundles`}
        actions={
          <AppFormDialog>
            <Button size="sm"><Plus className="mr-1.5 size-4" />New app</Button>
          </AppFormDialog>
        }
      />
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {apps.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm font-medium">No apps in the catalog</p>
            <p className="mt-1 text-xs text-muted-foreground">Add apps to include them in subscription plans.</p>
          </div>
        ) : (
          apps.map((a) => <AppCard key={a.id} app={a} />)
        )}
      </div>
    </>
  );
}

function AppCard({ app }: { app: any }) {
  return (
    <Card className={`gap-3 p-5 ${app.is_deprecated ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{app.name}</h3>
            {app.is_deprecated && <StatusBadge tone="warning">Deprecated</StatusBadge>}
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{app.slug}</div>
        </div>
        <AppActions app={app} />
      </div>
      {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Odoo module</div>
        <div className="mt-0.5 font-mono text-xs">{app.odoo_module_name}</div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Included in</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {app.plans.length === 0 ? (
            <span className="text-xs text-muted-foreground">Not in any plan</span>
          ) : (
            app.plans.map((p: any) => (
              <span key={p.id} className="rounded-md border border-border px-1.5 py-0.5 text-[11px]">{p.name}</span>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function AppActions({ app }: { app: any }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteApp);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mut = useMutation({
    mutationFn: () => del({ data: { id: app.id } }),
    onSuccess: () => { toast.success("App deleted"); qc.invalidateQueries({ queryKey: ["apps"] }); qc.invalidateQueries({ queryKey: ["plans"] }); setConfirmDelete(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-1">
      <AppFormDialog app={app}>
        <Button size="icon" variant="ghost" className="size-7"><Pencil className="size-3.5" /></Button>
      </AppFormDialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {app.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the app from the catalog and from any plans that included it. Existing shops will keep the Odoo module installed until you change their plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mut.isPending}
              onClick={(e) => { e.preventDefault(); mut.mutate(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AppFormDialog({ children, app }: { children: React.ReactNode; app?: any }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    slug: app?.slug ?? "",
    name: app?.name ?? "",
    description: app?.description ?? "",
    icon: app?.icon ?? "",
    odoo_module_name: app?.odoo_module_name ?? "",
    is_deprecated: app?.is_deprecated ?? false,
  });
  const qc = useQueryClient();
  const create = useServerFn(createApp);
  const update = useServerFn(updateApp);
  const mut = useMutation({
    mutationFn: async () => {
      if (app) return update({ data: { id: app.id, patch: form as never } });
      return create({ data: form as never });
    },
    onSuccess: () => {
      toast.success(app ? "App updated" : "App created");
      qc.invalidateQueries({ queryKey: ["apps"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{app ? "Edit app" : "New app"}</DialogTitle>
          <DialogDescription>
            Map a display name to the real Odoo module. The Odoo module name is used when installing/uninstalling on shop databases.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Slug *</Label>
              <Input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Odoo module name *</Label>
            <Input required value={form.odoo_module_name} onChange={(e) => setForm({ ...form, odoo_module_name: e.target.value })} className="font-mono" placeholder="point_of_sale" />
            <p className="text-[11px] text-muted-foreground">The technical Odoo module identifier (e.g. point_of_sale, stock, account).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Icon (Lucide name)</Label>
            <Input value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="ShoppingCart" />
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <Switch checked={form.is_deprecated} onCheckedChange={(v) => setForm({ ...form, is_deprecated: v })} />
            <div>
              <div className="text-sm font-medium">Deprecated</div>
              <div className="text-xs text-muted-foreground">Hide from new plans while keeping existing installations.</div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {app ? "Save changes" : "Create app"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
