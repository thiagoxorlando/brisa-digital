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
