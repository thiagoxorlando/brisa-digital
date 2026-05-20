/**
 * Enhanced contract lifecycle state derivation.
 *
 * Uses all stored fields — status, paid_at, signed_at, signed_contract_url,
 * deposit_paid_at, confirmed_at — so the lifecycle is never wrong because a
 * status column is stale or inconsistently set.
 *
 * This is the authoritative source for ContractLifecycleState. lib/contractStatus.ts
 * re-exports getContractLifecycleState from here.
 */

export type ContractLifecycleState =
  | "pending"    // sent, talent has not responded
  | "signed"     // talent signed, awaiting agency deposit
  | "escrowed"   // funds locked (confirmed)
  | "paid"       // payment released to talent wallet
  | "cancelled"
  | "rejected";

export type ContractLifecycleInput = {
  status: string;
  paid_at?: string | null;
  signed_at?: string | null;
  signed_contract_url?: string | null;
  deposit_paid_at?: string | null;
  confirmed_at?: string | null;
};

/**
 * Derives the canonical lifecycle state for a contract.
 *
 * Priority order (highest wins):
 *   cancelled / rejected → terminal states
 *   paid_at set OR status="paid" → paid (overrides any stuck status)
 *   status="confirmed" OR deposit_paid_at set → escrowed
 *   status="signed" OR signed_at/signed_contract_url set → signed
 *   default → pending
 */
export function getContractLifecycleState(c: ContractLifecycleInput): ContractLifecycleState {
  if (c.status === "cancelled") return "cancelled";
  if (c.status === "rejected") return "rejected";
  if (c.paid_at || c.status === "paid") return "paid";
  if (c.status === "confirmed" || c.deposit_paid_at) return "escrowed";
  if (c.status === "signed" || c.signed_at || c.signed_contract_url) return "signed";
  return "pending";
}

/**
 * Resolves an escrow wallet_transaction type based on the contract's final status.
 *
 * "paid"                  → escrow_released  (money went to talent)
 * "cancelled"/"rejected"  → escrow_refunded  (money returned to agency)
 * anything else           → escrow_lock      (still in custody)
 */
export function resolveEscrowTxType(
  contractStatus: string,
): "escrow_lock" | "escrow_released" | "escrow_refunded" {
  if (contractStatus === "paid") return "escrow_released";
  if (contractStatus === "cancelled" || contractStatus === "rejected") return "escrow_refunded";
  return "escrow_lock";
}
