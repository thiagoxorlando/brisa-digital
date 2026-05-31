/**
 * Canonical BRL money formatter for BrisaHub.
 *
 * Always shows 2 decimal places — never rounds to whole reais.
 * Use this in server components, API routes, and any context where
 * the currency-specific helpers in feature files are not available.
 *
 * Client components may keep their local `brl()` function as long as
 * it uses minimumFractionDigits: 2 and maximumFractionDigits: 2.
 */
export function brl(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0) || 0);
}

/**
 * Plan price formatter — omits cents when the value is a whole number.
 * Use only for plan card / pricing display areas.
 * Financial transactions should still use brl().
 *
 * Examples:
 *   287   → "R$ 287"
 *   287.5 → "R$ 287,50"
 *   0     → "R$ 0"
 */
export function brlPlan(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * USD plan-price formatter — omits cents for whole-dollar values.
 * Use only for plan card / pricing display areas.
 *
 * Examples:
 *   29  → "$29"
 *   79  → "$79"
 *   9.9 → "$9.90"
 */
export function usdPlan(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * USD transaction formatter — always shows 2 decimal places.
 * Use for contract amounts and financial transactions in EN mode.
 *
 * Examples:
 *   1500     → "$1,500.00"
 *   29.99    → "$29.99"
 */
export function usd(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0) || 0);
}

/**
 * Language-aware money formatter for the talent portal.
 * EN mode → USD ($1,500.00), PT mode → BRL (R$ 1.500,00).
 * Display only — never affects stored values.
 */
export function fmtMoney(value: number | string | null | undefined, lang: string): string {
  return String(lang) === "en" ? usd(value) : brl(value);
}

/**
 * Parse a BRL input string (accepts both "9,59" and "9.59") and return
 * a number rounded to 2 decimal places.
 */
export function parseBRL(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(",", ".");
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
