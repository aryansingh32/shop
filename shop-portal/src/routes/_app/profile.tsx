/**
 * My Profile — logged-in user's own settings.
 * Change display name and password.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, User, KeyRound, Check } from "lucide-react";
import { changeMyPasswordFn } from "@/lib/employees.functions";
import { getSessionFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: `My profile — ${BRAND_NAME}` }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session } = Route.useRouteContext();

  return (
    <div style={{ maxWidth: "560px" }}>
      <div className="page-header">
        <h1>My profile</h1>
      </div>
      {/* Account info (read-only) */}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <h2>Account details</h2>
            <p>Your personal information</p>
          </div>
        </div>
        <div className="section-card-body">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
            <div className="avatar" style={{ width: "72px", height: "72px", fontSize: "1.75rem" }}>
              {session.userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "1.0625rem", color: "var(--color-foreground)" }}>{session.userName}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", marginTop: "0.125rem" }}>{session.userLogin}</div>
            </div>
          </div>
          <div
            style={{
              background: "var(--color-accent)",
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <User size={14} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-accent-foreground)" }}>
              {session.isOwner ? "Shop owner" : "Staff member"}
            </span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const changePw = useServerFn(changeMyPasswordFn);
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: () => {
      if (newPw !== confirm) throw new Error("Passwords don't match");
      if (newPw.length < 6) throw new Error("Password must be at least 6 characters");
      return changePw({ data: { newPassword: newPw } });
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrent(""); setNewPw(""); setConfirm("");
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="section-card">
      <div className="section-card-header">
        <div>
          <h2>Change password</h2>
          <p>Update your login credentials</p>
        </div>
      </div>
      <div className="section-card-body">
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label className="label" htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" className="field" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="label" htmlFor="confirm-pw">Confirm new password</label>
            <input id="confirm-pw" type="password" className="field" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your new password" />
          </div>
          <button type="submit" className="btn-primary" disabled={mut.isPending || done} style={{ alignSelf: "flex-start" }}>
            {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : null}
            {done ? "Changed!" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
