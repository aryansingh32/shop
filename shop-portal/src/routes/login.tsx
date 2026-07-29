import { createFileRoute, redirect, useRouter, isRedirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loginFn, getSessionFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import { Eye, EyeOff, Loader2, Store } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: `Sign in — ${BRAND_NAME}` }],
  }),
  beforeLoad: async () => {
    // If already logged in, go straight to dashboard
    const session = await getSessionFn();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const doLogin = useServerFn(loginFn);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const submittedLogin = (formData.get("login") as string) || login;
    const submittedPassword = (formData.get("password") as string) || password;

    console.log("[login] Submitting for:", submittedLogin);

    try {
      const result = await doLogin({ data: { login: submittedLogin, password: submittedPassword } });
      console.log("[login] loginFn returned ok:", result?.ok);

      if (result?.token) {
        // Apply the portal session cookie client-side.
        // TanStack Start beta drops Set-Cookie headers for 2xx responses (confirmed bug).
        // The server returns the HMAC-signed token in the body; we apply it here.
        const expires = new Date(result.expiresAt).toUTCString();
        document.cookie = `${result.cookieName}=${result.token}; Path=/; SameSite=Lax; Expires=${expires}`;

        // CRITICAL: Also apply the Odoo session_id cookie.
        // The iframe that loads Odoo apps (POS, Inventory, etc.) makes requests to
        // /web/assets, /mail/data, etc. — Odoo requires its own session_id cookie
        // to authenticate these requests. Without it, all Odoo API calls fail with 404/403.
        if (result.odooSessionId) {
          document.cookie = `session_id=${result.odooSessionId}; Path=/; SameSite=Lax; Expires=${expires}`;
          console.log("[login] Odoo session_id cookie applied client-side.");
        }

        console.log("[login] Cookies applied. Navigating to /dashboard...");
        window.location.href = "/dashboard";
      } else {
        throw new Error("Login response did not include session token.");
      }
    } catch (err) {
      if (isRedirect(err)) {
        throw err;
      }
      console.error("[login] Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{ background: "var(--color-background)" }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
    >
      {/* Brand header */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div
          style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-foreground)",
            borderRadius: "var(--radius-xl)",
          }}
          className="w-14 h-14 flex items-center justify-center shadow-md"
        >
          <Store size={28} strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <h1
            style={{ color: "var(--color-foreground)", fontWeight: 700, fontSize: "1.875rem", letterSpacing: "-0.02em" }}
          >
            {BRAND_NAME}
          </h1>
          <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.9375rem", marginTop: "0.25rem" }}>
            Sign in to your shop dashboard
          </p>
        </div>
      </div>

      {/* Login card */}
      <div
        className="card w-full max-w-sm"
        style={{ padding: "2rem", boxShadow: "0 4px 24px oklch(0 0 0 / 7%)" }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Email / phone */}
          <div>
            <label className="label" htmlFor="login-field">
              Email or username
            </label>
            <input
              id="login-field"
              name="login"
              type="text"
              className="field"
              placeholder="you@yourshop.com"
              autoComplete="username"
              autoFocus
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div>
            <label className="label" htmlFor="password-field">
              Password
            </label>
            <div className="relative">
              <input
                id="password-field"
                name="password"
                type={showPw ? "text" : "password"}
                className="field"
                style={{ paddingRight: "3rem" }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-foreground-subtle)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem",
                }}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "var(--color-destructive-soft)",
                color: "var(--color-destructive)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary"
            style={{ width: "100%", marginTop: "0.25rem" }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p
        style={{ color: "var(--color-foreground-subtle)", fontSize: "0.8125rem", marginTop: "2.5rem", textAlign: "center" }}
      >
        Need help? Contact your shop administrator.
      </p>
    </div>
  );
}
