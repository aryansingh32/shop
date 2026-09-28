/**
 * Retail POS payment methods — Cash, Card, UPI.
 *
 * Simple manual-confirm methods (no payment gateway / UI provider).
 * Idempotent: safe to call on every provision, backfill, and POS open.
 */

import { odooAdminExecute } from "./client";

export const RETAIL_PAYMENT_METHOD_NAMES = ["Cash", "Card", "UPI"] as const;

async function findOrCreatePaymentMethod(
  db: string,
  companyId: number,
  name: string,
  isCashCount: boolean,
): Promise<number | null> {
  try {
    const existing = await odooAdminExecute<{ id: number }[]>(
      db,
      "pos.payment.method",
      "search_read",
      [[["name", "=", name], ["company_id", "in", [companyId, false]]]],
      { fields: ["id"], limit: 1 },
    );
    if (existing.length > 0) return existing[0].id;

    return await odooAdminExecute<number>(db, "pos.payment.method", "create", [{
      name,
      is_cash_count: isCashCount,
      company_id: companyId,
    }]);
  } catch (err) {
    console.warn(`[ensureRetailPaymentMethods] Failed to ensure "${name}" on ${db}:`, err);
    return null;
  }
}

/**
 * Ensure Cash, Card, and UPI payment methods exist for a shop database.
 * Cash uses Odoo's existing cash method when present.
 */
export async function ensureRetailPaymentMethods(
  db: string,
  companyId: number,
): Promise<number[]> {
  const ids: number[] = [];

  // Cash — prefer Odoo's default cash method (is_cash_count=true)
  try {
    const cashMethods = await odooAdminExecute<{ id: number; name: string }[]>(
      db,
      "pos.payment.method",
      "search_read",
      [[["is_cash_count", "=", true]]],
      { fields: ["id", "name"], limit: 1 },
    );
    if (cashMethods.length > 0) {
      ids.push(cashMethods[0].id);
    } else {
      const cashId = await findOrCreatePaymentMethod(db, companyId, "Cash", true);
      if (cashId) ids.push(cashId);
    }
  } catch {
    const cashId = await findOrCreatePaymentMethod(db, companyId, "Cash", true);
    if (cashId) ids.push(cashId);
  }

  const cardId = await findOrCreatePaymentMethod(db, companyId, "Card", false);
  if (cardId) ids.push(cardId);

  const upiId = await findOrCreatePaymentMethod(db, companyId, "UPI", false);
  if (upiId) ids.push(upiId);

  return [...new Set(ids)];
}

/** Attach payment methods to all POS configs (additive, idempotent). */
export async function linkPaymentMethodsToPosConfigs(
  db: string,
  paymentMethodIds: number[],
): Promise<void> {
  if (paymentMethodIds.length === 0) return;

  const configs = await odooAdminExecute<{ id: number; payment_method_ids: number[] }[]>(
    db,
    "pos.config",
    "search_read",
    [[["active", "in", [true, false]]]],
    { fields: ["id", "payment_method_ids"] },
  );

  for (const cfg of configs) {
    const existing = new Set(cfg.payment_method_ids ?? []);
    const missing = paymentMethodIds.filter((id) => !existing.has(id));
    if (missing.length === 0) continue;
    await odooAdminExecute(db, "pos.config", "write", [
      [cfg.id],
      { payment_method_ids: [[6, 0, [...existing, ...missing]]] },
    ]);
  }
}

/** Enable auto-print receipt after payment on all POS configs. */
export async function ensurePosPrintDefaults(db: string): Promise<void> {
  const configs = await odooAdminExecute<{ id: number }[]>(
    db,
    "pos.config",
    "search_read",
    [[["active", "in", [true, false]]]],
    { fields: ["id"] },
  );
  if (configs.length === 0) return;

  await odooAdminExecute(db, "pos.config", "write", [
    configs.map((c) => c.id),
    {
      iface_print_auto: true,
      iface_print_skip_screen: true,
    },
  ]);
}
