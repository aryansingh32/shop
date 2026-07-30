import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// Shared cookie-rewrite + security-header-strip logic for all Odoo proxy targets
function odooProxyConfigure(proxy: any) {
  proxy.on("proxyRes", (proxyRes: any) => {
    // Strip Odoo identity headers
    delete proxyRes.headers["x-odoo-uid"];
    // Allow iframe embedding
    delete proxyRes.headers["x-frame-options"];
    // Strip CSP that might block our portal from embedding the iframe
    delete proxyRes.headers["content-security-policy"];
    delete proxyRes.headers["content-security-policy-report-only"];

    // Rewrite Set-Cookie so Odoo cookies (session_id) are scoped to our origin
    const setCookie = proxyRes.headers["set-cookie"];
    if (setCookie) {
      proxyRes.headers["set-cookie"] = (
        Array.isArray(setCookie) ? setCookie : [setCookie]
      ).map((c: string) =>
        c
          .replace(/;\s*domain=[^;]+/gi, "")
          .replace(/;\s*samesite=strict/gi, "; SameSite=Lax")
      );
    }
  });
}

const ODOO_TARGET = "http://127.0.0.1:8069";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({ target: "node" }),
    react(),
    tailwindcss(),
  ],

  server: {
    port: 3001,
    // IMPORTANT: Use 127.0.0.1 (not localhost) — Node.js 17+ resolves "localhost"
    // as IPv6 ::1 first, but the Odoo Docker container only listens on IPv4 0.0.0.0.
    // Using the literal IPv4 address avoids 502 ETIMEDOUT errors in the proxy.
    proxy: {
      // ── Odoo app routes (/odoo/inventory, /odoo/point-of-sale, etc.) ──
      "/odoo": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },

      // ── Odoo web client (assets, webclient bootstrap, menus, sessions) ──
      "/web": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },

      // ── Odoo messaging / bus (mail.data, notifications) ────────────────
      "/mail": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },

      // ── Odoo long-polling bus (real-time channel) ──────────────────────
      "/longpolling": {
        target: ODOO_TARGET,
        changeOrigin: true,
        ws: true,
        configure: odooProxyConfigure,
      },

      // ── Odoo module static assets (/point_of_sale/static/..., etc.) ────
      // These are served at /{module_name}/static/{path} in Odoo.
      // Each installed module needs a proxy entry so its icons/fonts load.
      "/point_of_sale": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/stock": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/sale": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/account": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/hr": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/base_setup": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/base": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/bus": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      "/kirana_rebrand": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      // POS UI is served at /pos/ui in Odoo 18
      "/pos": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      // Purchase module static assets
      "/purchase": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
      // Barcodes module static assets
      "/barcodes": {
        target: ODOO_TARGET,
        changeOrigin: true,
        configure: odooProxyConfigure,
      },
    },
  },
});
