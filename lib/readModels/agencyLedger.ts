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
  /** Job ID for job_commitment / job_release / job_settlement rows */
  related_job_id?: string | null;
  /** Contract ID for job_settlement rows — used to prevent double-counting */
  related_contract_id?: string | null;
  /** Job title resolved by caller — avoids extra DB call in the builder */
  job_title?: string | null;
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
 *
 * Double-count prevention for Premium reservation rows:
 *   - job_commitment / job_release are virtual (no real money moved) → always show
 *   - job_settlement means the agent paid the talent from reserved funds.
 *     A corresponding wallet_transactions row of type="payout" referencing the
 *     same contract_id is written at the same time. To avoid double-counting,
 *     job_settlement rows are skipped when a matching "payout" wallet_transaction
 *     exists for the same related_contract_id.
 */
export function buildAgencyWalletLedgerRows(
  walletTxs: WalletTxInput[],
  contracts: EscrowMatchContract[],
  agentAllocTxs: AgentAllocTxInput[],
): AgencyLedgerRow[] {
  const findEscrowContract = makeEscrowMatcher(contracts);

  // Build a set of contract IDs that already have a real payout row in wallet_transactions.
  // Used to skip job_settlement rows that would otherwise double-count.
  const payoutContractIds = new Set<string>(
    walletTxs
      .filter((w) => w.type === "payout" && w.description)
      .map((w) => {
        // wallet_transactions for payouts have idempotency_key = "payout_${contractId}"
        const key = (w as Record<string, unknown>).idempotency_key as string | null | undefined;
        if (key?.startsWith("payout_")) return key.slice("payout_".length);
        return null;
      })
      .filter((id): id is string => id !== null),
  );

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
        if (resolved === "escrow_released") {
          status = "escrow_released";
          description = "Pagamento ao talento";
        } else if (resolved === "escrow_refunded") {
          // The actual refund is a separate wallet_transaction of type="refund"
          // written atomically by cancel_contract_safe. This entry is the original
          // escrow being reversed — showing it as a refund would duplicate the real one.
          status = "escrow_cancelled";
          description = "Custódia cancelada";
        }
        // else: stays escrow_lock (active escrow)
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

  const allocationRows: AgencyLedgerRow[] = [];

  for (const tx of agentAllocTxs) {
    const jobSuffix = tx.job_title ? ` — ${tx.job_title}` : "";

    if (tx.type === "allocation") {
      allocationRows.push({
        id: tx.id,
        kind: "wallet" as const,
        talent: "",
        job: tx.job_title ?? "",
        amount: Number(tx.amount),
        status: "agent_allocation",
        date: tx.created_at,
        description: tx.note ? `Alocação para agente · ${tx.note}` : "Alocação para agente",
      });
      continue;
    }

    if (tx.type === "allocation_reversal") {
      allocationRows.push({
        id: tx.id,
        kind: "wallet" as const,
        talent: "",
        job: tx.job_title ?? "",
        amount: Number(tx.amount),
        status: "agent_allocation_reversal",
        date: tx.created_at,
        description: tx.note ? `Retorno de saldo do agente · ${tx.note}` : "Retorno de saldo do agente",
      });
      continue;
    }

    if (tx.type === "job_commitment") {
      allocationRows.push({
        id: tx.id,
        kind: "wallet" as const,
        talent: "",
        job: tx.job_title ?? "",
        amount: Number(tx.amount),
        status: "agent_job_commitment",
        date: tx.created_at,
        description: `Reserva por agente${jobSuffix}`,
      });
      continue;
    }

    if (tx.type === "job_release") {
      allocationRows.push({
        id: tx.id,
        kind: "wallet" as const,
        talent: "",
        job: tx.job_title ?? "",
        amount: Number(tx.amount),
        status: "agent_job_release",
        date: tx.created_at,
        description: `Liberação de reserva${jobSuffix}`,
      });
      continue;
    }

    if (tx.type === "job_settlement") {
      // Double-count prevention: skip if a real payout wallet_transaction
      // already exists for the same contract. The payout row is the
      // authoritative ledger entry for actual money movement.
      const contractId = tx.related_contract_id ?? null;
      if (contractId && payoutContractIds.has(contractId)) continue;

      allocationRows.push({
        id: tx.id,
        kind: "wallet" as const,
        talent: "",
        job: tx.job_title ?? "",
        amount: Number(tx.amount),
        status: "agent_job_settlement",
        date: tx.created_at,
        description: `Pagamento ao talento via agente${jobSuffix}`,
      });
      continue;
    }
  }

  return [...walletRows, ...allocationRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

// ── Display helpers ────────────────────────────────────────────────────────────
// Single source of truth for transaction type/status labels and badge tones
// consumed by AgencyFinances and any future ledger views.

// Map status keys → translation keys (ledger_*).
// Used by ledgerEntryLabel() to produce translatable labels.
const LEDGER_KEY: Record<string, string> = {
  paid:                      "ledger_paid",
  completed:                 "ledger_paid",
  confirmed:                 "ledger_confirmed",
  pending_payment:           "ledger_pending_payment",
  pending:                   "ledger_pending",
  cancelled:                 "ledger_cancelled",
  deposit:                   "ledger_deposit",
  payment:                   "ledger_payment",
  payout:                    "ledger_payout",
  withdrawal:                "ledger_withdrawal",
  escrow_lock:               "ledger_escrow_lock",
  escrow_released:           "ledger_escrow_released",
  escrow_cancelled:          "ledger_escrow_cancelled",
  escrow_refunded:           "ledger_escrow_refunded",
  refund:                    "ledger_refund",
  referral_commission:       "ledger_referral_commission",
  agent_allocation:          "ledger_agent_allocation",
  agent_allocation_reversal: "ledger_agent_allocation_reversal",
  agent_job_commitment:      "ledger_agent_job_commitment",
  agent_job_release:         "ledger_agent_job_release",
  agent_job_settlement:      "ledger_agent_job_settlement",
};

// PT fallback labels used when no translator is passed.
const LEDGER_LABEL_PT: Record<string, string> = {
  paid:                      "Pago",
  completed:                 "Pago",
  confirmed:                 "Reservado",
  pending_payment:           "Aguardando pagamento",
  pending:                   "Pendente",
  cancelled:                 "Cancelado",
  deposit:                   "Depósito",
  payment:                   "Pagamento",
  payout:                    "Pagamento ao talento",
  withdrawal:                "Saque",
  escrow_lock:               "Custódia bloqueada",
  escrow_released:           "Pago ao talento",
  escrow_cancelled:          "Custódia cancelada",
  escrow_refunded:           "Reembolsado",
  refund:                    "Reembolso",
  referral_commission:       "Comissão de indicação",
  agent_allocation:          "Alocação a agente",
  agent_allocation_reversal: "Retorno de agente",
  agent_job_commitment:      "Reserva por agente",
  agent_job_release:         "Liberação de reserva",
  agent_job_settlement:      "Pagamento via agente",
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
  payout:                    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  withdrawal:                "bg-blue-50    text-blue-700    ring-1 ring-blue-100",
  escrow_lock:               "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  escrow_released:           "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  escrow_cancelled:          "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  escrow_refunded:           "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  refund:                    "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  referral_commission:       "bg-cyan-50    text-cyan-700    ring-1 ring-cyan-100",
  agent_allocation:          "bg-indigo-50  text-indigo-700  ring-1 ring-indigo-100",
  agent_allocation_reversal: "bg-teal-50    text-teal-700    ring-1 ring-teal-100",
  agent_job_commitment:      "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  agent_job_release:         "bg-sky-50     text-sky-700     ring-1 ring-sky-100",
  agent_job_settlement:      "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
};

/** Returns the human-readable label for a ledger entry type.
 *  Pass the t() function from useT() to get the user's current language.
 *  Omitting t falls back to Portuguese. */
export function ledgerEntryLabel(key: string, t?: (k: string) => string): string {
  if (t) {
    const tKey = LEDGER_KEY[key];
    if (tKey) return t(tKey as never);
  }
  return LEDGER_LABEL_PT[key] ?? key;
}

export function ledgerEntryTone(key: string): string {
  return LEDGER_TONE[key] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
}
