/**
 * Employee management — owner only.
 * Create, edit, deactivate shop employees. Each employee is a real Odoo res.user.
 * App access is controlled by Odoo res.groups assignments.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Pencil, UserX, UserCheck, Loader2, Users, X, Check,
} from "lucide-react";
import {
  getEmployeesFn,
  createEmployeeFn,
  updateEmployeeFn,
  deactivateEmployeeFn,
  reactivateEmployeeFn,
} from "@/lib/employees.functions";
import { getDashboardDataFn } from "@/lib/shop.functions";
import { getSessionFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import { toast } from "sonner";

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: `Team — ${BRAND_NAME}` }] }),
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: "/login" });
    if (!session.isOwner) throw redirect({ to: "/dashboard" });
    return { session };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["employees"], queryFn: () => getEmployeesFn() }),
  component: EmployeesPage,
});

// ── Page ───────────────────────────────────────────────────────────────────

type Employee = {
  id: number;
  name: string;
  login: string;
  email: string;
  active: boolean;
  groups_id: number[];
};

function EmployeesPage() {
  const { session } = Route.useRouteContext();
  const fetchEmployees = useServerFn(getEmployeesFn);
  const { data: employees } = useSuspenseQuery({
    queryKey: ["employees"],
    queryFn: () => fetchEmployees(),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const active = employees.filter((e) => e.active);
  const inactive = employees.filter((e) => !e.active);

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
            Team
          </h1>
          <p style={{ marginTop: "0.375rem", fontSize: "0.9375rem", color: "var(--color-foreground-muted)" }}>
            {active.length} active staff member{active.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditingEmployee(null); setShowForm(true); }}>
          <Plus size={17} />
          Add team member
        </button>
      </div>

      {/* Active employees */}
      {active.length === 0 && inactive.length === 0 ? (
        <EmptyTeam onAdd={() => setShowForm(true)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {active.map((emp) => (
            <EmployeeRow
              key={emp.id}
              emp={emp}
              allowedAppSlugs={session.allowedAppSlugs}
              onEdit={() => { setEditingEmployee(emp); setShowForm(true); }}
            />
          ))}

          {inactive.length > 0 && (
            <>
              <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-foreground-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Inactive
              </div>
              {inactive.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  emp={emp}
                  allowedAppSlugs={session.allowedAppSlugs}
                  onEdit={() => { setEditingEmployee(emp); setShowForm(true); }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <EmployeeForm
          employee={editingEmployee}
          allowedAppSlugs={session.allowedAppSlugs}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Employee row ───────────────────────────────────────────────────────────

function EmployeeRow({
  emp,
  allowedAppSlugs,
  onEdit,
}: {
  emp: Employee;
  allowedAppSlugs: string[];
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const deactivate = useServerFn(deactivateEmployeeFn);
  const reactivate = useServerFn(reactivateEmployeeFn);

  const mut = useMutation({
    mutationFn: () =>
      emp.active
        ? deactivate({ data: { userId: emp.id } })
        : reactivate({ data: { userId: emp.id } }),
    onSuccess: () => {
      toast.success(emp.active ? "Team member deactivated" : "Team member reactivated");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="card"
      style={{
        padding: "1rem 1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        opacity: emp.active ? 1 : 0.65,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "9999px",
          background: "var(--color-primary-soft)",
          color: "var(--color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "0.9375rem",
          flexShrink: 0,
        }}
      >
        {emp.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-foreground)" }}>
          {emp.name}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)", marginTop: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {emp.login}
        </div>
      </div>

      {/* Status */}
      {!emp.active && (
        <span className="badge badge-neutral">Inactive</span>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title="Edit"
          style={{
            background: "none",
            border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            color: "var(--color-foreground-muted)",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "border-color 0.12s, color 0.12s",
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          title={emp.active ? "Deactivate" : "Reactivate"}
          style={{
            background: "none",
            border: `1.5px solid ${emp.active ? "oklch(0.85 0.1 27)" : "oklch(0.82 0.1 155)"}`,
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            color: emp.active ? "var(--color-destructive)" : "var(--color-success)",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {mut.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : emp.active ? (
            <UserX size={15} />
          ) : (
            <UserCheck size={15} />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Employee form (create / edit) ──────────────────────────────────────────

function EmployeeForm({
  employee,
  allowedAppSlugs,
  onClose,
}: {
  employee: Employee | null;
  allowedAppSlugs: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchDashboard = useServerFn(getDashboardDataFn);
  const { data: dashData } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });
  const planApps = dashData.apps;

  const createFn = useServerFn(createEmployeeFn);
  const updateFn = useServerFn(updateEmployeeFn);

  const [name, setName] = useState(employee?.name ?? "");
  const [login, setLogin] = useState(employee?.login ?? "");
  const [password, setPassword] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    // For edit: start with all allowed app slugs as a proxy (true state requires Odoo group lookup)
    employee ? allowedAppSlugs : []
  );

  const isEdit = !!employee;

  const mut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return updateFn({
          data: {
            userId: employee!.id,
            name: name || undefined,
            password: password || undefined,
            appSlugs: selectedSlugs,
          },
        });
      } else {
        return createFn({
          data: { name, login, password, appSlugs: selectedSlugs },
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Team member updated" : "Team member added");
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 35%)", zIndex: 40 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "var(--color-surface)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px oklch(0 0 0 / 12%)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--color-foreground)" }}>
            {isEdit ? "Edit team member" : "Add team member"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-foreground-muted)", padding: "0.25rem", display: "flex" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <div>
            <label className="label" htmlFor="emp-name">Full name *</label>
            <input id="emp-name" required className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Kumar" />
          </div>

          {!isEdit && (
            <div>
              <label className="label" htmlFor="emp-login">Email / username *</label>
              <input id="emp-login" required className="field" type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="rahul@yourshop.com" />
              <p style={{ fontSize: "0.8rem", color: "var(--color-foreground-subtle)", marginTop: "0.375rem" }}>
                This is what they'll type to log in.
              </p>
            </div>
          )}

          <div>
            <label className="label" htmlFor="emp-password">
              {isEdit ? "New password (leave blank to keep current)" : "Password *"}
            </label>
            <input
              id="emp-password"
              className="field"
              type="password"
              required={!isEdit}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••• (optional)" : "•••••••••"}
            />
          </div>

          {/* App access checkboxes */}
          <div>
            <label className="label">App access</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
              {planApps.map((app) => {
                const checked = selectedSlugs.includes(app.slug);
                return (
                  <label
                    key={app.id}
                    htmlFor={`app-${app.slug}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: checked ? "var(--color-primary-soft)" : "var(--color-input)",
                      border: `1.5px solid ${checked ? "var(--color-primary)" : "var(--color-border)"}`,
                      borderRadius: "var(--radius-lg)",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    <input
                      id={`app-${app.slug}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSlug(app.slug)}
                      style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)", flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 500, fontSize: "0.9375rem", color: "var(--color-foreground)" }}>
                      {app.name}
                    </span>
                    {checked && <Check size={15} style={{ color: "var(--color-primary)", marginLeft: "auto" }} />}
                  </label>
                );
              })}
              {planApps.length === 0 && (
                <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
                  No apps configured in your plan.
                </p>
              )}
            </div>
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)" }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={mut.isPending} style={{ flex: 2 }}>
              {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {isEdit ? "Save changes" : "Add member"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyTeam({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        border: "2px dashed var(--color-border-strong)",
        borderRadius: "var(--radius-2xl)",
        padding: "4rem 2rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.875rem",
      }}
    >
      <Users size={40} style={{ color: "var(--color-foreground-subtle)" }} />
      <div>
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-foreground)" }}>No team members yet</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", marginTop: "0.375rem" }}>
          Add your first staff member to give them access to the shop apps.
        </p>
      </div>
      <button className="btn-primary" onClick={onAdd} style={{ marginTop: "0.5rem" }}>
        <Plus size={17} />
        Add first team member
      </button>
    </div>
  );
}
