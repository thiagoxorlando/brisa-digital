export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeCpfCnpj(value: string | null | undefined): string {
  return digitsOnly(value).slice(0, 14);
}

export function isValidCpf(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 11;
}

export function isValidCpfCnpj(value: string | null | undefined): boolean {
  const length = normalizeCpfCnpj(value).length;
  return length === 11 || length === 14;
}

export function formatCpf(value: string | null | undefined): string {
  const digits = digitsOnly(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCpfCnpj(value: string | null | undefined): string {
  const digits = normalizeCpfCnpj(value);

  if (digits.length <= 11) {
    return formatCpf(digits);
  }

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
