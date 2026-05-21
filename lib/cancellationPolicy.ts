/**
 * Canonical cancellation / refund policy for booking contracts.
 *
 * Rule:
 *   - Before the job's scheduled date: cancellation auto-releases the
 *     escrow (no work performed, full refund).
 *   - On or after the job's scheduled date: cancellation enters a manual
 *     review state (dispute / partial refund flow) — autoRelease=false,
 *     requiresReview=true.
 *   - When the job has no scheduled date: treat as pre-work (auto release).
 *
 * Pure function — no side effects. Wire into the contract `cancel_job`
 * action so the gating lives in exactly one place.
 *
 * Dispute flow (future TODO — not yet implemented):
 *   When requiresReview=true, the API should NOT auto-call cancel_contract_safe
 *   to refund. Instead, mark the contract as "dispute_pending" and notify an
 *   admin to manually decide refund vs forfeit. See cancellation TODOs in
 *   app/api/contracts/[id]/route.ts (cancel_job action).
 */

export type CancellationContext = {
  status: string;
  job_date?: string | null;
  confirmed_at?: string | null;
};

export type CancellationOutcome = {
  /** true: refund/release immediately (pre-work). */
  autoRelease: boolean;
  /** true: hold for dispute / manual review (post-work). */
  requiresReview: boolean;
  reason: string;
};

export function getCancellationOutcome(
  ctx: CancellationContext,
  options: { now?: Date } = {},
): CancellationOutcome {
  const now = options.now ?? new Date();

  // No work date stored — treat as pre-work.
  if (!ctx.job_date) {
    return {
      autoRelease: true,
      requiresReview: false,
      reason: "No scheduled job date — treat as pre-work cancellation.",
    };
  }

  const jobDate = new Date(ctx.job_date);
  if (!Number.isFinite(jobDate.getTime())) {
    return {
      autoRelease: true,
      requiresReview: false,
      reason: "Invalid job_date — defaulting to auto-release.",
    };
  }

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

  if (jobUtcMidnight > todayUtcMidnight) {
    return {
      autoRelease: true,
      requiresReview: false,
      reason: "Cancellation before scheduled work date — auto release.",
    };
  }

  return {
    autoRelease: false,
    requiresReview: true,
    reason: "Cancellation on or after scheduled work date — requires manual review.",
  };
}
