/** Format INR with Indian numbering system. */
export function formatINR(amount: number | null | undefined, opts?: { withDecimals?: boolean }): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: opts?.withDecimals ? 2 : 0,
    minimumFractionDigits: opts?.withDecimals ? 2 : 0,
  }).format(amount);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN").format(n);
}
