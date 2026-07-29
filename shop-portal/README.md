# shop-portal

Customer-facing shop dashboard for the Kirana SaaS platform.

Shop owners and employees access their daily tools (Billing Counter, Stock, Orders, etc.)
through this portal, not directly through Odoo.

## Architecture

```
Browser (shopname.kirana.dev)
    │
    ▼
shop-portal (TanStack Start / Node.js)
    ├── Reads shop config from Supabase (same project as platform-command)
    ├── Authenticates users via Odoo /web/session/authenticate
    ├── Sets signed httpOnly kiranaSession cookie (no Redis needed)
    ├── Serves branded dashboard UI (React)
    └── /odoo/* proxied → Odoo backend (dev: Vite proxy; prod: Nginx)
              └── kirana_rebrand Odoo module strips all Odoo branding
```

## Key design decisions

- **No Odoo branding ever visible** — the `kirana_rebrand` Odoo module (in `custom_addons/`) handles this
- **Session = signed cookie** — no Redis, no external session store
- **App names from Supabase** — not hardcoded; editing the `apps` table in Supabase updates the dashboard
- **Brand name from env var** — rename from Kirana to anything by changing `BRAND_NAME` in `.env`
- **iframe embedding** — Odoo apps load in a full-page iframe at `/odoo/*` (same origin via proxy)

## Local development

### Prerequisites
- Docker + Odoo running (`docker compose up` from repo root)
- Node.js 20+

### Setup

```bash
# From repo root
cd shop-portal

# Copy env file and fill in values
cp .env.example .env

# Install dependencies
npm install

# Start dev server (port 3001)
npm run dev
```

### Subdomain routing (local)

Vite runs on `localhost:3001`. To test subdomain routing locally, you need to add entries
to `/etc/hosts`:

```
127.0.0.1   shopname.localhost
```

Then visit `http://shopname.localhost:3001/`.

Alternatively, navigate to `http://localhost:3001/` — the app will show a "Shop not found"
page since there's no subdomain. This is expected.

## Environment variables

| Variable | Description |
|----------|-------------|
| `BRAND_NAME` | Product brand name displayed in UI (default: `Kirana`) |
| `BASE_DOMAIN` | Base domain for subdomains (default: `kirana.dev`) |
| `SESSION_SECRET` | HMAC key for signing session cookies — must be random in prod |
| `SUPABASE_URL` | Same Supabase project as `platform-command` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — server-side only) |
| `ODOO_URL` | Internal Odoo URL (e.g. `http://localhost:8069`) |
| `ODOO_ADMIN_LOGIN` | Platform admin login for ORM operations |
| `ODOO_ADMIN_PASSWORD` | Platform admin password |

## Production deployment

In production, Nginx handles:
1. Wildcard subdomain routing (`*.kirana.dev`)
2. `/odoo/*` proxy to Odoo backend
3. HTTPS termination
4. `dbfilter` configuration per subdomain (or Odoo session handles it)

See `project_context.md` in the repo root for the full infrastructure architecture.

## Odoo debranding module

The `custom_addons/kirana_rebrand` module is automatically installed on every
provisioned shop via `platform-command/src/lib/odoo/provisioning.ts`.

It removes all Odoo visual identity from the web client so users only see the
Kirana brand. The brand name it uses is stored in `ir.config_parameter` (key: `kirana.brand_name`)
so it's configurable without code changes.
