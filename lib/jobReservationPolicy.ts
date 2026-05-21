/**
 * Canonical reservation policy for Premium workspace jobs.
 *
 * Pure formulas — no DB writes. The actual reservation ledger
 * (premium_agent_wallet_transactions: job_commitment / job_settlement /
 * job_release) lives in:
 *   - app/api/contracts/[id]/route.ts (agent_pay → job_settlement)
 *   - app/api/contracts/[id]/route.ts (cancel_job → job_release)
 *   - Premium job creation/edit routes (job_commitment)
 *
 * Lifecycle:
 *   1. Job creation → reserve `budgetPerTalent * talentsRequired`
 *      via job_commitment ledger entry (committed funds).
 *   2. Job edit → compute delta between old and new reservation:
 *        delta > 0 → reserve additional funds
 *        delta < 0 → release the difference back to available
 *   3. Job cancellation → release the entire unused reservation
 *      (job_release ledger entry; mirrors what app/api/contracts/[id]/route.ts
 *      already does on contract cancel).
 *   4. Talent payout (contract.pay or agent_pay) → consume the
 *      committed funds via job_settlement (committed → spent).
 *
 * Both owner-created and agent-created jobs use the same lifecycle. The
 * difference is that owner jobs draw from `profiles.wallet_balance` directly
 * whereas agent jobs draw from the agent's virtual allocation (committed
 * funds tracked in premium_agent_wallet_transactions).
 *
 * IMPORTANT: this file does not call wallet mutations. It only centralises
 * the formula. Wire callers to use `calculateJobReservation(...)` so the
 * formula is defined in exactly one place.
 */

export type ReservationDelta = {
  /** Funds to additionally reserve (positive number, 0 if releasing). */
  reserve: number;
  /** Funds to release back to available (positive number, 0 if reserving). */
  release: number;
  /** Signed net change in reservation = newReservation - oldReservation. */
  net: number;
};

/**
 * Total funds that must be reserved at job creation (or after edit).
 * Formula: budgetPerTalent * talentsRequired.
 */
export function calculateJobReservation(
  budgetPerTalent: number,
  talentsRequired: number,
): number {
  const budget = Number.isFinite(budgetPerTalent) && budgetPerTalent > 0
    ? budgetPerTalent
    : 0;
  const count = Number.isFinite(talentsRequired) && talentsRequired > 0
    ? Math.floor(talentsRequired)
    : 0;
  return Number((budget * count).toFixed(2));
}

/**
 * Compute the delta between an existing reservation and a new target
 * reservation. Use on job edit to determine how much to top up or release.
 */
export function calculateReservationDelta(
  oldReservation: number,
  newReservation: number,
): ReservationDelta {
  const oldR = Number.isFinite(oldReservation) ? oldReservation : 0;
  const newR = Number.isFinite(newReservation) ? newReservation : 0;
  const net = Number((newR - oldR).toFixed(2));
  return {
    reserve: net > 0 ? net : 0,
    release: net < 0 ? Math.abs(net) : 0,
    net,
  };
}
