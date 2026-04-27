export const WITHDRAWAL_FEE_RATE   = Number(process.env.WITHDRAWAL_FEE_RATE    ?? "0.03");
export const WITHDRAWAL_MIN_FEE    = Number(process.env.WITHDRAWAL_MIN_FEE     ?? "5.00");
// Controlled by NEXT_PUBLIC_MIN_WITHDRAW (client+server) or WITHDRAWAL_MIN_AMOUNT (server-only).
export const WITHDRAWAL_MIN_AMOUNT = Number(
  process.env.NEXT_PUBLIC_MIN_WITHDRAW ?? process.env.WITHDRAWAL_MIN_AMOUNT ?? "1",
);
