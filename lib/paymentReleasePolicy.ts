/**
 * Canonical payment release eligibility for confirmed (escrowed) contracts.
 *
 * Rule:
 *   Everyone (open-space agencies, workspace owners, admins) can release early.
 *   EXCEPTION: invited workspace agents (premium workspace members who are not
 *   the workspace owner) are gated by job_date and require the owner to use
 *   the manual override to release before the work date.
 *
 * Pass `isInvitedAgent: true` only for callers identified as workspace agents.
 * Pure function — no DB calls.
 */

export type PaymentReleaseCheck = {
  eligible: boolean;
  reason?: string;
};

export type PaymentReleaseContext = {
  status: string;
  job_date?: string | null;
  confirmed_at?: string | null;
};

export function checkPaymentReleaseEligibility(
  contract: PaymentReleaseContext,
  options: { manualOverride?: boolean; now?: Date; isInvitedAgent?: boolean } = {},
): PaymentReleaseCheck {
  if (contract.status !== "confirmed") {
    return {
      eligible: false,
      reason: "Contract must be confirmed (escrowed) before payment release.",
    };
  }

  if (options.manualOverride === true) {
    return { eligible: true };
  }

  // Only invited workspace agents are gated by job date.
  // Open-space agencies, workspace owners, and admins can always release early.
  if (!options.isInvitedAgent) {
    return { eligible: true };
  }

  const jobDateRaw = contract.job_date;
  if (!jobDateRaw) {
    return { eligible: true };
  }

  const now = options.now ?? new Date();
  const jobDate = new Date(jobDateRaw);
  if (!Number.isFinite(jobDate.getTime())) {
    return { eligible: true };
  }

  // Compare at day granularity to avoid TZ off-by-one near midnight.
  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const jobUtcMidnight = Date.UTC(
    jobDate.getUTCFullYear(),
    jobDate.getUTCMonth(),
    jobDate.getUTCDate(),
  );

  if (jobUtcMidnight <= todayUtcMidnight) {
    return { eligible: true };
  }

  return {
    eligible: false,
    reason: "Pagamento antecipado precisa ser liberado pelo proprietário do workspace.",
  };
}

// ── Dispute blocking hook ─────────────────────────────────────────────────────
import { isDisputeBlockingPayout, type DisputeStatus } from "@/lib/disputePolicy";

/**
 * Centralised dispute payout gate. Pass the current open dispute (if any)
 * for the contract; returns `{ blocked: true, reason }` while the dispute
 * status is unresolved (`open` | `under_review`).
 *
 * The persistence layer is not yet built — callers can pass `null` until
 * the contract_disputes table exists. See lib/disputePolicy.ts.
 */
export function checkDisputeBlockingPayout(
  dispute: { status: DisputeStatus } | null,
): { blocked: boolean; reason?: string } {
  if (!dispute) return { blocked: false };
  if (isDisputeBlockingPayout(dispute.status)) {
    return {
      blocked: true,
      reason: "Pagamento bloqueado — há disputa aberta neste contrato.",
    };
  }
  return { blocked: false };
}
