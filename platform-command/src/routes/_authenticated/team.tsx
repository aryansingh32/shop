import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTeam, inviteTeamMember, updateTeamMember, revokeTeamMember } from "@/lib/team.functions";
import { getCurrentAdmin } from "@/lib/admin.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & access — Kshetra Ops" },
      { name: "description", content: "Manage internal team members and their roles." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamPage,
});

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  billing_admin: "Billing Admin",
  support: "Support",
};

function TeamPage() {
  const fetchTeam = useServerFn(listTeam);
  const fetchMe = useServerFn(getCurrentAdmin);
  const { data: team } = useSuspenseQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });
  const { data: me } = useSuspenseQuery({ queryKey: ["current-admin"], queryFn: () => fetchMe() });
  const isSuper = me?.role === "super_admin";

  return (
    <>
      <PageHeader
        title="Team & access"
        description="Only Super Admins can invite or modify team members."
        actions={
          isSuper && (
            <InviteDialog>
              <Button size="sm"><Plus className="mr-1.5 size-4" />Invite member</Button>
            </InviteDialog>
          )
        }
      />
      <div className="p-6">
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="font-mono text-xs">{m.email}</TableCell>
                  <TableCell>
                    {isSuper && m.user_id !== me?.id ? (
                      <RoleSelector member={m} />
                    ) : (
                      <span className="text-sm">{roleLabels[m.role]}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={m.status === "active" ? "success" : m.status === "invited" ? "info" : "warning"}>
                      {m.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.last_login_at ? formatDistanceToNow(new Date(m.last_login_at), { addSuffix: true }) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isSuper && m.user_id !== me?.id && <RevokeButton member={m} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function RoleSelector({ member }: { member: any }) {
  const qc = useQueryClient();
  const update = useServerFn(updateTeamMember);
  const mut = useMutation({
    mutationFn: (role: "super_admin" | "billing_admin" | "support") =>
      update({ data: { id: member.id, patch: { role } } }),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Select value={member.role} onValueChange={(v) => mut.mutate(v as never)}>
      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="super_admin">Super Admin</SelectItem>
        <SelectItem value="billing_admin">Billing Admin</SelectItem>
        <SelectItem value="support">Support</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InviteDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "support" as "super_admin" | "billing_admin" | "support" });
  const qc = useQueryClient();
  const invite = useServerFn(inviteTeamMember);
  const mut = useMutation({
    mutationFn: () => invite({ data: form as never }),
    onSuccess: () => {
      toast.success(`${form.email} invited. Have them sign up with this email to activate.`);
      qc.invalidateQueries({ queryKey: ["team"] });
      setOpen(false);
      setForm({ name: "", email: "", role: "support" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>
            The invitee signs up with this email address to activate their account. Their role and access take effect on sign-up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Support — view-only across all shops</SelectItem>
                <SelectItem value="billing_admin">Billing Admin — can edit shops and billing</SelectItem>
                <SelectItem value="super_admin">Super Admin — full access, all destructive actions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ member }: { member: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoke = useServerFn(revokeTeamMember);
  const mut = useMutation({
    mutationFn: () => revoke({ data: { id: member.id } }),
    onSuccess: () => { toast.success("Access revoked"); qc.invalidateQueries({ queryKey: ["team"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke access for {member.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will immediately lose access to the admin panel. Their audit history is preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); mut.mutate(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
