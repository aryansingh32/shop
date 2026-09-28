import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, UserCircle, Phone, IndianRupee, Gift, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BRAND_NAME } from "@/lib/config";
import { createCustomerFn, listCustomersFn } from "@/lib/customers.functions";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: `Customers — ${BRAND_NAME}` }] }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["customers", ""],
      queryFn: () => listCustomersFn({ data: { search: "" } }),
    }),
  component: CustomersPage,
});

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function fmtDate(value: string | null) {
  if (!value) return "No sale yet";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
}

function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const fetchCustomers = useServerFn(listCustomersFn);
  const { data: customers } = useSuspenseQuery({
    queryKey: ["customers", search],
    queryFn: () => fetchCustomers({ data: { search } }),
  });

  return (
    <div style={{ maxWidth: "980px" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1>Customers</h1>
          <p>Credit, rewards, and purchase history in one place</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={17} />
          Add customer
        </button>
      </div>

      <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-foreground-muted)" }} />
          <input
            className="field"
            style={{ paddingLeft: "2.75rem" }}
            placeholder="Search by name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {customers.length === 0 ? (
        <EmptyCustomers onAdd={() => setShowAdd(true)} />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {customers.map((customer) => (
            <div key={customer.id} className="card" style={{ padding: "1rem", display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) repeat(4, minmax(120px, 1fr))", gap: "1rem", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <div className="avatar" style={{ width: 42, height: 42 }}>{customer.name.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", color: "var(--color-foreground-muted)" }}>
                    <Phone size={13} />
                    {customer.mobile || customer.phone || "No phone"}
                  </div>
                </div>
              </div>
              <Metric label="Lifetime" value={fmtCurrency(customer.lifetimeSpend)} icon={<IndianRupee size={15} />} />
              <Metric label="Credit" value={fmtCurrency(customer.credit)} tone={customer.credit > 0 ? "warning" : "normal"} />
              <Metric label="Rewards" value={`${customer.loyaltyPoints} pts`} icon={<Gift size={15} />} />
              <Metric label="Last visit" value={fmtDate(customer.lastVisit)} icon={<CalendarDays size={15} />} />
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddCustomerPanel onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function Metric({ label, value, icon, tone = "normal" }: { label: string; value: string; icon?: React.ReactNode; tone?: "normal" | "warning" }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-foreground-subtle)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 700, color: tone === "warning" ? "var(--color-warning)" : "var(--color-foreground)" }}>
        {icon}
        {value}
      </div>
    </div>
  );
}

function EmptyCustomers({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card" style={{ padding: "2.5rem", textAlign: "center" }}>
      <UserCircle size={42} style={{ color: "var(--color-foreground-muted)", margin: "0 auto 1rem" }} />
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.5rem" }}>Add your first customer</h2>
      <p style={{ color: "var(--color-foreground-muted)", maxWidth: 420, margin: "0 auto 1.25rem" }}>
        Customers help you track credit, rewards, and purchase history from one screen.
      </p>
      <button className="btn-primary" onClick={onAdd}>
        <Plus size={17} />
        Add customer
      </button>
    </div>
  );
}

function AddCustomerPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createCustomer = useServerFn(createCustomerFn);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "" });
  const mut = useMutation({
    mutationFn: () => createCustomer({ data: form }),
    onSuccess: () => {
      toast.success("Customer added");
      qc.invalidateQueries({ queryKey: ["customers"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end", background: "oklch(0 0 0 / 35%)" }} onClick={onClose}>
      <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} style={{ width: "min(420px, 100%)", height: "100%", borderRadius: 0, padding: "1.5rem", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 800, marginBottom: "1.25rem" }}>Add customer</h2>
        <label className="label" htmlFor="customer-name">Name</label>
        <input id="customer-name" className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="label" htmlFor="customer-phone" style={{ marginTop: "1rem" }}>Phone</label>
        <input id="customer-phone" className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <label className="label" htmlFor="customer-email" style={{ marginTop: "1rem" }}>Email</label>
        <input id="customer-email" type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label className="label" htmlFor="customer-city" style={{ marginTop: "1rem" }}>City</label>
        <input id="customer-city" className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 size={16} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
