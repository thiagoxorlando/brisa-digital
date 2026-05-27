import { digitsOnly } from "./cpf";

export function normalizeAsaasExpiryMonth(value: string | null | undefined): string {
  return digitsOnly(String(value ?? "")).slice(0, 2);
}

export function normalizeAsaasExpiryYear(value: string | null | undefined): string {
  const digits = digitsOnly(String(value ?? ""));

  if (digits.length === 2) {
    return `20${digits}`;
  }

  return digits.slice(0, 4);
}

export function isValidAsaasExpiryMonth(value: string | null | undefined): boolean {
  const month = normalizeAsaasExpiryMonth(value);

  if (month.length !== 2) return false;

  const monthNumber = Number(month);
  return monthNumber >= 1 && monthNumber <= 12;
}

export function isValidAsaasExpiryYear(value: string | null | undefined): boolean {
  return normalizeAsaasExpiryYear(value).length === 4;
}

export function isValidAsaasExpiryDate(
  monthValue: string | null | undefined,
  yearValue: string | null | undefined,
  now = new Date(),
): boolean {
  const month = normalizeAsaasExpiryMonth(monthValue);
  const year = normalizeAsaasExpiryYear(yearValue);

  if (!isValidAsaasExpiryMonth(month) || !isValidAsaasExpiryYear(year)) {
    return false;
  }

  const expiryMonth = Number(month);
  const expiryYear = Number(year);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return expiryYear > currentYear || (expiryYear === currentYear && expiryMonth >= currentMonth);
}

export function isLikelyEmail(value: string | null | undefined): boolean {
  const trimmed = String(value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
