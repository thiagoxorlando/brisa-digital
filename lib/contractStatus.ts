/**
 * Shared contract financial status and amount utilities.
 *
 * All pages that display contract status or financial amounts MUST use these
 * helpers instead of deriving values inline.
 */

export type ContractPaymentStatus =
  | "paid_to_wallet"
  | "escrow"
  | "signed"
  | "pending"
  | "cancelled"
  | "rejected";

type StatusLang = "pt-BR" | "en";

const STATUS_MAP: Record<string, ContractPaymentStatus> = {
  paid: "paid_to_wallet",
  confirmed: "escrow",
  signed: "signed",
  sent: "pending",
  cancelled: "cancelled",
  rejected: "rejected",
};

const STATUS_LABELS: Record<StatusLang, Record<ContractPaymentStatus, string>> = {
  "pt-BR": {
    paid_to_wallet: "Pago ao talento",
    escrow: "Em custódia",
    signed: "Aguardando depósito",
    pending: "Aguardando talento",
    cancelled: "Cancelado",
    rejected: "Rejeitado",
  },
  en: {
    paid_to_wallet: "Paid to talent",
    escrow: "In escrow",
    signed: "Awaiting deposit",
    pending: "Awaiting talent",
    cancelled: "Cancelled",
    rejected: "Rejected",
  },
};

const STATUS_TONES: Record<ContractPaymentStatus, string> = {
  paid_to_wallet: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  escrow: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  signed: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  pending: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
  cancelled: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-100",
};

export function getContractPaymentStatus(contract: {
  status: string;
  paid_at?: string | null;
}): ContractPaymentStatus {
  if (contract.paid_at && contract.status !== "cancelled" && contract.status !== "rejected") {
    return "paid_to_wallet";
  }
  return STATUS_MAP[contract.status] ?? "pending";
}

export function contractStatusLabel(status: ContractPaymentStatus, lang: StatusLang = "pt-BR"): string {
  return STATUS_LABELS[lang][status];
}

export function contractStatusTone(status: ContractPaymentStatus): string {
  return STATUS_TONES[status];
}

export type ContractLifecycleState =
  | "pending"
  | "signed"
  | "escrowed"
  | "paid"
  | "cancelled"
  | "rejected";

const LIFECYCLE_MAP: Record<string, ContractLifecycleState> = {
  sent:      "pending",
  signed:    "signed",
  confirmed: "escrowed",
  paid:      "paid",
  cancelled: "cancelled",
  rejected:  "rejected",
};

export function getContractLifecycleState(contract: { status: string }): ContractLifecycleState {
  return LIFECYCLE_MAP[contract.status] ?? "pending";
}

export function resolveContractAmounts(c: {
  payment_amount?: number | null;
  amount?: number | null;
  commission_amount?: number | null;
  commissionAmount?: number | null;
  net_amount?: number | null;
  netAmount?: number | null;
}): { gross: number; commission: number; net: number; commissionPct: number } {
  const gross = Number(c.payment_amount ?? c.amount ?? 0);
  const commission = Number(c.commission_amount ?? c.commissionAmount ?? 0);
  const net = Number(c.net_amount ?? c.netAmount ?? Math.max(0, gross - commission));
  const commissionPct = gross > 0 ? Math.round((commission / gross) * 100) : 0;
  return { gross, commission, net, commissionPct };
}
