import { getPlatformSettings } from "@/lib/platformSettings.server";

// Minimum withdrawal amount — controlled by env vars, used for UI validation.
// Not a platform_settings value; kept here for co-location with other withdrawal helpers.
export const WITHDRAWAL_MIN_AMOUNT = Number(
  process.env.NEXT_PUBLIC_MIN_WITHDRAW ?? process.env.WITHDRAWAL_MIN_AMOUNT ?? "1",
);

/**
 * Pure function — computes the withdrawal fee given an amount and settings.
 *
 * Formula: fee = max(withdrawal_min_fee, amount * withdrawal_fee_percent / 100)
 * Falls back to 0 if settings are missing or invalid.
 */
export function calculateWithdrawalFee(
  amount: number,
  settings: { withdrawal_fee_percent?: unknown; withdrawal_min_fee?: unknown },
): number {
  const feePercent = Number(settings.withdrawal_fee_percent ?? 0);
  const minFee = Number(settings.withdrawal_min_fee ?? 0);

  if (!Number.isFinite(feePercent) || feePercent < 0) return 0;
  if (!Number.isFinite(minFee) || minFee < 0) return 0;
  if (feePercent === 0 && minFee === 0) return 0;

  const percentageFee = amount * feePercent / 100;
  return Math.max(minFee, percentageFee);
}

/**
 * Async helper — fetches withdrawal fee settings from platform_settings
 * and returns the calculated fee for the given amount.
 */
export async function getWithdrawalFee(amount: number): Promise<number> {
  const settings = await getPlatformSettings([
    "withdrawal_fee_percent",
    "withdrawal_min_fee",
  ]);
  return calculateWithdrawalFee(amount, settings);
}
