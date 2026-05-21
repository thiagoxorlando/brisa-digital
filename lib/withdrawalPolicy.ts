/**
 * Canonical withdrawal policy rules for BrisaHub.
 *
 * Pure functions — no DB calls, no side effects. Used by API routes, UI
 * components (fee previews), and admin tooling. Plug into the existing
 * `lib/withdrawal-fee.ts` helper for the actual fee math.
 *
 * Policy summary:
 *   - Agencies are charged a withdrawal fee: max(min_fee, amount * pct/100)
 *   - Talents withdraw their wallet balance with NO fee (fee_amount = 0)
 *   - Unknown roles are conservatively treated as non-fee (no charge)
 *   - Payout delay (`payout_delay_days`) applies ONLY to agencies
 *
 * All math goes through `calculateWithdrawalFee` from lib/withdrawal-fee.ts.
 */

import { calculateWithdrawalFee } from "@/lib/withdrawal-fee";

export type WithdrawalUserRole = "agency" | "talent" | "unknown";

/**
 * Returns true if a withdrawal fee may be charged for the given role.
 * Only agencies are subject to the platform withdrawal fee.
 */
export function isWithdrawalFeeApplicable(userRole: WithdrawalUserRole): boolean {
  return userRole === "agency";
}

/**
 * Returns true if the payout-delay rule should apply for the given role.
 * Per Policy 2: talents withdraw immediately. Only agencies can be delayed.
 */
export function isPayoutDelayApplicable(userRole: WithdrawalUserRole): boolean {
  return userRole === "agency";
}

export type WithdrawalFeePreview = {
  gross: number;
  fee: number;
  net: number;
};

/**
 * Pure preview helper — given a gross amount and fee settings, returns
 * { gross, fee, net } for UI display. Use this in client components to
 * render the breakdown BEFORE the user confirms the withdrawal.
 */
export function getWithdrawalFeePreview(
  amount: number,
  feePercent: number,
  minFee: number,
): WithdrawalFeePreview {
  const gross = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const fee = calculateWithdrawalFee(gross, {
    withdrawal_fee_percent: feePercent,
    withdrawal_min_fee: minFee,
  });
  const net = Math.max(0, Number((gross - fee).toFixed(2)));
  return { gross: Number(gross.toFixed(2)), fee: Number(fee.toFixed(2)), net };
}

/**
 * Role-aware preview — talents always see fee = 0. Use in shared UI that
 * may render for either role.
 */
export function getRoleAwareWithdrawalFeePreview(
  userRole: WithdrawalUserRole,
  amount: number,
  feePercent: number,
  minFee: number,
): WithdrawalFeePreview {
  if (!isWithdrawalFeeApplicable(userRole)) {
    const gross = Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
    return { gross, fee: 0, net: gross };
  }
  return getWithdrawalFeePreview(amount, feePercent, minFee);
}
