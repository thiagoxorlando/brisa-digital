/**
 * Canonical lifecycle helper for Premium agent-created contract/job status.
 *
 * This is the single source of truth for determining whether a signed contract
 * is backed by an agent job_commitment reservation vs. truly awaiting deposit.
 *
 * Usage:
 *   const lifecycle = getPremiumContractLifecycle(contract, isAgentJobBacked);
 *   // lifecycle.label, lifecycle.tone, lifecycle.isAgentReserved, etc.
 *
 * Rule:
 *   If an agent job_commitment transaction exists for this job (isAgentJobBacked=true)
 *   AND the contract is in "signed" or "confirmed" state → status is "agent_reserved",
 *   NOT "signed" (Aguardando depósito).
 */

export type PremiumLifecycleStatus =
  | "pending"         // sent, awaiting talent
  | "signed"          // talent signed, no agent reservation, awaiting deposit
  | "agent_reserved"  // talent signed OR confirmed, agent commitment covers escrow
  | "confirmed"       // escrow confirmed (agency deposited directly)
  | "paid"            // payment released to talent wallet
  | "cancelled"
  | "rejected";

export type PremiumContractLifecycle = {
  /** Semantic lifecycle key */
  status: PremiumLifecycleStatus;
  /** Portuguese display label */
  label: string;
  /** Tailwind badge classes */
  tone: string;
  /** True when an agent job_commitment transaction covers this job */
  isAgentReserved: boolean;
  /** Whether "Pagar talento" action is currently available (owner only) */
  canPay: boolean;
  /** Whether cancel action is safe */
  canCancel: boolean;
  /** If an action is blocked, describes why */
  blockReason?: string;
};

/** Input shape — only the fields actually needed for lifecycle derivation. */
export type PremiumContractLifecycleInput = {
  /** contracts.status from DB */
  status: string;
  /** contracts.paid_at — set once when payment is released */
  paid_at?: string | null;
  /** contracts.deposit_paid_at — set when escrow is confirmed */
  deposit_paid_at?: string | null;
};

const LABELS: Record<PremiumLifecycleStatus, string> = {
  pending:        "Aguardando talento",
  signed:         "Aguardando depósito",
  agent_reserved: "Reservado pelo agente",
  confirmed:      "Em custódia",
  paid:           "Pago ao talento",
  cancelled:      "Cancelado",
  rejected:       "Rejeitado",
};

const TONES: Record<PremiumLifecycleStatus, string> = {
  pending:        "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
  signed:         "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  agent_reserved: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
  confirmed:      "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  paid:           "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled:      "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  rejected:       "bg-red-50 text-red-700 ring-1 ring-red-100",
};

/**
 * Derive the canonical lifecycle state for a Premium contract.
 *
 * @param contract       - Contract row fields needed for derivation
 * @param isAgentJobBacked - Whether a completed job_commitment transaction
 *                          exists for this contract's job in
 *                          premium_agent_wallet_transactions
 */
export function getPremiumContractLifecycle(
  contract: PremiumContractLifecycleInput,
  isAgentJobBacked: boolean,
): PremiumContractLifecycle {
  const rawStatus = contract.status ?? "sent";

  // Terminal states — agent reservation is irrelevant
  if (rawStatus === "cancelled") {
    return { status: "cancelled", label: LABELS.cancelled, tone: TONES.cancelled, isAgentReserved: false, canPay: false, canCancel: false };
  }
  if (rawStatus === "rejected") {
    return { status: "rejected", label: LABELS.rejected, tone: TONES.rejected, isAgentReserved: false, canPay: false, canCancel: false };
  }

  // Paid — lifecycle complete
  if (contract.paid_at || rawStatus === "paid") {
    return { status: "paid", label: LABELS.paid, tone: TONES.paid, isAgentReserved: isAgentJobBacked, canPay: false, canCancel: false };
  }

  // Confirmed / escrowed
  if (rawStatus === "confirmed" || contract.deposit_paid_at) {
    if (isAgentJobBacked) {
      // Agent-funded escrow: funds came from agent commitment, not direct deposit
      return {
        status: "agent_reserved",
        label: LABELS.agent_reserved,
        tone: TONES.agent_reserved,
        isAgentReserved: true,
        canPay: true,
        canCancel: true,
      };
    }
    return {
      status: "confirmed",
      label: LABELS.confirmed,
      tone: TONES.confirmed,
      isAgentReserved: false,
      canPay: true,
      canCancel: true,
    };
  }

  // Signed — talent accepted, awaiting escrow
  if (rawStatus === "signed") {
    if (isAgentJobBacked) {
      // Agent reservation covers the escrow — treat same as agent_reserved
      return {
        status: "agent_reserved",
        label: LABELS.agent_reserved,
        tone: TONES.agent_reserved,
        isAgentReserved: true,
        canPay: false, // Can't pay until confirmed by platform
        canCancel: true,
      };
    }
    return {
      status: "signed",
      label: LABELS.signed,
      tone: TONES.signed,
      isAgentReserved: false,
      canPay: false,
      canCancel: true,
    };
  }

  // Sent / pending — awaiting talent signature
  return {
    status: "pending",
    label: LABELS.pending,
    tone: TONES.pending,
    isAgentReserved: false,
    canPay: false,
    canCancel: true,
  };
}

/**
 * Talent-facing label for an agent-reserved or confirmed contract.
 * Both "agent_reserved" and "confirmed" map to "Em custódia" from the
 * talent's perspective — the distinction (who funded it) is irrelevant.
 */
export function talentFacingLabel(status: PremiumLifecycleStatus): string {
  if (status === "agent_reserved") return "Em custódia";
  return LABELS[status];
}

/**
 * Talent-facing tone for an agent-reserved or confirmed contract.
 */
export function talentFacingTone(status: PremiumLifecycleStatus): string {
  if (status === "agent_reserved") return TONES.confirmed; // indigo, same as escrow
  return TONES[status];
}
