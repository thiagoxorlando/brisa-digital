/**
 * Shared deposit/payment status helpers.
 * Covers Asaas deposit statuses used in admin finance views.
 */

const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  paid:       "Confirmado",
  pending:    "Pendente",
  processing: "Processando",
  failed:     "Falhou",
  cancelled:  "Cancelado",
};

const DEPOSIT_STATUS_TONE: Record<string, string> = {
  paid:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending:    "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  processing: "bg-cyan-50    text-cyan-700    ring-1 ring-cyan-100",
  failed:     "bg-red-50     text-red-600     ring-1 ring-red-100",
  cancelled:  "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

export function depositStatusLabel(status: string): string {
  return DEPOSIT_STATUS_LABEL[status] ?? status;
}

export function depositStatusTone(status: string): string {
  return DEPOSIT_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
}
