/**
 * Platform-wide contract computed state — single source of truth.
 *
 * Every page that needs to display contract status, financial amounts,
 * or action availability should call getContractComputedState() rather
 * than calling contractStatus.ts / premiumContractLifecycle.ts individually.
 *
 * Pure function — no DB calls. For DB-backed helpers (hasEscrowEvidence,
 * getActiveDispute) see lib/contractState.server.ts.
 */

import {
  getContractLifecycleState,
  type ContractLifecycleState,
  type ContractLifecycleInput,
} from "./readModels/contractLifecycle";
import {
  getContractPaymentStatus,
  contractStatusLabel,
  contractStatusTone,
  resolveContractAmounts,
  type ContractPaymentStatus,
} from "./contractStatus";
import {
  getPremiumContractLifecycle,
  isCustodyActive,
  talentFacingLabel,
  talentFacingTone,
  type PremiumContractLifecycleInput,
} from "./premiumContractLifecycle";
import {
  checkPaymentReleaseEligibility,
  checkDisputeBlockingPayout,
  type PaymentReleaseContext,
} from "./paymentReleasePolicy";
import { isDisputeBlockingPayout, type DisputeStatus } from "./disputePolicy";

// ─── Public types ───────────────────────────────────────────────────────────

export type ContractTimelineStep = {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
};

export type EscrowStatus = "none" | "locked" | "released" | "refunded";
export type PayoutStatus =
  | "not_ready"
  | "ready"
  | "blocked_dispute"
  | "blocked_agent_gate"
  | "done";

export type ContractComputedState = {
  /** Canonical lifecycle from readModels/contractLifecycle.ts */
  lifecycleStatus: ContractLifecycleState;
  /** Canonical financial status from contractStatus.ts */
  financialStatus: ContractPaymentStatus;
  /** Escrow phase */
  escrowStatus: EscrowStatus;
  /** Active dispute status, null when no active dispute */
  disputeStatus: DisputeStatus | null;
  /** Whether payout can proceed */
  payoutStatus: PayoutStatus;
  /** Canonical Portuguese display label */
  displayBadge: string;
  /** Canonical Tailwind badge classes */
  displayTone: string;
  /** Ordered timeline steps for contract lifecycle display */
  timelineSteps: ContractTimelineStep[];
  /** Whether a dispute can be opened (escrowed + no active dispute) */
  canOpenDispute: boolean;
  /** Whether the "pay talent" action is available */
  canPay: boolean;
  /** Whether a refund action is available */
  canRefund: boolean;
  /** Whether cancellation is available */
  canCancel: boolean;
  /** Gross (agency-pays) from stored payment_amount */
  grossAmount: number;
  /** Talent net from stored net_amount */
  netAmount: number;
  /** Current escrow lock amount (= gross when escrowed, else 0) */
  escrowAmount: number;
  /** Platform commission from stored commission_amount */
  commissionAmount: number;
  /** Commission as a rounded integer percentage */
  commissionPct: number;
  /** Whether escrow release is blocked by an active dispute */
  isEscrowBlocked: boolean;
  /** True when dispute status is open or under_review */
  hasActiveDispute: boolean;
  /** True when wallet_transactions.escrow_lock or job_commitment evidence exists */
  hasEscrowEvidence: boolean;
  /** Role that opened the dispute, if any */
  openedByRole: string | null;
  /** Role that released the payment, if any */
  paidByRole: string | null;
  /** Display name of whoever triggered payment release */
  paidByUserName: string | null;
  /** Whether contract belongs to a Premium workspace or Open Space */
  visibilityContext: "open_space" | "premium";
  /** True when an agent job_commitment covers the escrow */
  isAgentReserved: boolean;
};

// ─── Input types ────────────────────────────────────────────────────────────

export type ContractStateInput = ContractLifecycleInput &
  PaymentReleaseContext & {
    payment_amount?: number | null;
    commission_amount?: number | null;
    net_amount?: number | null;
    workspace_id?: string | null;
    paid_at?: string | null;
    deposit_paid_at?: string | null;
  };

export type ContractStateContext = {
  activeDispute?: { id: string; status: DisputeStatus; openedBy?: string } | null;
  hasEscrowEvidence?: boolean;
  isAgentJobBacked?: boolean;
  isInvitedAgent?: boolean;
  viewerRole?: "agency" | "talent" | "admin";
  openedByRole?: string | null;
  paidByRole?: string | null;
  paidByUserName?: string | null;
  manualPayOverride?: boolean;
};

// ─── Main function ──────────────────────────────────────────────────────────

export function getContractComputedState(
  contract: ContractStateInput,
  context: ContractStateContext = {},
): ContractComputedState {
  const {
    activeDispute = null,
    hasEscrowEvidence = false,
    isAgentJobBacked = false,
    isInvitedAgent = false,
    viewerRole,
    openedByRole = null,
    paidByRole = null,
    paidByUserName = null,
    manualPayOverride = false,
  } = context;

  const lifecycleStatus = getContractLifecycleState(contract);
  const financialStatus = getContractPaymentStatus(contract);
  const visibilityContext: "open_space" | "premium" = contract.workspace_id
    ? "premium"
    : "open_space";

  // Premium lifecycle (only for workspace contracts)
  const premiumLifecycle =
    visibilityContext === "premium"
      ? getPremiumContractLifecycle(
          contract as PremiumContractLifecycleInput,
          isAgentJobBacked,
        )
      : null;

  // Display badge & tone — premium uses its own label set, talent gets simplified view
  let displayBadge: string;
  let displayTone: string;
  if (premiumLifecycle) {
    if (viewerRole === "talent") {
      displayBadge = talentFacingLabel(premiumLifecycle.status);
      displayTone = talentFacingTone(premiumLifecycle.status);
    } else {
      displayBadge = premiumLifecycle.label;
      displayTone = premiumLifecycle.tone;
    }
  } else {
    displayBadge = contractStatusLabel(financialStatus);
    displayTone = contractStatusTone(financialStatus);
  }

  // Amounts — always from stored DB columns; never recalculate historically
  const { gross, commission, net, commissionPct } = resolveContractAmounts(contract);
  const escrowAmount = lifecycleStatus === "escrowed" ? gross : 0;

  // Dispute state
  const hasActiveDispute = Boolean(
    activeDispute && isDisputeBlockingPayout(activeDispute.status),
  );
  const disputeStatus = activeDispute?.status ?? null;
  const disputeBlock = checkDisputeBlockingPayout(activeDispute ?? null);
  const isEscrowBlocked = disputeBlock.blocked;

  // Payment release eligibility
  const paymentCheck = checkPaymentReleaseEligibility(contract, {
    manualOverride: manualPayOverride,
    isInvitedAgent,
  });

  // Actions
  const canOpenDispute = lifecycleStatus === "escrowed" && !hasActiveDispute;

  const canPay =
    !isEscrowBlocked &&
    paymentCheck.eligible &&
    lifecycleStatus === "escrowed" &&
    !hasActiveDispute &&
    (premiumLifecycle ? premiumLifecycle.canPay : true);

  const canRefund = !isEscrowBlocked && lifecycleStatus === "escrowed";

  const canCancel =
    lifecycleStatus !== "paid" &&
    lifecycleStatus !== "cancelled" &&
    lifecycleStatus !== "rejected" &&
    (premiumLifecycle ? premiumLifecycle.canCancel : true);

  // Escrow phase
  let escrowStatus: EscrowStatus;
  if (lifecycleStatus === "paid") {
    escrowStatus = "released";
  } else if (lifecycleStatus === "cancelled" || lifecycleStatus === "rejected") {
    escrowStatus = hasEscrowEvidence ? "refunded" : "none";
  } else if (
    lifecycleStatus === "escrowed" ||
    (isAgentJobBacked && lifecycleStatus === "signed")
  ) {
    escrowStatus = "locked";
  } else {
    escrowStatus = "none";
  }

  // Payout readiness
  let payoutStatus: PayoutStatus;
  if (lifecycleStatus === "paid") {
    payoutStatus = "done";
  } else if (hasActiveDispute) {
    payoutStatus = "blocked_dispute";
  } else if (!paymentCheck.eligible) {
    payoutStatus = "blocked_agent_gate";
  } else if (lifecycleStatus === "escrowed") {
    payoutStatus = "ready";
  } else {
    payoutStatus = "not_ready";
  }

  const timelineSteps = buildTimelineSteps(
    lifecycleStatus,
    isAgentJobBacked,
    visibilityContext,
  );

  return {
    lifecycleStatus,
    financialStatus,
    escrowStatus,
    disputeStatus,
    payoutStatus,
    displayBadge,
    displayTone,
    timelineSteps,
    canOpenDispute,
    canPay,
    canRefund,
    canCancel,
    grossAmount: gross,
    netAmount: net,
    commissionAmount: commission,
    commissionPct,
    escrowAmount,
    isEscrowBlocked,
    hasActiveDispute,
    hasEscrowEvidence,
    openedByRole,
    paidByRole,
    paidByUserName,
    visibilityContext,
    isAgentReserved: premiumLifecycle?.isAgentReserved ?? false,
  };
}

// ─── Timeline builder ───────────────────────────────────────────────────────

const LIFECYCLE_ORDER: ContractLifecycleState[] = [
  "pending",
  "signed",
  "escrowed",
  "paid",
];

function buildTimelineSteps(
  lifecycleStatus: ContractLifecycleState,
  isAgentJobBacked: boolean,
  visibilityContext: "open_space" | "premium",
): ContractTimelineStep[] {
  const custodyLabel =
    visibilityContext === "premium" && isAgentJobBacked
      ? "Reservado (agente)"
      : "Em custódia";

  const steps: Array<{ key: ContractLifecycleState; label: string }> = [
    { key: "pending", label: "Contrato enviado" },
    { key: "signed", label: "Assinado pelo talento" },
    { key: "escrowed", label: custodyLabel },
    { key: "paid", label: "Pagamento liberado" },
  ];

  const isTerminal =
    lifecycleStatus === "cancelled" || lifecycleStatus === "rejected";
  const currentIdx = LIFECYCLE_ORDER.indexOf(
    isTerminal ? "pending" : lifecycleStatus,
  );

  return steps.map((step, i) => ({
    key: step.key,
    label: step.label,
    completed: !isTerminal && i < currentIdx,
    active: !isTerminal && i === currentIdx,
  }));
}

// Re-export isCustodyActive so callers don't need two imports
export { isCustodyActive };
