/**
 * Canonical payment release eligibility for confirmed (escrowed) contracts.
 *
 * Rule:
 *   A contract is eligible for payment release ("pay" action) when:
 *     - status === "confirmed" (escrow is locked), AND
 *     - either:
 *         * job_date is null (no scheduled date — release any time), OR
 *         * job_date <= today (work date has arrived/passed), OR
 *         * the caller is the agency owner manually overriding the gate
 *           (the API route may pass `manualOverride: true` once the agency
 *            explicitly confirms early release in the UI).
 *
 * Pure function — no DB calls. Wire into the contract `pay` action so the
 * gating logic lives in exactly one place.
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
  options: { manualOverride?: boolean; now?: Date } = {},
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

  const jobDateRaw = contract.job_date;
  if (!jobDateRaw) {
    // No scheduled date — release is allowed any time.
    return { eligible: true };
  }

  const now = options.now ?? new Date();
  const jobDate = new Date(jobDateRaw);
  if (!Number.isFinite(jobDate.getTime())) {
    // Invalid stored date — fall back to allowing release rather than blocking.
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
    reason: "Job date has not arrived yet. Release manually if you wish to pay early.",
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
