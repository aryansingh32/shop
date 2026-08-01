# Project Context: Retail SaaS Platform (Super Admin Panel + Odoo Backend)

Read this fully before making any changes. This document explains what we're building, why, what already exists, and what's still missing — so you have the full picture before touching any code.

---
rms

## 1. The business, in plain te
We are building a B2B SaaS product for small retail shops in India — primarily mobile phone shops and clothing shops, with malls as a secondary/optional target later. These are non-technical shop owners who need working retail software (billing counter, stock tracking, GST-compliant invoicing) but have no interest in installing, configuring, or maintaining anything themselves.

We sell this as a monthly subscription — roughly ₹999 to ₹1499/month depending on plan tier — where the shop owner just logs into a simple dashboard and everything works. No setup, no IT knowledge required, no visible trace of any underlying open-source software.

## 2. What powers it underneath: Odoo

We are not building the actual business logic (point of sale, inventory, invoicing, accounting) from scratch. We use **Odoo** (open-source ERP software, Community Edition, LGPL-licensed) as the real engine behind every shop. Odoo already has mature, tested modules for:
- Point of Sale (`point_of_sale`) — the actual checkout/billing screen
- Inventory (`stock`) — stock tracking, auto-deducted on every sale
- Sales (`sale`, `sale_management`) — quotations, sales orders
- Accounting/Invoicing (`account`) — invoicing and India GST tax handling (`l10n_in`)
- we can add more apps which odoo provides later

We are legally allowed to self-host and resell Odoo Community as the backend of our own product — the LGPL license permits this as long as we don't redistribute Odoo's separate paid Enterprise modules. We must not present this product to customers as "Odoo" — no Odoo branding, URLs, or naming should ever be visible to a shop owner or their employees. To the customer, this is entirely our own product.

### Critical architectural fact: one Odoo database per shop

Every shop we onboard gets its own **completely isolated Odoo database** — not shared records inside one big Odoo instance. This is essential for data isolation between customers (shop A must never be able to see shop B's data) and lets us install a different combination of Odoo modules per shop depending on which plan they're subscribed to. Odoo natively supports this multi-database model via its `dbfilter` mechanism and its database-management API.

## 3. What already exists today

**The Super Admin Panel** — a web application (built with Lovable) that I, the platform owner, use internally to manage the whole business. It currently exists as a standalone application with its own database, covering:
- A dashboard with platform-wide metrics (MRR, active shops, churn, signups)
- Shop/tenant management — a table of every shop, with the ability to create, edit, suspend, and delete shop records
- Plan management — creating/editing pricing tiers and which "apps" each plan includes
- An app/module catalog — the list of business features (Point of Sale, Inventory, etc.) that can be assigned to plans
- Billing/subscription tracking — invoices, payment status
- Employee oversight — a read view of sub-users under each shop
- An activity/audit log of actions taken in the panel
- Internal team member management with role-based permissions for our own staff

**Important limitation of what exists right now: none of this is actually connected to Odoo yet.** Right now, "creating a shop" in this panel just creates a row in the panel's own database. It does not yet create a real Odoo database, does not install any real Odoo modules, and does not create any real login a shop owner could use. The "apps" in the catalog are just labels in our own system, not yet linked to Odoo's real technical module names. This panel today is a fully functional-looking control surface with nothing real happening underneath its most important action.

**Docker-based Odoo instance** — a working Odoo 18 setup (via `docker-compose`) running locally, used so far for manual testing/exploration: installing Sales, Point of Sale, Inventory, and Accounting modules through Odoo's own raw UI, to understand what these apps do and how Odoo's module system behaves (including that some module installs are heavy, pulling in many dependencies, and can take minutes to complete).

## 4. What is genuinely missing — the real next build target

The single most important missing piece is **the integration/provisioning service**: a backend service (intended to be built in Node/NestJS) that sits between the Super Admin Panel and real Odoo instances, and does the actual work the panel currently only pretends to do. This service needs to expose operations such as:

- **Create shop** → actually create a new Odoo database for that tenant, install the Odoo modules matching their chosen plan, and create their owner login — via Odoo's XML-RPC/JSON-RPC API, not just insert a row somewhere
- **Install / uninstall module** → when a shop's plan changes, actually install or remove the corresponding Odoo module on that specific shop's database
- **Suspend / delete shop** → actually restrict or tear down access to that shop's real Odoo database, not just flag a status in our own system
- **Fetch shop status** → check whether that shop's Odoo database is actually reachable/healthy, and what modules are actually currently installed on it (so we can detect drift between "what the plan says should be installed" and "what's actually installed")
- **Fetch shop employees** → read real employee/user accounts (`res.users`, with permissions via `res.groups`) from that shop's Odoo database — employee accounts live inside Odoo itself, not in a separate system

Until this service exists and the Super Admin Panel is wired to call it (instead of just writing to its own database), the platform cannot actually onboard a real, working shop.

## 5. The customer-facing side (not yet built)

Separately, and later in sequence, we need a **shop owner dashboard** — the simple, card-grid, role-based interface that actual paying shop owners and their employees use daily. This is a different, much simpler application than the super admin panel: it shows only the apps included in that shop's plan as clickable cards, lets the shop owner manage their own employees (name/password/which apps they can access), and either embeds or proxies into the real Odoo screens (Point of Sale, etc.) underneath — while never showing Odoo's name, branding, or raw URLs anywhere. This does not exist yet and should not be started until the integration service above is working end to end for at least one real shop.

## 6. Non-negotiable constraints to respect in all future work

- **Odoo's core code is never modified directly.** All customization happens through separate custom Odoo modules that extend/override behavior — Odoo core stays fully stock and upgradeable.
- **No Odoo branding, naming, or raw URLs are ever exposed to a shop owner or employee**, anywhere in the customer-facing product.
- **Data isolation between shops is mandatory** — one Odoo database per shop, never shared records across tenants.
- **Nothing in the Super Admin Panel should silently stay disconnected from reality** — every action that implies a real-world effect (creating a shop, changing a plan, suspending access) must actually cause that real effect via the integration service once it exists, not just update a local database row that gives a false impression of a working system.
- We are targeting Odoo Community Edition (LGPL) only — we do not use or redistribute Odoo Enterprise-only modules, since those carry separate licensing/subscription obligations per user that would break our pricing model.

## 7. Immediate goal

Design and build the integration/provisioning service described in Section 4, with clearly defined API endpoints, real Odoo XML-RPC/JSON-RPC calls behind each one, and a clean contract that the existing Super Admin Panel can be wired into — so that clicking "Create Shop" in the panel results in an actual, working, isolated Odoo instance for that shop, with the correct modules installed based on their plan.
