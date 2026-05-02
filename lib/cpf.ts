export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeCpfCnpj(value: string | null | undefined): string {
  return digitsOnly(value).slice(0, 14);
}

export function isValidCpf(value: string | null | undefined): boolean {
  const d = digitsOnly(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // all-same digits
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(d[10]);
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const d = digitsOnly(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // all-same digits
  const calc = (digits: string, weights: number[]) => {
    const rem = digits.split("").reduce((s, c, i) => s + parseInt(c) * weights[i], 0) % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(d.slice(0, 12), w1) === parseInt(d[12]) &&
         calc(d.slice(0, 13), w2) === parseInt(d[13]);
}

export function isValidCpfCnpj(value: string | null | undefined): boolean {
  const d = normalizeCpfCnpj(value);
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
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
