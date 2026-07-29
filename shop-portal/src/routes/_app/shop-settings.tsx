/**
 * Shop Settings — owner only.
 * Edit company name, contact details, GSTIN.
 * Writes directly to Odoo res.company.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Loader2, Building2, Save } from "lucide-react";
import { getShopProfileFn, updateShopProfileFn } from "@/lib/shop.functions";
import { BRAND_NAME } from "@/lib/config";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/shop-settings")({
  head: () => ({ meta: [{ title: `Shop settings — ${BRAND_NAME}` }] }),
  beforeLoad: async ({ context }) => {
    const { session } = context;
    if (!session?.isOwner) throw redirect({ to: "/dashboard" });
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["shop-profile"], queryFn: () => getShopProfileFn() }),
  component: ShopSettingsPage,
});

function ShopSettingsPage() {
  const fetchProfile = useServerFn(getShopProfileFn);
  const doUpdate = useServerFn(updateShopProfileFn);
  const qc = useQueryClient();

  const { data } = useSuspenseQuery({ queryKey: ["shop-profile"], queryFn: () => fetchProfile() });
  const { company } = data;

  const [name, setName] = useState(company?.name ?? "");
  const [street, setStreet] = useState(typeof company?.street === "string" ? company.street : "");
  const [city, setCity] = useState(typeof company?.city === "string" ? company.city : "");
  const [phone, setPhone] = useState(typeof company?.phone === "string" ? company.phone : "");
  const [email, setEmail] = useState(typeof company?.email === "string" ? company.email : "");
  const [vat, setVat] = useState(typeof company?.vat === "string" ? company.vat : "");

  const mut = useMutation({
    mutationFn: () =>
      doUpdate({
        data: {
          companyId: company!.id,
          name: name || undefined,
          street: street || undefined,
          city: city || undefined,
          phone: phone || undefined,
          email: email || undefined,
          vat: vat || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Shop settings saved");
      qc.invalidateQueries({ queryKey: ["shop-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!company) {
    return (
      <div style={{ color: "var(--color-foreground-muted)", padding: "2rem" }}>
        Shop profile not available. Ensure the shop is fully provisioned.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem" }}>
        <Building2 size={22} style={{ color: "var(--color-primary)" }} />
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
          Shop settings
        </h1>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
      >
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-foreground-subtle)" }}>
            Business details
          </h2>

          <div>
            <label className="label" htmlFor="shop-name">Business name</label>
            <input id="shop-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label className="label" htmlFor="shop-vat">GSTIN</label>
            <input id="shop-vat" className="field" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="22AAAAA0000A1Z5" maxLength={20} style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--color-foreground-subtle)", marginTop: "0.375rem" }}>
              Appears on invoices and receipts.
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-foreground-subtle)" }}>
            Contact & address
          </h2>

          <div>
            <label className="label" htmlFor="shop-street">Street address</label>
            <input id="shop-street" className="field" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123, MG Road" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
            <div>
              <label className="label" htmlFor="shop-city">City</label>
              <input id="shop-city" className="field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
            </div>
            <div>
              <label className="label" htmlFor="shop-phone">Phone</label>
              <input id="shop-phone" className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="shop-email">Business email</label>
            <input id="shop-email" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="shop@yourbusiness.com" />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn-primary" disabled={mut.isPending}>
            {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
