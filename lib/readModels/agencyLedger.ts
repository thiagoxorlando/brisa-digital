/**
 * Agency (Open Space) ledger read model.
 *
 * Builds the normalized transaction list consumed by /agency/finances.
 * Single source of truth for escrow resolution logic shared between the
 * open-space finances page and any future premium owner finance view.
 */

import { resolveEscrowTxType } from "./contractLifecycle";

export const ESCROW_MATCH_WINDOW_MS = 5 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Canonical row type for the agency transaction ledger. */
export type AgencyLedgerRow = {
  id: string;
  kind?: "booking" | "wallet";
  bookingId?: string | null;
  href?: string;
  talent: string;
  job: string;
  amount: number;
  status: string;
  date: string;
  description?: string;
  withdrawalStatus?: string | null;
  adminNote?: string | null;
  processedAt?: string | null;
  provider?: string | null;
  providerStatus?: string | null;
};

type EscrowMatchContract = {
  id: string;
  booking_id?: string | null;
  payment_amount?: number | null;
  confirmed_at?: string | null;
  deposit_paid_at?: string | null;
  agency_signed_at?: string | null;
  status: string;
};

type WalletTxInput = {
  id: string;
  type: string | null;
  amount: number | null;
  description: string | null;
  created_at: string;
  idempotency_key?: string | null;
  status: string | null;
  provider: string | null;
  provider_status: string | null;
  admin_note?: unknown;
  processed_at?: unknown;
};

type AgentAllocTxInput = {
  id: string;
  type: string;
  amount: number | null;
  note: string | null;
  created_at: string;
};

// ── Escrow matcher ─────────────────────────────────────────────────────────────

/**
 * Matches an escrow_lock wallet_transaction to its originating contract.
 * Prefers idempotency_key (`escrow_${contractId}`); falls back to
 * amount + timestamp proximity within ESCROW_MATCH_WINDOW_MS.
 */
export function makeEscrowMatcher(contracts: EscrowMatchContract[]) {
  const byKey = new Map(contracts.map((c) => [`escrow_${c.id}`, c]));
  const fallbackMatched = new Set<string>();

  return function findEscrowContract(w: {
    amount: number | null;
    created_at: string;
    idempotency_key?: string | null;
  }): EscrowMatchContract | null {
    if (w.idempotency_key) {
      const keyed = byKey.get(w.idempotency_key);
      if (keyed) return keyed;
    }

    const txTime = new Date(w.created_at).getTime();
    const matches = contracts.filter((c) => {
      if (fallbackMatched.has(c.id)) return false;
      if (Math.abs(Number(c.payment_amount ?? 0) - Number(w.amount ?? 0)) > 0.01) return false;
      const lockDate = c.confirmed_at ?? c.deposit_paid_at ?? c.agency_signed_at;
      if (!lockDate) return false;
      return Math.abs(new Date(lockDate).getTime() - txTime) <= ESCROW_MATCH_WINDOW_MS;
    });

    if (matches.length !== 1) return null;
    fallbackMatched.add(matches[0].id);
    return matches[0];
  };
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Transforms pre-fetched wallet_transactions + contracts + agent allocation
 * entries into a sorted AgencyLedgerRow[].
 *
 * Called from /agency/finances. Pure transformer — no DB calls.
 */
export function buildAgencyWalletLedgerRows(
  walletTxs: WalletTxInput[],
  contracts: EscrowMatchContract[],
  agentAllocTxs: AgentAllocTxInput[],
): AgencyLedgerRow[] {
  const findEscrowContract = makeEscrowMatcher(contracts);

  const walletRows: AgencyLedgerRow[] = walletTxs.map((w) => {
    let status = w.type ?? "payment";
    let description = (w.description ?? "").replace(/ \(pendente\)/gi, "").trim() || undefined;
    let bookingId: string | null = null;

    if (w.type === "deposit") {
      const normalized = (w.status ?? "").toLowerCase();
      if (["paid", "completed", "confirmed"].includes(normalized)) {
        status = normalized;
      } else if (normalized === "pending" || w.provider_status === "pending_checkout") {
        status = "pending";
      } else {
        status = "deposit";
      }
    }

    if (status === "escrow_lock") {
      const contract = findEscrowContract(w);
      bookingId = contract?.booking_id ?? null;
      if (contract) {
        const resolved = resolveEscrowTxType(contract.status);
        if (resolved !== "escrow_lock") {
          status = resolved;
          description = resolved === "escrow_released" ? "Pagamento ao talento" : "Estorno · reembolso";
        }
      }
    }

    return {
      id: w.id,
      kind: "wallet" as const,
      talent: "",
      job: "",
      amount: w.amount ?? 0,
      status,
      date: w.created_at,
      description,
      bookingId,
      href: bookingId ? `/agency/bookings?booking_id=${bookingId}` : undefined,
      withdrawalStatus: w.type === "withdrawal" ? (w.status ?? null) : undefined,
      adminNote: w.type === "withdrawal" ? ((w as Record<string, unknown>).admin_note as string | null ?? null) : undefined,
      processedAt: w.type === "withdrawal" ? ((w as Record<string, unknown>).processed_at as string | null ?? null) : undefined,
      provider: w.provider ?? null,
      providerStatus: w.provider_status ?? null,
    };
  });

  const allocationRows: AgencyLedgerRow[] = agentAllocTxs.map((tx) => ({
    id: tx.id,
    kind: "wallet" as const,
    talent: "",
    job: "",
    amount: Number(tx.amount),
    status: tx.type === "allocation" ? "agent_allocation" : "agent_allocation_reversal",
    date: tx.created_at,
    description:
      tx.type === "allocation"
        ? tx.note ? `Alocação para agente · ${tx.note}` : "Alocação para agente"
        : tx.note ? `Retorno de saldo do agente · ${tx.note}` : "Retorno de saldo do agente",
  }));

  return [...walletRows, ...allocationRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

// ── Display helpers ────────────────────────────────────────────────────────────
// Single source of truth for transaction type/status labels and badge tones
// consumed by AgencyFinances and any future ledger views.

const LEDGER_LABEL: Record<string, string> = {
  paid:                      "Pago",
  completed:                 "Pago",
  confirmed:                 "Reservado",
  pending_payment:           "Aguardando pagamento",
  pending:                   "Pendente",
  cancelled:                 "Cancelado",
  deposit:                   "Depósito",
  payment:                   "Pagamento",
  withdrawal:                "Saque",
  escrow_lock:               "Custódia bloqueada",
  escrow_released:           "Pago ao talento",
  escrow_refunded:           "Reembolsado",
  refund:                    "Reembolso",
  agent_allocation:          "Alocação a agente",
  agent_allocation_reversal: "Retorno de agente",
};

const LEDGER_TONE: Record<string, string> = {
  paid:                      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  completed:                 "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed:                 "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending_payment:           "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  pending:                   "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  cancelled:                 "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  deposit:                   "bg-teal-50    text-teal-700    ring-1 ring-teal-100",
  payment:                   "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  withdrawal:                "bg-blue-50    text-blue-700    ring-1 ring-blue-100",
  escrow_lock:               "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  escrow_released:           "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  escrow_refunded:           "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  refund:                    "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  agent_allocation:          "bg-indigo-50  text-indigo-700  ring-1 ring-indigo-100",
  agent_allocation_reversal: "bg-teal-50    text-teal-700    ring-1 ring-teal-100",
};

export function ledgerEntryLabel(key: string): string {
  return LEDGER_LABEL[key] ?? key;
}

export function ledgerEntryTone(key: string): string {
  return LEDGER_TONE[key] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
}
