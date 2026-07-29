
# Super Admin Control Panel — Build Plan

Lovable Cloud is enabled. Everything below is wired to real Postgres tables with RLS, real server functions, real CRUD. No mock arrays.

## Design system

- Neutral base (near-white bg, near-black text, zinc grays), single accent = emerald `#059669`.
- Coherent status color system: emerald (live/paid), blue (info/provisioning ok), amber (warning/pending/trial ending), red (failed/past due), zinc (neutral/archived).
- Inter for UI, JetBrains Mono for IDs, amounts, technical fields.
- shadcn sidebar (collapsible icon), sticky top bar with ⌘K search + notifications bell + user menu.
- Dense tables (sticky headers, sortable columns, hover rows, inline status badges, row-click → detail).
- Detail pages open as dedicated routes (not modals) with tabs; destructive actions use AlertDialog confirmations.
- All amounts formatted ₹ with `Intl.NumberFormat('en-IN')`.

## Auth & RBAC

- Email/password auth (Lovable Cloud). Sign-in gated: only users present in `admin_team_members` can access `/`. Public routes: `/auth`, `/reset-password`.
- Role enum: `super_admin`, `billing_admin`, `support`. Stored in `admin_team_members.role` (separate from `auth.users`). `has_admin_role(uid, role)` security-definer function.
- Permissions matrix enforced both in RLS policies AND in server functions (destructive/billing actions gated by role checks server-side — not just UI hiding).
- First bootstrap: if no `admin_team_members` rows exist, first signup becomes `super_admin` automatically (one-time only, enforced in trigger).

## Data model (migrations, phase-by-phase)

```text
admin_team_members(id, user_id→auth.users, name, email, role, status, invited_by, last_login_at, created_at)
plans(id, name, slug, monthly_price_inr, billing_cycle, trial_days, max_seats, is_archived, created_at)
apps(id, slug, name, description, icon, odoo_module_name, is_deprecated, created_at)
plan_apps(plan_id, app_id) — many-to-many
shops(id, business_name, owner_name, phone, email, business_type, city, state, gstin, subdomain, plan_id, subscription_status, provisioning_status, provisioning_error, odoo_db_name, trial_ends_at, last_active_at, created_at)
shop_module_state(shop_id, app_id, state[installing|installed|uninstalling|failed], last_synced_at, error)
invoices(id, shop_id, invoice_number, amount_inr, status[paid|pending|failed|refunded], due_date, paid_at, payment_method, created_at)
invoice_events(id, invoice_id, type, note, actor_id, created_at) — for retries, manual mark-paid, refunds
shop_employees_cache(shop_id, odoo_user_id, name, email, role, last_login_at, synced_at) — read-mirror from Odoo
audit_log(id, actor_id, actor_email, shop_id, entity_type, entity_id, action, before, after, ip, created_at)
notifications(id, type, severity, title, body, shop_id, invoice_id, read_by[jsonb array of user ids], created_at)
notification_prefs(user_id, type, enabled)
platform_settings(key, value_json, updated_by, updated_at) — single-row-per-key store for support info, email templates, integration creds (encrypted values stored as secrets, references stored here)
odoo_integration_config(id=1, base_url, auth_method, provisioning_webhook_url, health_check_url, updated_at) — API endpoint refs; API key stored as secret
```

RLS: every table locked; `authenticated` role can SELECT if `has_admin_role(auth.uid(), any)`; INSERT/UPDATE/DELETE gated by specific role via `has_admin_role`. GRANTs added on every table.

## Odoo integration layer

`src/lib/odoo/*.functions.ts` — real `createServerFn` endpoints that call configurable Odoo webhook URLs (from `odoo_integration_config`) with a secret key (`ODOO_API_KEY`). Every call:

- Records a row in `audit_log` and updates `shop_module_state` or `shops.provisioning_status`.
- Returns typed result with success/failed/pending states.
- If the config or secret is not set, the call fails cleanly with a "configure Odoo integration in Settings first" error surfaced in the UI — no fake-optimistic success.

API points: `provisionShop`, `installModule`, `uninstallModule`, `suspendShop`, `deleteShop`, `fetchShopStatus`, `fetchShopEmployees`, `retryProvisioning`.

## Phase 1 — Foundation (this turn)

1. Migrations for `admin_team_members`, `plans`, `apps`, `plan_apps`, `shops`, `audit_log`, roles enum, `has_admin_role` function, bootstrap trigger.
2. Auth pages (`/auth`, `/reset-password`) + `_authenticated` gate wired to `admin_team_members`.
3. App shell: sidebar (Dashboard, Shops, Plans, Apps, Billing, Employees, Audit Log, Team, Notifications, Settings), top bar with ⌘K search stub + notifications bell + user menu.
4. Dashboard: real MRR (sum of active shops × plan price), active shops, new signups this month, churn, plan-mix + business-type breakdown (Recharts), recent activity feed from `audit_log`, alerts panel (trial ending, failed provisioning).
5. Shops: full CRUD table + detail page with tabs (Overview, Plan & Apps, Activity). Actions: create (queues provisioning), edit, suspend/reactivate, delete (with typed-confirmation dialog), retry provisioning.
6. Plans & Apps CRUD + plan↔apps assignment.
7. Odoo integration server-fn scaffolding with configurable endpoint + placeholder network calls (mark shop `provisioning` → poll/simulate transition; when real Odoo endpoint is configured in Settings, the same calls hit it).

## Phase 2 — Billing & shop detail depth

- `invoices`, `invoice_events`, `shop_module_state`.
- Billing ledger page + invoice detail with actions (mark paid, refund, retry, resend).
- Shop detail Billing tab + Plan & Apps tab with real install/uninstall triggering Odoo calls and reflecting `shop_module_state`.
- Payment-issues sub-view.

## Phase 3 — Employees, audit, team RBAC

- `shop_employees_cache` + read-through fetch from Odoo per shop (with sync-now button).
- Cross-shop employee search + deactivate/reset access actions (call Odoo, log to audit).
- Full audit log page with filters (shop, action type, actor, date range) — every meaningful action already writes here from phases 1–2.
- Internal Team page: invite (magic link email), edit role, revoke — RBAC enforced server-side.

## Phase 4 — Notifications, settings, Odoo config, polish

- Notifications feed + bell dropdown + read state + prefs.
- Settings page: business/support info, email templates (CRUD), Odoo integration config (endpoint URLs saved to `odoo_integration_config`, API key saved via `add_secret`).
- Empty states, loading skeletons, error boundaries audited across every page.
- Sitemap + robots + head metadata on every route.

## Technical details

- **Data reads**: `createServerFn` with `requireSupabaseAuth` middleware; loaders use `ensureQueryData` + components use `useSuspenseQuery`.
- **Data writes**: `useMutation` + `useServerFn`; `queryClient.invalidateQueries` on success + toast.
- **Server-side role checks**: every mutation server-fn first calls `context.supabase.rpc('has_admin_role', { _user_id, _role })` and throws 403 if false — UI hiding is only cosmetic.
- **Audit logging**: every mutation server-fn writes to `audit_log` in the same transaction where possible.
- **Confirmations**: destructive actions require typing the shop name (delete) or explicit confirm dialogs (suspend, refund).
- **Search**: server-side ILIKE on shops (name/phone/email); client-side filtering for smaller sets.
- **Charts**: Recharts with theme tokens.
- **Currency**: `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.

## Scope guardrails

- No self-signup for shops from this admin panel (manual create only in v1); shop-owner self-signup is a separate future surface.
- Actual Odoo automation is external — this panel calls a configurable webhook and reflects real returned state; when the webhook is not configured, actions fail with a clear message rather than lying.

**Approve to proceed with Phase 1 in the next turn.**
