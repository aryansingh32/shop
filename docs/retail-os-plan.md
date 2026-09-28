# Retail OS — Odoo Removal & Rebuild Plan

Status: proposal for review. Written 2026-09-28 against git tag `pre-odoo-removal`.
Evidence for every claim about the current system is a file path in this repo or in `odoo-src-reference/` (Odoo 18.0 checkout). Anything I could not verify is marked **[unverified]**. Market claims come from the three research notes pasted into the brief; those notes are directional (Reddit threads, one vendor survey), not statistics.

---

## 0. TL;DR

1. **You are not "removing a dependency". You are replacing the entire transactional engine.** Only 11 TypeScript files make real Odoo calls (32 mention it), but every real screen the shop owner uses (POS, stock, purchase, invoicing, HR) *is* Odoo's own UI, loaded in an iframe with CSS/JS hacks to hide Odoo chrome (`shop-portal/src/routes/open-app/$slug.tsx`). The portal and admin panel are a shell around it.
2. **Keep the control plane, rebuild the data plane.** Supabase (auth, plans, shops, audit), the admin panel, the portal's design tokens and shell all survive. The per-shop Odoo database is replaced by one multi-tenant Postgres with row-level security.
3. **The winning architecture is ledger + local-first + one client for every device.** Immutable stock movements and immutable sales, generated on-device with UUIDs, synced by idempotent commands. That one decision solves offline, inventory trust, audit, and phone-as-scanner together.
4. **Build the Odoo POS's behaviour, not its code.** Odoo is LGPL-3; POS JavaScript ships to users' browsers, so copying it would make derived files LGPL. Clean-room reimplementation of layout and workflow is the safe way to get "same UI, same features".
5. **The rebuild is roughly 6 months for 2 full-stack engineers to a pilot-ready MVP** (my estimate, ±40%). The old blueprint's warning still stands: this is exactly the "12 months rebuilding what Odoo ships" risk, so §3 draws a hard scope line.
6. **Two decisions are yours before we delete anything** (§9): are there live shops with real data in Odoo, and which shop type is the beachhead.

---

## 1. What the project is today

```
              ┌──────────────────────── Supabase (cloud) ────────────────────────┐
              │ auth · shops · plans · apps · plan_apps · audit_log · templates  │
              └───────────────▲──────────────────────────────▲───────────────────┘
                              │                              │
                  ┌───────────┴──────────┐      ┌────────────┴───────────┐
                  │  platform-command    │      │      shop-portal       │
                  │  Super-admin panel   │      │  owner/staff shell     │
                  │  12.5k LOC, 93 files │      │  5.8k LOC, 31 files    │
                  └───────────┬──────────┘      └────────────┬───────────┘
                    JSON-RPC (admin creds)         JSON-RPC (admin creds) + iframe
                              └───────────────┬──────────────┘
                                   ┌──────────▼──────────┐
                                   │ Odoo 18 (Docker)    │   one Postgres DB per shop
                                   │ + custom_addons ×6  │   (dbfilter ^shop_)
                                   └─────────────────────┘
```

### 1.1 Why it hurts (root causes, with evidence)

| Symptom you reported | Root cause found |
|---|---|
| "Lots of errors" | The product is Odoo's UI wearing a costume. `open-app/$slug.tsx` injects ~70 lines of CSS into an iframe to hide the navbar, chatter, smart buttons, breadcrumbs, export menus; `kirana_rebrand` adds more CSS + a JS text-scrubber. Every Odoo upgrade or new module can leak Odoo UI again. `ui_ux_plan.md` documents one such leak (Odoo logo on the *customer-facing* display). |
| "Not able to do what we want" | Every product-specific behaviour is a patch on top of Odoo internals: `kirana_rebrand/static/src/js/pos_partner_quickcreate.js` monkey-patches `PartnerList.prototype`; `barcode_rule_data.xml` documents a barcode-generation feature that was "completely non-functional out of the box"; `product_template.py` overrides a default so new products are sellable. Each fix needed reading Odoo source. |
| Slow onboarding | `provisioning.ts` creates a database then installs modules; its own comments say module installs "may take 2-5 min". |
| Depends-chain fragility | The `kirana_rebrand` manifest comments record a bug where an unmet dependency silently disabled *all* debranding on already-provisioned shops. |
| Mismatch with the market research | Research asks for keyboard-first counter speed, offline-first, a reasoned stock ledger, granular RBAC. Odoo is an ERP; the research note places "Odoo / ERP" on the *too complex* end of the market map, and the old blueprint's own thesis ("not an ERP company") points the same way. |

### 1.2 Security and hygiene findings (independent of the rebuild)

| Finding | Where | Status |
|---|---|---|
| Live Supabase **service-role** key hardcoded as a compose default | `docker-compose.yml` | **Fixed** in the snapshot commit (now `${VAR:?}` from `.env`). It was never in git history. |
| Builder stage `COPY platform-command/ .` could pull `.env` (contains service key) into a layer | `Dockerfile.platform-command`, `.dockerignore` | **Fixed**: `.dockerignore` now excludes `**/.env*`. Runtime stage copies only build output, so pushed images are very likely clean **[unverified — no Docker daemon here; `docker history` on the Docker Hub images would confirm]**. |
| Portal uses a *single* Odoo admin credential for every tenant (`ODOO_ADMIN_PASSWORD`, default `admin`) and Odoo master password `superadmin` | `docker-compose.yml`, `config/odoo.conf`, `shop-portal/src/lib/config.ts` | Disappears with Odoo. |
| Shop owner passwords stored in `shops.odoo_admin_password` | migrations `20260727…`, redacted by `20260802000005` | Migration exists; drop the column in Phase 0. |
| `SESSION_SECRET` falls back to `dev-secret-…` | `shop-portal/src/lib/config.ts`, compose | Make it required in the new app. |
| Debug leftovers with credentials | `shop-portal/test-login.js`, `test-login.mjs`, `routes/test-resolve.tsx` | Delete. |
| Lovable scaffolding still present | `platform-command/.lovable/`, `lovable-error-reporting.ts` | Remove or replace with real error reporting. |

---

## 2. Keep / Replace / Delete

### 2.1 Keep (and retarget)

| Asset | Why | Change needed |
|---|---|---|
| Supabase project, auth, migrations | Already the control plane; RLS pattern (`is_admin`, `has_admin_role`) is sound | Add tenant tables (§5.4) |
| `platform-command` (admin panel: dashboard, shops, plans, apps, audit, team) | Works and is not Odoo-specific except provisioning | `apps.odoo_module_name` → `feature_key`; provisioning becomes a SQL function |
| `plans` / `plan_apps` / `apps` concept | Good entitlement model | Plans gain limits (stores, devices, seats) |
| `business_type_templates` (7 types) | Right instinct: business type drives defaults | Seed categories/taxes/units/receipt/roles instead of Odoo modules |
| `shop-portal` shell: login, layout, nav (`navigation.ts`), `styles.css` tokens, dashboard/grow/customers/employees/subscription/profile pages | Design language and IA already decided (9-item workflow nav) | Data source moves from Odoo RPC → local DB/Supabase; iframe route deleted |
| Two Dockerfiles, nginx, `.dockerignore`, `server.mjs` | Deploy path for the two apps | Drop Odoo/db services |
| Market analysis in `retail-os-product-blueprint.md` §3–5, 6, 9–11, 16 | Personas, journeys, pricing principles still valid | §8 "app ecosystem verified against Odoo" becomes obsolete |

### 2.2 Replace

| Odoo capability | Replacement |
|---|---|
| Per-shop Postgres DB + `dbfilter` | One Postgres, `shop_id` on every row, RLS, JWT claim `shop_ids` |
| `res.users` / `res.groups` login | Supabase Auth (phone OTP) + PIN switch for shared counters + `staff`/`roles` tables |
| `pos.*` web POS | New POS client (§5, §3) |
| `stock.*` | Append-only `stock_movements` ledger + projection |
| `purchase.*` | `purchase_orders` → `goods_receipts` → `supplier_bills` |
| `account.*` + `l10n_in` | Invoice snapshot + party ledger + GST engine (no general ledger) |
| `loyalty.*` | Deferred; simple points table later |
| `barcodes` + OCA barcode addons | Native barcode rules, generator, label printing |
| Provisioning via `db.create` + module install | `provision_shop(shop_id, business_type)` SQL function — seconds, not minutes |

### 2.3 Delete (only after the gates in §7)

`custom_addons/` (6 addons), `Dockerfile.odoo`, `config/odoo.conf`, `platform-command/src/lib/odoo/*` (client, provisioning, pos-payments, backfill), `shop-portal/src/lib/odoo.ts`, `open-app/$slug.tsx`, `APP_ODOO_PATHS`/`APP_ODOO_GROUPS` in `config.ts`, compose services `odoo` + `db` and nginx routes to `/odoo` `/web` `/pos`, `launch.sh`/`start-dev.sh`/`push_to_hub.sh`/`*_push.sh` Odoo bits, `test-*` files, DB columns `shops.odoo_db_name`, `shops.odoo_admin_password`, `apps.odoo_module_name`.
**Keep `odoo-src-reference/` on disk (it is gitignored and large) until POS parity sign-off, then delete.**

---

## 3. The Odoo scan — what to reproduce

Source: `odoo-src-reference/addons/point_of_sale` (Odoo 18.0). Size for scale: **~8.5k lines Python, ~17k lines JS, ~2.8k XML, ~2.3k SCSS** in this module alone, plus `stock`, `purchase`, `account`, `l10n_in`, `loyalty`. Docker is not running here, so the live UI was not captured; the layout below comes from the XML/SCSS.

### 3.1 POS layout to match ("same UI")

`product_screen.xml`: a two-pane screen. **Left pane** = order lines + totals + numpad + customer/payment buttons. **Right pane** = category bar + search + product grid. Under `ui.isSmall`, Odoo toggles the two panes (`pos.mobile_pane`) instead of showing both — this is the pattern to reuse for phones. Numpad has three modes: **Qty / % / Price**. Extra actions live in a "more" dialog: notes, pricelist, refund, fiscal position (tax), delete order.

### 3.2 Feature parity table

Legend: **V1** = MVP, **Later** = post-MVP, **Drop** = intentionally not built. "Evidence" = where in the Odoo source it lives.

| Feature | Evidence | Decision | Notes |
|---|---|---|---|
| Product grid, categories, search | `product_screen`, `category_selector` | **V1** | |
| Barcode scan (HID scanner + camera) | `barcode_reader_service`, `camera_barcode_scanner.js` | **V1** | Weight/price-embedded EAN (prefix 2x) for loose goods — see §5.9 |
| Multiple open orders / hold & recall | `order_tabs` | **V1** | Local only |
| Qty / % / Price numpad modes | `product_screen.js` | **V1** | Keyboard-first: F-keys, no mouse needed |
| Line discount + global discount | `manual_discount`, `pos_discount` | **V1** | Limits by role (see §5.7) |
| Customer select + quick-create (name+phone) | `partner_list`, your patch | **V1** | Already a product requirement |
| Payment screen: multi-method, split, change | `payment_screen`, `payment_lines` | **V1** | Cash, UPI, card (manual confirm), credit/khata |
| Receipt: print / preview / share | `receipt_screen`, `order_receipt` | **V1** | 58/80 mm thermal, browser print, WhatsApp link |
| Order history, search, reprint, **refund** | `ticket_screen`, `pos_order_line_refund` | **V1** | Refund = negative sale referencing original |
| Open/close shift, cash counting, difference | `opening_control_popup`, `closing_popup`, `cash_control` | **V1** | |
| Cash in/out | `cash_move_popup` | **V1** | Feeds expenses |
| Sales-details (X/Z) report | `sale_details_button` | **V1** | |
| Cashier login / switch | `login_screen`, `pos_hr` | **V1** | PIN, per-cashier audit |
| Price control restricted to managers | `restrict_price_control` | **V1** | Part of RBAC |
| Hide margins/costs from cashiers | `is_margins_costs_accessible_to_every_user` | **V1** | Research gap #6 |
| Tax-included pricing (MRP) | `iface_tax_included` | **V1** | Default for India |
| Cash rounding | `cash_rounding` | **V1** | |
| Sync status popup | `sync_popup` | **V1** | Becomes first-class (offline) |
| Product info popup | `product_info_popup` | **V1** | Stock, margin (role-gated) |
| Lot/serial selection at sale | `select_lot_popup` | **V1 for batch/expiry; serial/IMEI Later** unless mobile-shop is the beachhead |
| Variants configurator | `product_configurator_popup` | **Later** (V1 if clothing is beachhead) | |
| Pricelists (wholesale, customer-specific, qty) | `use_pricelist` | **V1 (simple)** | See research #13 |
| Customer display | `customer_display_type`, `odoo_logo` leak | **Later** | Second window via BroadcastChannel |
| Cash drawer, electronic scale | `iface_cashdrawer`, `iface_electronic_scale`, `scale_screen` | **V1 (printer-pulse drawer), scale Later** | |
| Screen saver | `saver_screen` | Later | |
| Combos | `product_combo` | Later | |
| Notes on order/line | `customer_note_button`, `pos_note` | V1 (free text) | |
| SMS | `module_pos_sms` | Drop | WhatsApp link replaces it |
| Restaurant floor/table/KDS, order printers | `module_pos_restaurant`, `is_order_printer` | Drop | Separate vertical, Year 2 |
| Ship later, fiscal positions beyond GST, Avatax, IoT box, payment-terminal SDKs | `ship_later`, `module_pos_avatax`, `is_posbox` | Drop | |
| eWallet, gift cards, coupons, buy-X-get-Y | `loyalty` program types (8) | Later | Only simple points if validated |

### 3.3 Inventory / purchase / GST — what Odoo does that we must cover

| Area | Odoo reality | Our model |
|---|---|---|
| Stock | `stock.quant` (on-hand), `stock.move`, `stock.move.line`, `stock.picking`, `stock.lot`, `stock.scrap`, `stock.warehouse.orderpoint`; move states `draft→waiting→confirmed→partially_available→assigned→done/cancel` | Odoo's reservation/route machinery is warehouse-grade and unnecessary for a counter. Replace with **immutable movements with a reason code** (research #7): opening, purchase, sale, sale-return, purchase-return, transfer-in/out, damage, expiry, count-adjust, correction. On-hand = sum. |
| Purchase | `purchase.order` (+ vendor bills in `account`) | PO → GRN (scan-verified) → supplier bill → payment; records `supplier→product→price→date` for later price intelligence |
| GST | `l10n_in`: CGST/SGST/IGST, HSN, place of supply, chart of accounts | Tax engine only (§5.5). No chart of accounts. |
| Orders | `pos.order` states verified: `draft, cancel, paid, done (posted), invoiced` | `sales` with `completed / voided / returned`. Invoice is the same row — no separate `account.move`. |
| Payment methods | `pos.payment.method.type`: `cash / bank / pay_later` | `payment_methods` with kinds `cash, upi, card, credit, other` |
| Accounting | Full GL; P&L/balance-sheet reports are Enterprise-only per the blueprint | **Do not build a GL.** Daybook, cash book, party ledgers, GST summary, stock valuation, profit estimate; export for the accountant |

---

## 4. Research gaps → design decisions

Evidence tier comes from the validation note: 🟢 validated, 🟡 hypothesis, 🔴 do not build now.

| # | Gap | Tier | Decision in this design | Phase |
|---|---|---|---|---|
| 1 | Migration / onboarding pain | 🟡 (adoption friction validated; "#1 blocker" not) | CSV/Excel import with column mapping in V1; barcode→product lookup; invoice-photo OCR as a **gated experiment** | 1 / 4 |
| 2 | Too simple vs too complex | 🟢 | Powerful backend, tiny surfaces; role-based mode (Owner / Cashier / Scanner) | all |
| 3 | Cashier speed | 🟢 | Local-first, keyboard-first, measurable budget (§5.8) | 1 |
| 4 | Offline-first | 🟢 | Local DB is the source of truth for the client; sync is background (§5.3) | 0–1 |
| 5 | Hardware fragmentation | 🟢 | Bring-your-own hardware ladder; hardware abstraction layer (§5.10) | 1–2 |
| 6 | Employee permissions + audit | 🟢 | Permission keys + numeric limits + append-only audit (§5.7) | 0–1 |
| 7 | Inventory trust | 🟢🟢 | Movement ledger + "why is it 51?" history + count discrepancy review | 1–2 |
| 8 | WhatsApp/notebook fragmentation | 🟢 | `wa.me` share in V1 (no API cost); Business API later | 1 / 4 |
| 9 | WhatsApp as interface | 🟢 | Same; supplier-invoice-by-WhatsApp is Phase 4 | 4 |
| 10 | Decisions over reports | 🟡 | Deterministic **Owner Brief** (no LLM) | 2 |
| 11 | Inventory intelligence | 🟡 | Reorder suggestions with a printed "why" — rule-based first; test trust before automating | 2 → 4 |
| 12 | Product setup pain | 🟢 (principle) | Zero-data-entry: scan → prefill; owner types only cost + opening stock | 1 / 4 |
| 13 | Price/margin | 🟡 | Purchase-price history + margin alert when cost changes | 2 |
| 14 | Pricing ≠ only barrier | 🟢 | Transparent per-plan limits, no hidden module fees | 1 |
| 15 | GST/tax fear | 🟢 (perception) | Explicit "what is stored / shared" screen, export-everything, accountant role | 1 |
| 16 | Support = product | 🟢 | Emergency mode: POS works with no cloud, no printer; backup/restore | 1–3 |
| — | Desktop + phone as one system | 🟢 (mobile billing) / 🟡 (companion scanner) | Phone pairs to a counter as scanner; also standalone | 2 |
| — | AI chatbot, voice billing, shelf vision, autonomous purchasing | 🔴 | **Not built** | — |

**Product thesis (from the validation note, adopted):** *low-friction Retail OS, AI underneath.* Desktop sells, mobile moves, cloud controls, insights advise.

---

## 5. Target architecture

### 5.1 Principles

1. **The client never waits for the network.** Reads and writes hit a local DB.
2. **Facts are immutable.** Sales and stock movements are append-only; everything else (on-hand, balances) is derived.
3. **Every write is an idempotent command** with a client-generated UUID.
4. **One codebase for every device.** Same app on desktop, tablet, phone; layout and permissions decide the mode.
5. **Business rules live once** in a shared domain library used by client and server, so totals never differ offline vs online.
6. **Never block a sale.** Negative stock is allowed, flagged, and reconciled — retail reality beats purity.

### 5.2 System view

```
   Desktop (Chrome/Edge PWA)        Phone (Android Chrome PWA)         Tablet
   ┌──────────────────────┐        ┌──────────────────────┐
   │ Cashier / Owner mode │◀──────▶│ Scanner / Owner mode │   ← paired via realtime channel
   │ local DB (SQLite/OPFS│        │ local DB             │
   │ + outbox)            │        │ + outbox             │
   └──────────┬───────────┘        └──────────┬───────────┘
              └──────────── sync (HTTPS / websocket) ─────────┐
                                                              ▼
   ┌───────────────────────────── Supabase ─────────────────────────────────┐
   │ Postgres (multi-tenant, RLS) · Auth · Realtime · Storage · Edge/RPC    │
   │  commit_sale() · receive_goods() · apply_count() · provision_shop()    │
   └───────────────▲──────────────────────────────────▲─────────────────────┘
                   │                                  │
           platform-command (admin)         server functions: OCR, WhatsApp, reports
```

### 5.3 Offline & sync design (the core technical bet)

- **Reads:** the full catalog (10k–30k SKUs), customers, prices, and the last N days of sales are mirrored locally. Search is in-memory index + barcode hash map.
- **Writes = commands** in an outbox: `SaleCommitted`, `StockCounted`, `GoodsReceived`, `PaymentRecorded`, `ProductUpserted`. The server applies each in one transaction and is idempotent on the command UUID. Retries are safe.
- **Conflicts by construction:** sales and movements never conflict (append-only). Catalog/price edits are last-write-wins with a `version` check and the loser surfaced to the owner. No CRDTs needed.
- **Invoice numbers offline:** each register owns a series (e.g. `S1-R2/26-27/000123`) allocated locally; uniqueness holds because a register has a single active device lease. **Confirm multi-series and consecutive-numbering rules with a CA before launch [unverified].**
- **Pull:** the naive "`server_seq > last_seen`" feed can skip rows committed out of order under concurrent transactions. Use an overlap window or snapshot-based cursor, **or adopt an engine**. Candidates to spike for 1–2 weeks: a custom outbox + overlap-cursor, versus PowerSync/ElectricSQL-style replication **[unverified: check current licensing, self-host option, and web/SQLite-WASM support]**. My lean: custom command outbox for writes (business invariants matter) + a replication layer for reads.
- **Emergency mode:** cloud down → keep selling. Printer down → save the bill, reprint later. Device dies → sign in on another device, pull, continue (unsynced outbox on a dead device is the one real loss risk → sync aggressively and show the unsynced count).

### 5.4 Tenancy and data model

Tenant = `shops` row (existing). Add `stores` (branches), `registers`, `devices`, `staff`. Every business table carries `shop_id` (+ `store_id` where relevant), `id uuid` (v7, client-generated), `created_at`, `updated_at`, `deleted_at`, `version`, `origin_device_id`. RLS: `shop_id = ANY(current_shop_ids())` with membership resolved through a JWT claim (Supabase custom access-token hook).

| Domain | Tables |
|---|---|
| Identity | `staff`, `roles`, `role_permissions`, `devices`, `shop_audit_log` (append-only) |
| Catalog | `categories`, `brands`, `units`, `unit_conversions`, `tax_rates`, `products`, `product_barcodes` (many per product), `barcode_rules`, `price_lists`, `price_list_items`, `purchase_price_history` |
| Stock | `stores`, `locations`, `stock_movements` (ledger), `stock_levels` (projection), `batches`, `serials`, `stock_counts`, `stock_count_lines`, `transfers`, `transfer_lines`, `reorder_rules` |
| Sales | `registers`, `shifts`, `sales`, `sale_lines`, `sale_payments`, `payment_methods`, `cash_movements` |
| Parties | `customers`, `suppliers`, `party_ledger` (append-only signed entries → khata) |
| Purchase | `purchase_orders`, `po_lines`, `goods_receipts`, `gr_lines`, `supplier_bills`, `supplier_payments` |
| Insights | computed views/materialized tables: velocity, stockout days, dead stock, margin alerts, brief |
| Platform (existing) | `admin_team_members`, `plans`, `apps→features`, `plan_apps`, `business_type_templates`, `audit_log` |

Money is **integer paise**, quantities `numeric(12,3)`. Cost method: **weighted average** (optional batch/expiry with FEFO for grocery/pharmacy). Each sale line snapshots cost so historical margin survives later cost changes.

### 5.5 GST engine (shared library, heavily tested)

- Slabs 0 / 0.25 / 3 / 5 / 12 / 18 / 28 + cess; per-line tax; MRP is tax-inclusive by default.
- Intra-state → CGST+SGST; inter-state → IGST, from shop state vs place of supply.
- **Composition-scheme shops** issue a *Bill of Supply* with no tax collected — many small kiranas are on it; make it a shop setting, not an afterthought.
- HSN on lines with digit-length by turnover **(confirm thresholds with a CA [unverified])**; rounding at invoice level.
- B2B customers with GSTIN get a tax invoice; B2C small-value can use a simplified bill.
- E-invoicing (IRP) only for shops above the threshold and B2B — **Phase 4, verify current threshold [unverified]**.
- Output: GSTR-1/3B-ready CSV exports for the accountant. We do not file returns.
- **Test with published tax examples and a CA-reviewed vector set before the pilot.** This is the highest-consequence correctness area.

### 5.6 Payments

Cash, UPI, card, credit (khata), split. **V1 UPI** = dynamic `upi://` QR with the amount and an explicit "mark received"; it cannot *verify* payment. Verified payments need a PSP integration (Razorpay/PhonePe/etc.) — Phase 4. Do not imply automatic confirmation in V1 UI copy.

### 5.7 RBAC and audit

Permission keys × role defaults × per-user overrides × numeric limits, enforced **in RPC/RLS, not just hidden in UI**.

| Action | Cashier | Manager | Owner |
|---|---|---|---|
| Create bill | ✅ | ✅ | ✅ |
| Discount | up to N% | up to M% | any |
| Edit product / price | ❌ | limited | ✅ |
| See purchase cost / profit | ❌ | limited | ✅ |
| Stock adjustment | ❌ | ✅ (reason required) | ✅ |
| Delete / void bill | ❌ | limited | ✅ |
| Refund | limit | ✅ | ✅ |
| Export data | ❌ | ❌ | ✅ |

Roles: owner, manager, cashier, salesperson, purchaser, accountant (read + export). `shop_audit_log` records who/what/when/before/after for every sensitive action (void, refund, discount over limit, price/cost edit, adjustment, role change, export).

### 5.8 POS performance budget (measurable)

| Metric | Target |
|---|---|
| Scan → line visible (p95, low-end Android and typical shop PC) | < 100–150 ms |
| Finalise bill locally | < 300 ms |
| Cold start to sellable | < 3 s |
| Network in the critical path | none |
| Rush test | 20 bills, timed, keyboard-only |

Keyboard map (draft): `F2` search/scan focus, `F4` qty, `F6` price, `F8` discount, `Ctrl+H` hold, `F12` pay, `Esc` back.

### 5.9 Barcodes

Multiple barcodes per product and per pack size; internal EAN-13 generation for loose items (your existing `20..........` GS1-internal-prefix rule carries over); **weight/price-embedded EAN-13** parsing for scale labels; label printing (shelf/price) as an explicit V1.5 feature; camera scanning via `BarcodeDetector` where available with a WASM decoder fallback **[verify per-browser support]**.

### 5.10 Devices and the desktop+mobile model

- **One app, three modes:** Cashier (desktop/tablet, full POS), Scanner (phone: scan-for-POS, price check, stock count, goods receiving, transfers), Owner (any device: brief, reports, staff).
- **Phone as wireless scanner:** desktop shows a QR → phone (already signed in as staff) joins a realtime channel scoped to that register → each scan is a `barcode` event → cart adds the line. Cloud-relayed latency is acceptable. **Honest limit:** a browser cannot accept incoming LAN connections, so true internet-free phone↔desktop pairing needs either a WebRTC data channel (signalling once via cloud; field-test that it survives an internet drop) or a desktop wrapper with a local hub (Tauri) — Phase 4. Until then: no internet → phone works standalone, desktop keeps billing.
- **Hardware abstraction:** `Scanner` (HID keyboard-wedge works everywhere), `Printer` (ESC/POS 58/80 mm via WebUSB/WebSerial/WebBluetooth, LAN printer via helper, or browser print fallback), `CashDrawer` (printer pulse), `Scale` (Web Serial, later). Web APIs are Chromium-only and Bluetooth printers are flaky → **wrap with Capacitor for Android when field tests demand it** [decision deferred to Phase 3 data].
- **Ladder:** existing PC + Android phone + browser print → add USB scanner → thermal printer → drawer → second register → second store.

### 5.11 Insights ("Retail Brain") — deterministic first

V1–V2 need **no LLM**: stockout-days from trailing velocity × supplier lead time; reorder suggestion with a plain-language reason; dead stock (no sale in 45/60 days); margin-drop alert on cost change; overdue khata; anomaly *signals* (refund/discount/adjustment counts vs shop median) framed as signals, not accusations. LLM use is limited to gated Phase-4 items (invoice OCR with human review). No chatbot, no voice, no shelf vision.

### 5.12 Platform / admin plane

- `provision_shop()` seeds tax rates, units, categories, payment methods, roles, receipt footer, and default settings from the business-type template — one transaction.
- Suspend/resume = a flag checked by `is_shop_active()` inside RLS/RPC, not tearing down a database.
- Dashboard metrics (MRR, active shops, churn) already come from Supabase; add real usage (bills/day, devices, last sync).
- Plans enforce limits: stores, registers, seats.

### 5.13 Stack (recommendation)

| Layer | Choice | Reason |
|---|---|---|
| Language/UI | TypeScript, React, Tailwind, Radix (already in both apps) | No re-skilling; design tokens exist |
| App framework | Vite SPA/PWA for the shop client; keep TanStack Start for admin | POS client needs no SSR; SSR complicates offline |
| Client DB | SQLite-WASM on OPFS (fallback IndexedDB) | 10k–30k SKU queries + FTS |
| Server | Supabase Postgres + RPC functions for invariants; TanStack server functions for integrations | Transactions where correctness matters |
| Realtime | Supabase Realtime | Phone↔desktop, live activity |
| Monorepo | pnpm/bun workspaces: `apps/admin`, `apps/retail`, `packages/domain`, `packages/ui`, `packages/db` | Shared money/tax/pricing code |
| Testing | Vitest for domain, Playwright for POS flows + rush timing, SQL tests for RLS | Cross-tenant leak test in CI is mandatory |

---

## 6. Repo layout after the rebuild

```
apps/
  admin/            ← platform-command (kept, retargeted)
  retail/           ← new shop PWA (cashier / scanner / owner modes)
packages/
  domain/           ← money, GST, pricing, discounts, ledger math (pure, shared)
  ui/               ← tokens + components lifted from shop-portal/styles.css
  db/               ← migrations, RLS, RPC, seeds, SQL tests
docs/               ← this plan, ADRs
```

---

## 7. Removal sequence (safe order)

| Step | Action | Gate |
|---|---|---|
| 0 | Push snapshot + tag `pre-odoo-removal` | **Blocked on GitHub auth (see §9)** |
| 1 | Cut branch `retail-os` from that tag; main stays Odoo-era | — |
| 2 | Confirm whether live tenants exist. If yes: export products, customers, opening stock per shop via existing RPC before anything is deleted | User decision |
| 3 | Delete portal iframe route + Odoo config mappings; stub navigation to "coming soon" | — |
| 4 | Delete `platform-command/src/lib/odoo/*`; replace provisioning with a stub that creates the shop row | — |
| 5 | Remove compose services `odoo`, `db` and the nginx Odoo routes | — |
| 6 | Delete `custom_addons/`, `Dockerfile.odoo`, `config/odoo.conf` | — |
| 7 | Migration: drop `odoo_*` columns; rename `apps.odoo_module_name` → `feature_key` | — |
| 8 | Delete `odoo-src-reference/` from disk | **Only after POS parity sign-off (Phase 1 exit)** |

Because there is no rollback except the tag, steps 3–7 happen on `retail-os` only. If there are **no** live tenants, steps 3–7 can happen immediately; the demo is non-functional until Phase 1 lands, which is acceptable at this stage.

---

## 8. Roadmap

Estimates assume 2 full-stack engineers and are ±40%; they are a planning aid, not a commitment.

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **0 Foundations** | 1–5 | Monorepo; `packages/domain` (money, GST, pricing) with test vectors; schema v1 + RLS + JWT claims; `provision_shop()`; auth (phone OTP + PIN); RBAC + audit; CI with cross-tenant leak tests; Odoo removal steps 3–7 | Create a shop in < 5 s. Two-tenant leak test passes. GST vectors pass. |
| **1 Counter MVP** | 5–14 | Catalog + CSV import; barcodes; POS (parity table V1 rows); payments incl. UPI QR + khata; returns; GST invoice / bill of supply; receipts + WhatsApp link; shifts + cash control; X/Z report; offline DB + outbox sync; stock ledger deductions; low-stock; RBAC enforcement | Rush test (20 bills) passes; 8-hour offline day reconciles to the rupee and unit; scan→line p95 < 150 ms; POS parity signed off |
| **2 Stock & mobile** | 14–22 | Scanner mode (POS pairing, price check, stock count + discrepancy review, goods receiving, transfers); purchases + supplier ledger; khata reminders; expenses; daybook, GST summary/export, valuation, profit; deterministic Owner Brief; multi-store | Count of a 5k-SKU store by phone; "why is stock 51?" history correct; transfer verified end to end |
| **3 Pilot & harden** | 22–26 | 5–10 pilot shops; hardware compatibility matrix; backup/restore + export; emergency-mode drills; plan enforcement; decide Capacitor/Tauri | Pilot shops bill unaided for 2 weeks; zero unreconciled stock discrepancies caused by the system |
| **4 Validated extras** | after | Invoice OCR → purchase draft; shared product catalog; WhatsApp Business API; supplier price tracking; reorder recommendations with trust test; anomaly signals; loyalty; e-invoicing; Tauri LAN hub; PSP-verified UPI | Each gated on its own validation experiment |

**Run these in parallel from week 1 (from the validation note):** clickable-prototype rush test with real cashiers; phone-as-scanner stock-count trial; supplier-invoice OCR accuracy test; "what one headache would you remove?" interviews with 20–30 owners.

---

## 9. Risks and open questions

### Decisions needed from you

1. **Are there live shops with real data in Odoo?** Everything in the repo reads as demo (`dev-secret` defaults, "main demo entry"). If yes, we need an export/import path before step 3.
2. **Beachhead shop type.** `project_context.md` targets *mobile and clothing shops*; the blueprint and all the research point at *kirana / general / mini-supermarket*. These need different V1 scope (IMEI/serials and variants versus weighed goods, khata, barcode density). **My recommendation: kirana/general store first** — it matches the validated pain, and serials/variants stay possible in the data model.
3. **Team size and target date** — changes the estimate, not the design.
4. **Push access.** See below.

### Risks

| Risk | Mitigation |
|---|---|
| Scope explosion (rebuilding an ERP) | §3.2 Drop list; no GL; restaurant excluded; each Phase 4 item is gated |
| Sync correctness bugs → wrong stock → lost trust | Ledger design; command idempotency; property tests; reconciliation job comparing ledger vs projection |
| GST mistakes | Shared, vector-tested engine; CA review before pilot |
| Multi-tenant leak (giving up DB-per-shop isolation) | RLS everywhere, leak tests in CI, no service-role key on the client, per-tenant export/erase tooling |
| Hardware fragmentation / browser API limits | Abstraction layer; compatibility matrix; Capacitor escape hatch |
| Copyright | Clean-room; do not copy Odoo JS/XML/SCSS/icons/strings. LGPL-3 verified in manifests; POS JS reaches users' browsers, so derived files would need to remain LGPL. Get legal advice before copying anything. |
| Supabase lock-in / cost | Plain Postgres + SQL functions keep exit possible; measure per-tenant row and realtime volume in the pilot |
| Evidence is anecdotal | Treat the research as hypotheses; the interview program is part of the plan, not optional |

---

## 10. Explicitly not building (yet)

AI chatbot · voice billing · shelf computer-vision · autonomous purchasing · general ledger / P&L / balance sheet · restaurant/KDS · payment-terminal SDKs · a marketplace of 60 modules.
