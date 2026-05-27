import { digitsOnly } from "./cpf";

function maskPhoneForLog(value: string) {
  if (!value) return "";
  if (process.env.NODE_ENV !== "production") return value;
  const suffix = value.slice(-4);
  return `${"*".repeat(Math.max(0, value.length - 4))}${suffix}`;
}

export function normalizeAsaasMobilePhone(phone: string | null | undefined): string {
  const originalPhone = String(phone ?? "").trim();
  let normalizedPhone = digitsOnly(originalPhone);

  if (normalizedPhone.startsWith("55") && normalizedPhone.length > 11) {
    normalizedPhone = normalizedPhone.slice(2);
  }

  console.log("[asaas phone] normalized", {
    originalPhone: maskPhoneForLog(originalPhone),
    normalizedPhone: maskPhoneForLog(normalizedPhone),
    length: normalizedPhone.length,
  });

  return normalizedPhone;
}

export function isValidAsaasMobilePhone(phone: string | null | undefined): boolean {
  const normalizedPhone = normalizeAsaasMobilePhone(phone);
  return normalizedPhone.length === 10 || normalizedPhone.length === 11;
}
