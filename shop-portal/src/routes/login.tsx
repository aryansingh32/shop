import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loginFn, getSessionFn } from "@/lib/auth.functions";
import { BRAND_NAME } from "@/lib/config";
import { Eye, EyeOff, Loader2, Store, ShieldCheck, Zap, TrendingUp, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: `Sign in — ${BRAND_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
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
    try {
      const result = await doLogin({ data: { login: submittedLogin, password: submittedPassword } });
      if (result?.token) {
        const expires = new Date(result.expiresAt).toUTCString();
        document.cookie = `${result.cookieName}=${result.token}; Path=/; SameSite=Lax; Expires=${expires}`;
        if (result.odooSessionId) {
          document.cookie = `session_id=${result.odooSessionId}; Path=/; SameSite=Lax; Expires=${expires}`;
        }
        window.location.href = "/dashboard";
      } else {
        throw new Error("Login response did not include session token.");
      }
    } catch (err) {
      if (isRedirect(err)) throw err;
      setError(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* ── Left panel — brand statement ──────────────────────── */}
      <div
        className="hidden lg:flex"
        style={{
          width: "45%",
          flexShrink: 0,
          background: "linear-gradient(145deg, var(--login-grad-start) 0%, var(--login-grad-end) 100%)",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: "absolute", top: "-80px", right: "-80px",
          width: "320px", height: "320px", borderRadius: "50%",
          background: "oklch(1 0 0 / 5%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-60px", left: "-60px",
          width: "260px", height: "260px", borderRadius: "50%",
          background: "oklch(1 0 0 / 5%)",
        }} />

        {/* Brand */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            background: "oklch(1 0 0 / 15%)",
            borderRadius: "var(--radius-lg)",
            width: "44px", height: "44px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Store size={22} color="white" strokeWidth={2} />
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.375rem", color: "white", letterSpacing: "-0.01em" }}>
            {BRAND_NAME}
          </span>
        </div>

        {/* Value props */}
        <div style={{ position: "relative" }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800, fontSize: "2.25rem",
            color: "white", lineHeight: 1.15,
            letterSpacing: "-0.02em", marginBottom: "2rem",
          }}>
            Your shop,<br />your way.
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {[
              { icon: <Zap size={18} color="white" />, text: "Start billing in under 2 minutes" },
              { icon: <ShieldCheck size={18} color="white" />, text: "Secure, cloud-backed — access from any device" },
              { icon: <TrendingUp size={18} color="white" />, text: "Real-time sales and inventory in one place" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
                <div style={{
                  background: "oklch(1 0 0 / 15%)", borderRadius: "50%",
                  width: "36px", height: "36px", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {icon}
                </div>
                <p style={{ color: "oklch(1 0 0 / 85%)", fontSize: "0.9375rem", margin: 0, lineHeight: 1.4 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ position: "relative", color: "oklch(1 0 0 / 50%)", fontSize: "0.8125rem", margin: 0 }}>
          Trusted by shops across India
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        background: "var(--color-background)",
      }}>
        {/* Mobile brand (shown only when left panel is hidden) */}
        <div className="flex lg:hidden" style={{ flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "2.5rem" }}>
          <div style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-foreground)",
            borderRadius: "var(--radius-xl)",
            width: "56px", height: "56px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px oklch(0.52 0.17 210 / 30%)",
          }}>
            <Store size={28} strokeWidth={1.75} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.75rem", color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
              {BRAND_NAME}
            </h1>
            <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.9375rem", marginTop: "0.25rem" }}>
              Sign in to your shop dashboard
            </p>
          </div>
        </div>

        {/* Form card */}
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <div className="hidden lg:block" style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.875rem", color: "var(--color-foreground)", letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
              Welcome back
            </h1>
            <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.9375rem" }}>
              Sign in to {BRAND_NAME}
            </p>
          </div>

          <div
            className="card"
            style={{ padding: "2rem", boxShadow: "0 4px 24px oklch(0 0 0 / 6%), 0 1px 3px oklch(0 0 0 / 4%)" }}
          >
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label className="label" htmlFor="login-field">Email or username</label>
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

              <div>
                <label className="label" htmlFor="password-field">Password</label>
                <div style={{ position: "relative" }}>
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
                      position: "absolute", right: "0.75rem", top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-foreground-subtle)",
                      background: "none", border: "none", cursor: "pointer", padding: "0.25rem",
                    }}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "0.625rem",
                    background: "var(--color-destructive-soft)",
                    border: "1px solid oklch(0.88 0.08 27)",
                    color: "var(--color-destructive)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.75rem 1rem",
                    fontSize: "0.875rem", fontWeight: 500,
                  }}
                  role="alert"
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  width: "100%", padding: "0.875rem 1.5rem",
                  background: loading ? "var(--color-primary)" : "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.46 0.19 230) 100%)",
                  color: "var(--color-primary-foreground)",
                  border: "none", borderRadius: "var(--radius-lg)",
                  fontWeight: 600, fontSize: "1rem", cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.75 : 1,
                  transition: "opacity 0.15s, transform 0.1s",
                  minHeight: "48px",
                  boxShadow: loading ? "none" : "0 4px 12px oklch(0.52 0.17 210 / 35%)",
                }}
              >
                {loading ? (
                  <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</>
                ) : "Sign in"}
              </button>
            </form>
          </div>

          <p style={{ color: "var(--color-foreground-subtle)", fontSize: "0.8125rem", marginTop: "1.5rem", textAlign: "center" }}>
            Need help? Contact your shop administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
