# Retail OS — Product Blueprint
## The definitive 18-month product specification
### Prepared for product leadership. No code. No engineering tasks. Decisions only.

---

# 0. How to read this document

Every feature recommendation in this document was checked against one
question first: **does Odoo 18 Community Edition already solve this?**
Where the answer is yes, the recommendation is "install + simplify," not
"build." Where the answer is no, it's flagged as **genuine new IP** — and
those are the features that actually deserve engineering time, because
they're the ones a merchant can't get by just using raw Odoo, and the ones
competitors can't get by just using raw Odoo either.

This matters because the single biggest strategic risk in this project is
spending 12 months rebuilding what Odoo already ships for free, while your
actual competitors (Vyapar, Khatabook, Petpooja) win on things Odoo doesn't
have at all: WhatsApp-native workflows, instant onboarding, and
embedded financial services.

---

# 1. Vision

> **We are not an ERP company. We are not an Odoo reseller. We are building
> the operating system a small Indian retailer runs their entire business
> on — billing, stock, customers, staff, money owed, and money coming in —
> from a phone, in minutes, without ever knowing what's underneath.**

Odoo is our engine. Nobody buys a car for its engine. We sell the drive.

**Non-negotiable product law:** if a screen, term, or workflow makes a
shopkeeper feel like they're "doing ERP," it has failed, regardless of how
technically correct it is.

---

# 2. Product Philosophy

1. **Action over administration.** Every screen answers "what do I do next,"
   not "what can I configure."
2. **Odoo is invisible plumbing, not a feature.** We never market "powered by
   Odoo." We never say "modules." We say "apps," "tools," "your shop."
3. **Reuse before rebuild.** If Odoo CE has a working model and workflow
   underneath a screen, we simplify the view — we do not re-implement the
   business logic. Rebuilding `stock.move` or `account.move` from scratch
   would be strategically insane; simplifying how they're presented is not.
4. **Build only where Odoo is silent.** WhatsApp, embedded lending-style
   partnerships, one-tap onboarding, and cross-channel automation are where
   Odoo has nothing to offer — that's where our engineering budget goes.
5. **Speed beats completeness.** A merchant choosing between us and Vyapar
   is not comparing feature checklists — they're comparing "how fast can I
   bill my next customer." Every roadmap decision is filtered through that.
6. **Free core, paid growth.** The pattern that wins in this exact market
   (Khatabook, Loyverse, Vyapar) is a genuinely useful free/cheap core plus
   paid modules that pay for themselves. Nobody in this market has won by
   being the most feature-complete ERP.

---

# 3. Competitive Landscape

## 3.1 Summary matrix

| Competitor | Core wedge | Pricing (verified) | Biggest strength | Biggest complaint | Our opening |
|---|---|---|---|---|---|
| **Vyapar** | GST billing + inventory for Indian MSMEs | Free (Android, limited); ~₹3,400–4,000/yr desktop+mobile | GST compliance made effortless; WhatsApp bill sharing; huge Indian install base | Mouse-dependent/slow item entry at the counter; no UPI QR on invoices out-of-box; "fails to meet speed requirements of a real-world retail environment" (verbatim G2 complaint) | **We win the counter.** Vyapar was built as accounting software with billing bolted on. We build the till first. |
| **Khatabook** | Free digital credit ledger (udhaar) | 100% free core; monetizes via embedded loans/NBFC partnerships, not subscriptions | Zero-friction onboarding (OTP only), WhatsApp/SMS reminders baked in, trusted brand for "hisab-kitab" | No real inventory/POS/GST depth — it's a ledger, not a shop system | **We win by being Khatabook + a real POS + real inventory in one login**, and we can copy their monetization insight (see §16) |
| **Marg ERP** | Pharma/FMCG distribution + inventory-heavy retail | Basic ₹8,100/yr, Silver ₹12,600/yr, Gold ₹25,200/yr | Deep inventory/batch/expiry handling, strong in pharma vertical | "Could be too advanced for very small businesses"; steep learning curve | **We win on the exact businesses Marg overserves** — single-counter kirana/mobile/clothing shops that don't need pharma-grade batch tracking by default (but we can turn it on for pharmacy tenants — Odoo's `stock` already supports lot/expiry tracking) |
| **Busy** | General accounting for SMBs, less retail-specific | Basic ₹9,999/yr, Standard ₹14,999/yr, Enterprise ₹19,999/yr | Strong general ledger/reporting; more accountant-friendly | More technical learning curve than Vyapar; not mobile-first; not built around a physical counter at all | **We win on mobile-first, counter-first design** — Busy is fundamentally desktop accounting software wearing a retail costume |
| **Loyverse** | Free global POS for micro-businesses | Free core (POS/Dashboard/KDS/Customer Display); paid add-ons (~$348/yr) for advanced inventory/employee mgmt | Genuinely excellent free tier, offline-capable, built-in loyalty | Limited advanced reporting/warehouse features; integrations weaker outside US; no India-specific GST/UPI/WhatsApp depth | **We win on India-native compliance + India-native communication (GST, UPI, WhatsApp, Hindi/regional languages)** — Loyverse is a generic global product, we are not |
| **Shopify POS** | Omnichannel — physical + online store, one inventory | POS Lite free with any Shopify plan ($5–399/mo); POS Pro $89/location/mo | Best-in-class if you also sell online; huge app ecosystem | Overkill and expensive for a single-counter offline shop with no online store ambitions; transaction fees stack up | **Not really our direct competitor for kirana/mobile/hardware shops** — but is the benchmark once we build eCommerce/omnichannel (roadmap Year 2) |
| **Square POS** | Similar to Shopify, US-centric, hardware+software bundle | Free plan; Plus $49–60/location/mo | Free entry tier, integrated hardware | US-centric payment rails, weak India presence, no GST | Same as Shopify — aspirational benchmark, not a day-one threat in India |
| **Zoho Inventory** | Inventory/order management, part of Zoho suite | ~$99+/org/month (Professional) | Deep integration with Zoho's broader business suite, strong API | Priced and positioned for larger multi-channel sellers, not single-counter retail; not a POS/till product at all | **Not a direct competitor** — it's a warehouse tool, not a shop tool. Relevant only if we build a "connect your Zoho" integration later. |
| **Petpooja** | Restaurant POS (KOT, table mgmt, Swiggy/Zomato integration) | Pricing not public; real-world cost ₹15,000–30,000+/yr per outlet once modules are added | Mature aggregator integrations, huge restaurant install base (100,000+ outlets), 24/7 support | Opaque pricing, module upsell fees stack up fast, dated UI in places, loyalty/CRM are extra-cost add-ons | This is the **template for our future Restaurant vertical** (roadmap Year 2) — and their #1 complaint (opaque, stacking pricing) is exactly what we should avoid in our own packaging |
| **GoFrugal** | Multi-vertical retail (60+ business types), HQ/multi-store | Quotation-based, no public pricing; high initial setup cost cited as a barrier for small retailers | Very wide vertical coverage, strong multi-store/HQ tooling, franchise features | High setup cost deters small single-shop merchants — their own reviewers flag this; UI described as dated by some | **We win the exact segment GoFrugal prices out** — the single-shop, first-time-digitizing merchant. GoFrugal's multi-store depth is a Year-2+ opportunity once we have that many multi-branch customers. |

## 3.2 The pattern across every competitor complaint

Reading every complaint above together, one pattern repeats regardless of
product: **pricing opacity/stacking fees, counter-speed friction, and
"too ERP for a small shop."** None of the ten products are criticized for
lacking features. They're criticized for making the merchant work harder
than they should have to, or for surprising them with cost. That is exactly
the failure mode this document is designed to prevent us from repeating.

---

# 4. Merchant Personas

Each persona below drives different defaults, not different products — one
codebase, configuration-driven by business type (see §7).

| Persona | Core anxiety | What they'll pay for | What they'll never use |
|---|---|---|---|
| **Kirana / General Store** | "Am I losing money to shrinkage/wrong pricing?" | Fast billing, low-stock alerts, udhaar tracking for regulars | Multi-warehouse routing, manufacturing, advanced BOM |
| **Grocery (larger, perishables)** | Spoilage, fast-moving SKU count | Expiry tracking, fast reorder, margin visibility | Serial number tracking |
| **Pharmacy** | Regulatory compliance, batch/expiry, prescription trail | Batch/expiry (Odoo `stock` lot tracking — native), drug schedule handling | Restaurant-style KOT |
| **Electronics** | Serial numbers, warranty, high-ticket returns | Serial tracking, warranty reminders, EMI/finance partner tie-ins | Perishable/expiry tracking |
| **Clothing** | Size/color variants, seasonal dead stock | Variant matrix (Odoo `product.template` attributes — native), dead-stock report | Batch/lot tracking |
| **Hardware** | SKU sprawl, vendor-specific pricing | Supplier price lists, quick lookup, bulk units (kg/box/piece conversions) | Loyalty gamification (lower priority here) |
| **Mobile shop** | High-value theft/fraud risk, IMEI tracking, EMI/finance | Serial/IMEI tracking, exchange/trade-in flow, finance partner integration | Perishables |
| **Bakery** | Daily production planning, pre-orders, freshness | Pre-order/advance booking, daily production count, expiry-of-day | Multi-warehouse |
| **Restaurant (future, Year 2)** | Table turnover, KOT accuracy, aggregator orders | Table management, KDS, Swiggy/Zomato integration | Retail-style barcode shelf labels |

**Design implication:** the onboarding "business type" selector (already
recommended in the earlier chunk reports, and now formalized here) isn't
cosmetic — it sets default enabled apps, default dashboard widgets, default
receipt template, and default automation rules. This is genuinely new
platform work (feature-flag/template system), not something Odoo provides.

---

# 5. Merchant Psychology

Five behavioral truths that should override "best practice ERP design"
whenever they conflict:

1. **Loss aversion beats gain-framing.** "You're about to run out of Maggi
   noodles" converts better than "Maggi noodles reorder suggestion
   available." Frame alerts as prevention, not opportunity.
2. **Trust is built at the counter, not the dashboard.** A merchant decides
   whether software is "good" in the first 10 seconds of their first real
   sale, under a real queue. Onboarding polish matters less than counter
   speed.
3. **Cash is the mental model, not accounting.** Merchants think in "how
   much cash do I have right now," not "what's my balance sheet." Every
   money screen should default to a cash-first view.
4. **WhatsApp is not a channel, it's the primary interface for many
   merchants' customer relationships already.** Any feature that touches
   the customer (receipt, reminder, offer) should assume WhatsApp is the
   default delivery method, SMS the fallback, email an afterthought — the
   inverse of how most software prioritizes these.
5. **Owed money is emotionally loaded.** Udhaar/credit-book UX must never
   feel punitive or embarrassing toward the customer being tracked — this
   is a relationship tool between shopkeeper and regular customer, not a
   collections product. Khatabook's success is partly because it never
   feels like a debt-collection app.

---

# 6. User Journeys

## 6.1 Onboarding → First Sale (must be under 10 minutes, phone-only)

```
Sign up (phone OTP only, no email/password required)
  ↓
"What kind of shop do you run?" — one tap (drives all defaults, §4)
  ↓
Shop name + city (nothing else mandatory)
  ↓
"Add your first 5 products" — camera-based barcode scan preferred over typing
  ↓
First sale — big "Start Selling" button, no config screens in between
  ↓
Receipt sent via WhatsApp automatically — this is the "aha" moment
  ↓
Everything else (GST number, logo, employees, credit book) is prompted
contextually later, never gates the first sale
```

This directly attacks the #1 complaint pattern across competitors (setup
friction). GST number, address, and business registration details should be
**optional at signup, required only when the first GST invoice is
generated** — most competitors force this upfront.

## 6.2 Daily operating loop (the 80% case, every day)

```
Open app → Home screen answers "how's today going" in one glance
  ↓
Sell (POS) — the single most-used screen, must open in under 2 seconds
  ↓
Customer walks in → search/recognize → sell → (if regular) auto-suggest
loyalty redemption or udhaar reminder if overdue
  ↓
End of day → one-tap "Close the day" — cash count, UPI reconciliation,
auto-generated summary sent to owner via WhatsApp even if they weren't
physically at the counter
```

## 6.3 Growth loop (weekly/monthly, owner-only)

```
Reports (3 numbers, not 30): Today/This week sales, profit, outstanding
credit
  ↓
"Grow Business" tab: reorder suggestions, dead stock, top customers to
re-engage, campaign suggestions
  ↓
One-tap actions: "Send offer to 40 customers who haven't visited in 30
days" — this is a paid, high-margin feature (see §16)
```

---

# 7. Navigation Redesign & Information Architecture

## 7.1 Reject ERP navigation entirely

Replace Odoo's module-first navigation with a workflow-first structure.
This is a **shop-portal only** change — nothing here touches Odoo's own
backend navigation, which shop owners should rarely if ever see directly.

| ❌ Old (ERP-first, ships today) | ✅ New (workflow-first) |
|---|---|
| Inventory | **Products** (part of "Manage Stock") |
| Sales | **Sell** |
| Purchase | **Receive Stock** |
| Accounting | **Money** (invoices, expenses, credit book, GST — unified) |
| Employees | **Staff** |
| (missing) | **Customers** (currently buried inside Sales/Contacts) |
| (missing) | **Grow** (reports + campaigns + reorder intelligence) |

## 7.2 Recommended top-level navigation

```
🏠  Home           — today's numbers, alerts, quick actions
🧾  Sell            — POS, opens instantly, always one tap away
📦  Stock           — products, receive stock, low-stock, barcode
👥  Customers       — profiles, credit book (udhaar), loyalty
💰  Money           — expenses, GST invoices, daily cash close
📈  Grow            — reports, campaigns, reorder suggestions
👨‍💼  Staff           — attendance, roles, permissions
🛒  Apps            — marketplace (enable/disable modules)
⚙️  Settings
```

Nine items, maximum. Anything not in this list lives one level deeper, never
in the primary nav — directly addressing the "feature sprawl" risk flagged
in the earlier chunk reports.

## 7.3 Home screen — replace metrics with answers

Reject generic ERP dashboard cards ("Products: 240", "Invoices: 12").
Replace with:

```
Today's Sales          ₹XX,XXX
Today's Profit (est.)  ₹X,XXX
─────────────────────────────
⚠ 4 products low on stock
⚠ ₹3,200 udhaar overdue from 2 customers
⚠ Subscription renews in 5 days
─────────────────────────────
[+ New Bill]  [+ Add Product]  [+ Add Customer]  [+ Record Expense]
```

Odoo gives us the underlying data for every number above (`pos.order`,
`stock.quant`, `account.move`, `res.partner`). **None of this requires new
Odoo modules** — it requires one new aggregation endpoint in
`platform-command` and one new portal screen. This is exactly the kind of
"thin UI over Odoo data" work that should be prioritized.

---

# 8. App Ecosystem — verified against Odoo 18 CE

This table is the single most important artifact in this document for
avoiding wasted engineering effort. Every row was checked against Odoo 18
Community Edition's actual 626-module catalog.

| App (merchant-facing name) | Odoo CE reality | Build classification |
|---|---|---|
| **Sell (POS)** | `point_of_sale` — full native support | UI simplification only (already in progress via `kirana_rebrand`) |
| **Stock / Products** | `stock` — full native support | UI simplification only (already in progress) |
| **Customers / CRM-lite** | `res.partner`, basic `crm` available in CE | Thin portal UI over existing data; segment/campaign logic is new |
| **Money / GST Invoicing** | `account` + `l10n_in` — full native support for basic invoicing | UI simplification; **advanced financial reports (P&L, balance sheet) are an Odoo Enterprise feature, not in CE** — do not promise "full accounting," promise "GST-correct billing + simple profit view" |
| **Staff / Employees** | `hr` (records, permissions), `hr_attendance` (check-in/out) — both native CE | UI simplification only |
| **Expenses** | `hr_expense` — full native support | UI simplification only, low priority for custom work |
| **Loyalty & Rewards** | `loyalty`, `pos_loyalty`, `sale_loyalty` — full native support, points/coupons/tiers | Install + one portal widget showing balance — **not a build project** |
| **SMS notifications** | `sms` + `sms_twilio` — native CE, ready Twilio connector | Config + trigger wiring (Odoo automated actions), not a build project |
| **Barcode scanning** | `barcodes` — native CE | Already shipping |
| **Barcode label printing** | **Not solved by Odoo CE** in a retail-shelf-label way | **Genuine new build** — real engineering priority |
| **WhatsApp messaging** | **Absent from Odoo CE entirely** (Enterprise-only in real Odoo) | **Genuine new build** — the single most consequential build decision in this document |
| **Credit Book (Udhaar)** | Underlying data exists (`account.move`, `res.partner`), no purpose-built UI anywhere in Odoo | **Genuine new build** — but it's a UI/read-model project, not a new accounting engine; must post through Odoo's real invoice/payment models so money has one source of truth |
| **Multi-branch** | `stock` supports multi-warehouse natively; cross-branch UX/reporting does not exist off the shelf | Mostly UI/aggregation work once needed — defer to Year 2 per §17 |
| **Shift/attendance scheduling** | `hr_attendance` covers check-in/out; true shift *planning* (`planning` module) — **verify CE vs Enterprise licensing on your specific Odoo build before committing to it in marketing copy** | Verify before promising |
| **Restaurant (tables/KDS)** | `pos_restaurant`, `pos_restaurant_loyalty` — native CE | Future vertical, install + simplify, not a build project |

**The strategic conclusion this table forces:** roughly two-thirds of the
"missing apps" identified in the earlier chunk-based reports are actually
one-day Odoo module installs plus a thin UI. The real 12-month engineering
budget should concentrate on four things: **WhatsApp, Credit Book UI,
Barcode label printing, and the automation/notification rule engine that
ties them together.** Everything else is configuration, not invention.

---

# 9. Marketplace Strategy

Merchants should never see "60 Odoo modules." They should see an **App
Store with 12–15 curated apps**, each with a one-line business benefit, not
a technical description.

Principles:
- Every app maps 1:1 to an Odoo module (or a small bundle of them) behind
  the scenes — this keeps the marketplace cheap to build (it's a catalog +
  install trigger against infrastructure we already have in
  `platform-command`) and cheap to extend (new Odoo CE module = new
  marketplace row, not a new subsystem).
- Apps are enable/disable, not install/uninstall, from the merchant's
  perspective — data is never destroyed by disabling (matches Odoo's own
  behavior of preserving data on module uninstall in most cases, but this
  needs explicit product-level confirmation copy so merchants trust it).
- Paid apps show price inline in the marketplace, never require a sales
  call — direct rejection of Petpooja and GoFrugal's biggest complaint
  (opaque, "contact sales" pricing).

---

# 10. Automation Opportunities

The automation layer is what turns "software that has data" into "software
that acts on your behalf" — this is a genuine differentiator because none
of the ten competitors reviewed do this well as a configurable, merchant-
facing rule engine (most hardcode a handful of fixed triggers, if any).

**Recommended v1 automation catalog** (each one = an Odoo `base.automation`
/ server action, triggered off events Odoo already fires):

| Trigger | Action | Why merchants love it |
|---|---|---|
| New customer created | WhatsApp welcome message | Feels premium, costs nothing to run |
| Sale completed | WhatsApp/SMS receipt + points-earned notice | Replaces paper receipts, drives loyalty visibility |
| Stock below threshold | Owner notification + supplier reorder draft | Prevents stockouts, Odoo's `stock.warehouse.orderpoint` already computes this |
| Customer credit overdue (configurable days) | Gentle WhatsApp reminder | Recovers cash without an awkward phone call |
| Customer inactive 30/60/90 days | Suggested win-back campaign | Direct revenue recovery, paid feature (§16) |
| Subscription renewal approaching | Owner notification | Reduces involuntary churn |

This should ship as a merchant-configurable rule builder eventually (toggle
on/off, adjust thresholds), not hardcoded — but v1 can ship as fixed,
sensible defaults per business-type template (§4) with a settings screen to
adjust thresholds, deferring the full visual rule-builder to Year 2.

---

# 11. Communication Engine

**This is the single highest-leverage genuine build in the entire roadmap.**
No competitor in the Indian retail-software space has clean, native,
default-on WhatsApp automation (Petpooja and GoFrugal treat it as an
integration add-on; Vyapar has basic WhatsApp bill-sharing but not
automated lifecycle messaging; Khatabook has it for reminders only, not for
a full retail stack).

**Scope for v1:**
- One unified template library (welcome, receipt, reward earned, credit
  reminder, low-stock owner alert, birthday) — editable by the merchant,
  pre-written well enough that most never touch it.
- WhatsApp primary, SMS automatic fallback (via Odoo's native `sms_twilio`
  connector — reuse, don't rebuild), email a distant third option.
- Delivery status + simple log ("47 receipts sent this week, 2 failed") —
  builds trust that the automation is actually working.
- Centralized cost control: platform buys WhatsApp/SMS capacity in bulk and
  either includes a monthly allowance per plan or sells credit top-ups —
  this is also a monetization lever (§16).

**Explicitly out of scope for v1:** two-way WhatsApp chat/support inbox,
WhatsApp catalog/commerce features, chatbot ordering. These are real Year-2
opportunities once the one-way lifecycle messaging is proven and adopted.

---

# 12. Loyalty Engine

**Reuse, don't build.** Odoo's `loyalty` + `pos_loyalty` modules already
implement points, tiered rewards, and coupon redemption directly inside the
POS checkout flow. The entire engineering scope here is:
1. One default loyalty program template created automatically at
   provisioning time (points-per-rupee, sensible default redemption
   threshold) — same pattern as the existing `pos.config` auto-creation.
2. A merchant-facing settings screen to adjust the rate (no Odoo backend
   exposure).
3. A customer-facing balance display at checkout and on the receipt
   (WhatsApp message, via §11).

This should be one of the fastest features shipped in the entire roadmap —
which is exactly why it should not be marketed as a "coming soon" headline
feature for long; ship it early and use the speed as a credibility signal
internally for the rest of the roadmap.

---

# 13. Credit Book (Udhaar)

The highest emotional-value feature for the Indian kirana segment
specifically (confirmed by Khatabook's scale — tens of millions of users on
a product that is *only* this feature plus a ledger).

**Product requirements:**
- Every customer profile shows outstanding balance prominently, framed
  neutrally ("Balance: ₹450"), never in red/alarming color by default.
- Record a credit sale and record a payment must both be **one-tap actions
  from the POS checkout screen itself**, not a separate app a cashier has
  to navigate to mid-sale.
- Automated reminders (via §11) are opt-in per customer, never blanket —
  a shopkeeper knows which regulars need a nudge and which don't, and the
  product must respect that judgment rather than automating it away
  entirely.
- Must post as real Odoo invoices/payments (`account.move`) under the hood
  — **not** a shadow ledger — so credit book numbers and GST/accounting
  numbers can never disagree with each other. This is a hard architectural
  requirement, not a nice-to-have: a second source of truth for money is
  the single fastest way to lose merchant trust permanently.

---

# 14. Barcode Experience

The second genuine build priority. Scanning already works (Odoo's
`barcodes` module). Two things are missing and neither exists cleanly in
Odoo CE:

1. **Unknown-barcode-to-new-product flow**: scan → not found → prefilled
   quick-add form (name, price, GST rate, opening stock) → done in under 20
   seconds, matching the "20-second product creation" bar the earlier
   workflow audit correctly identified.
2. **Label generation + printing**: generate a barcode for products that
   don't have a manufacturer barcode (common for loose items — vegetables,
   bulk grains, in-house repackaged goods) and print shelf/price labels.
   Decide print target early (thermal roll vs. A4 sheet) — this is a
   product decision, not just an engineering one, because it determines
   what hardware we tell merchants to buy, which affects our own support
   burden.

---

# 15. Reporting Experience

Reject Odoo's native reporting entirely for the merchant-facing product —
it's built for accountants, not shopkeepers, and every competitor complaint
about "too much/too advanced" reporting applies directly to raw Odoo
reports as well.

**v1 report set (all derivable from existing Odoo data, no new modules
needed):**
Today / Yesterday / This Week / This Month sales, profit estimate, top 10
products, worst 10 products (dead stock candidates), outstanding credit
total, low stock count, expense total.

That's it for v1. Resist the urge to add more reports before merchants ask
— this is a UX discipline decision, not a technical limitation.

---

# 16. Monetization & SaaS Packaging

## 16.1 What the competitive research actually tells us about pricing

- **Vyapar/Loyverse pattern**: genuinely useful free tier drives adoption;
  monetize advanced/operational features (inventory depth, employee
  management), not core billing.
- **Khatabook pattern (the most important insight in this research)**: the
  core product (ledger/credit book) stays free forever, and real revenue
  comes from **embedded financial services** — loans, credit lines, and
  payment/collections commissions layered on top of trusted transaction
  data. This is a fundamentally different revenue model than SaaS
  subscriptions, and it's available to us specifically *because* we'll have
  real, verified transaction and payment-history data per shop once Sell +
  Money are live.
- **Petpooja/GoFrugal anti-pattern**: opaque pricing and module-by-module
  upsell fees that "stack up" are the single most repeated complaint across
  both products. Never do this. Every price must be visible in the app
  before a merchant enables anything.

## 16.2 Recommended packaging

```
Starter (free or near-free — adoption driver)
  Sell + Stock + Customers, capped transaction volume or basic tier only

Growth  (₹799–999/month range, matches current Standard positioning)
  + Money (GST invoicing) + Loyalty + SMS allowance

Business (₹1,499–1,999/month range, matches current Premium positioning)
  + Staff + Credit Book + WhatsApp automation + Grow (reports/campaigns)

Add-ons (à la carte, transparent per-unit pricing, visible in-app)
  Extra WhatsApp/SMS credits · Barcode label printing · Multi-branch ·
  Advanced campaigns
```

## 16.3 Year-2 revenue expansion (do not build in year 1, but design data
model to not preclude it)

Once transaction history, credit-book behavior, and payment reliability
data exist per shop, the Khatabook-style embedded financial services layer
(working-capital loans, faster settlement, supplier financing) becomes a
legitimate, high-margin expansion — likely a bigger long-term revenue pool
than subscription fees themselves, based on how Khatabook itself monetizes.
This is a Year-2+ conversation with an actual lending/NBFC partner, not a
build item now, but the data architecture decisions made in Year 1
(especially keeping Credit Book as real Odoo accounting data, §13) directly
enable or block this later — which is exactly why §13's "single source of
truth" requirement is non-negotiable now.

---

# 17. Long-Term Roadmap (18 months)

| Phase | Timeframe | Focus | Ships |
|---|---|---|---|
| **Phase 0 — Foundation** | Already underway | Fix routing/branding, correct provisioning | (done, per prior engineering reports) |
| **Phase 1 — Workflow-first UX** | Months 1–3 | Navigation redesign (§7), Home screen redesign, business-type onboarding templates (§4) | The product stops feeling like Odoo |
| **Phase 2 — Near-free wins** | Months 2–4 (parallel with Phase 1) | Loyalty (§12), SMS (§11 partial), Expenses | Fast, low-risk feature velocity, builds team confidence |
| **Phase 3 — The real differentiators** | Months 4–8 | WhatsApp engine (§11), Credit Book (§13), Barcode label + quick-add flow (§14) | The features competitors don't have cleanly |
| **Phase 4 — Growth layer** | Months 7–10 | Reports v1 (§15), automation rule defaults (§10), win-back campaigns | Merchants start seeing revenue impact, not just convenience |
| **Phase 5 — Marketplace + packaging** | Months 9–12 | App marketplace (§9), pricing/packaging rollout (§16.2), staff/attendance | Monetization structure matures |
| **Phase 6 — Vertical expansion** | Months 12–15 | Pharmacy (batch/expiry UX), Electronics (serial/warranty UX), Mobile shop (IMEI/exchange UX) | TAM expansion within existing tech |
| **Phase 7 — Omnichannel + Restaurant** | Months 15–18 | Restaurant vertical (Odoo `pos_restaurant` reuse), evaluate online-store/omnichannel (Shopify POS-style) | New verticals, competitive parity with Petpooja/Shopify at the low end |
| **Ongoing, not phase-gated** | Year 2 discussion | Embedded financial services (§16.3), visual automation rule builder, multi-branch UX | Long-term moat, requires partner conversations, not just engineering |

---

# 18. Prioritized Feature Backlog

Scoring legend: Business Value / Dev Complexity / Revenue Impact / Merchant
Adoption / Competitive Advantage — each rated Low / Medium / High. ROI is a
synthesized call, not an average.

## P0 — Must exist before public launch

| Feature | Business Value | Dev Complexity | Revenue Impact | Merchant Adoption | Competitive Advantage | ROI |
|---|---|---|---|---|---|---|
| Navigation redesign (§7) | High | Low (UI only, reuses live Odoo data) | Medium (retention) | High | Medium | **Very High** |
| Business-type onboarding template (§4) | High | Medium | Medium | High | Medium | **High** |
| Home screen redesign (§7.3) | High | Low | Medium | High | Low | **Very High** |
| Credit Book v1 (§13) | High | Medium | High (retention/differentiation) | High (kirana segment) | High | **Very High** |
| WhatsApp receipts + welcome message (§11, subset) | High | Medium-High | Medium | Very High | High (no competitor does this cleanly) | **High** |
| Loyalty install + balance widget (§12) | Medium | Low (mostly config) | Medium | Medium | Medium | **Very High** (cheap) |
| Transparent in-app pricing / marketplace price visibility (§16.2) | High | Low | High | High | High (direct competitor weakness) | **Very High** |

## P1 — High priority, ship within 2 quarters of launch

| Feature | Business Value | Dev Complexity | Revenue Impact | Merchant Adoption | Competitive Advantage | ROI |
|---|---|---|---|---|---|---|
| Full WhatsApp automation engine (reminders, low-stock owner alerts, win-back) (§11) | High | High | High | High | Very High | **High** |
| Barcode quick-add + label printing (§14) | Medium-High | Medium-High | Low direct, high indirect (speed) | Medium-High | Medium | **High** |
| Reports v1 (§15) | Medium | Low | Low | High | Low | **High** |
| Automation defaults (reorder alerts, credit reminders) (§10) | Medium | Medium | Medium | Medium | Medium | **Medium-High** |
| Staff/attendance (`hr_attendance` UI) | Medium | Low | Low | Medium | Low | **Medium** |
| App marketplace UI (§9) | High (structural) | Medium | High (long-term) | Medium | Medium | **High** |

## P2 — Valuable, not urgent

| Feature | Business Value | Dev Complexity | Revenue Impact | Merchant Adoption | Competitive Advantage | ROI |
|---|---|---|---|---|---|---|
| Win-back campaign builder | Medium | Medium | Medium-High | Medium | Medium | **Medium-High** |
| Vertical UX packs (pharmacy/electronics/mobile) (§17 Phase 6) | Medium (TAM expansion) | Medium per vertical | Medium | Medium (segment-specific) | Medium | **Medium** |
| Multi-branch reporting | Medium | Medium-High | Medium (upsell) | Low today, grows over time | Low | **Medium** |
| Visual automation rule builder | Low-Medium | High | Low | Low (power-user feature) | Medium | **Low-Medium** |
| Restaurant vertical | Medium (new TAM) | Medium (mostly Odoo reuse) | Medium | New segment | Medium | **Medium** |

## P3 — Explicitly deferred, do not staff against these in the next 12 months

| Feature | Why deferred |
|---|---|
| Two-way WhatsApp chat/support inbox | Real feature, but v1 lifecycle messaging must prove adoption first |
| Full omnichannel/online store (Shopify POS-style) | Different buyer profile, different competitive set, premature before core retail loop is dominant in-market |
| Embedded lending/financial services | Requires an external NBFC/lending partner and a data trust track record — a Year-2+ business-development effort, not an engineering sprint |
| Advanced Enterprise-style financial reporting (P&L/balance sheet dashboards) | Not available in Odoo CE at all; building it from scratch is a multi-month accounting-engineering project that doesn't match this segment's actual need (§8) |
| AI-powered demand forecasting / pricing | Interesting, unproven ROI for this segment at this stage — revisit once 12+ months of real transaction data exists across many shops |

---

# 19. Final Product Blueprint — the one-page version

If an engineer, designer, or new hire reads nothing else, this is the
compressed version of everything above:

1. **We are Retail OS. Odoo is invisible.** Never expose Odoo terminology,
   branding, or module names anywhere a merchant can see.
2. **Reuse Odoo wherever Odoo already works** (POS, Stock, Loyalty, SMS,
   Expenses, HR/Attendance, GST invoicing) — simplify the view, don't
   rebuild the engine.
3. **Build only what Odoo doesn't have**: WhatsApp automation, Credit Book
   UX, barcode label/quick-add flow, and the automation/notification layer
   connecting them. This is where 80% of custom engineering hours should go.
4. **Navigate by what a merchant does** (Sell, Stock, Customers, Money,
   Grow, Staff), never by what Odoo calls its modules.
5. **Every price visible in-app, always** — this is a direct, cheap,
   permanent competitive advantage against the two most-repeated complaints
   in this entire competitive set (opaque pricing, stacking fees).
6. **Money has one source of truth** — Credit Book, GST invoices, and
   accounting must always be the same underlying Odoo records, never a
   parallel ledger, both for merchant trust today and to keep the door open
   for embedded financial services later.
7. **Ship fast where it's cheap (Loyalty, SMS, Expenses) to build momentum;
   spend real time where it's hard and where competitors are weak
   (WhatsApp, Credit Book, Barcode).**
8. **The 18-month arc**: fix the UX skeleton first (Phase 1–2), build the
   real differentiators next (Phase 3–4), monetize the structure (Phase
   5), then expand into verticals and channels (Phase 6–7) — in that order,
   not reversed.
