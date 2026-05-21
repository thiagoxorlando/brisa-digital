/**
 * Dispute policy — single source of truth for contract dispute state.
 *
 * A dispute is opened when a contract cannot proceed via the normal lifecycle
 * (e.g. cancellation on/after the job date — see lib/cancellationPolicy.ts).
 *
 * Disputes block payout release: while a dispute is "open" or "under_review",
 * the `pay` action on /api/contracts/[id] must be blocked. See
 * checkDisputeBlockingPayout() in lib/paymentReleasePolicy.ts.
 *
 * The persistence layer (contract_disputes table) is not yet implemented —
 * this module defines the canonical types and gating logic so the admin UI
 * and API can be wired against a stable shape now.
 *
 * TODO(phase-disputes): create contract_disputes table with columns:
 *   id uuid pk, contract_id uuid fk, status text, opened_at timestamptz,
 *   opened_by uuid, reason text, resolved_at timestamptz null,
 *   resolved_by uuid null, resolution text null, created_at, updated_at.
 */

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_refund"
  | "resolved_release"
  | "closed";

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open:             "Aberta",
  under_review:     "Em análise",
  resolved_refund:  "Resolvida (reembolso)",
  resolved_release: "Resolvida (liberação)",
  closed:           "Encerrada",
};

export const DISPUTE_STATUS_TONE: Record<DisputeStatus, string> = {
  open:             "bg-red-50 text-red-700 ring-1 ring-red-100",
  under_review:     "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  resolved_refund:  "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
  resolved_release: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  closed:           "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
};

export type DisputeContext = {
  contractId: string;
  status: DisputeStatus;
  openedAt: string;
  openedBy: string;
  reason: string;
  resolvedAt?: string | null;
  resolution?: string | null;
};

/**
 * A dispute blocks payout release while it is unresolved.
 */
export function isDisputeBlockingPayout(disputeStatus: DisputeStatus): boolean {
  return disputeStatus === "open" || disputeStatus === "under_review";
}

/**
 * Only "open" and "under_review" disputes can be resolved by an admin.
 * Resolved/closed disputes are terminal.
 */
export function canResolveDispute(disputeStatus: DisputeStatus): boolean {
  return disputeStatus === "open" || disputeStatus === "under_review";
}

export function disputeStatusLabel(status: DisputeStatus): string {
  return DISPUTE_STATUS_LABEL[status] ?? status;
}

export function disputeStatusTone(status: DisputeStatus): string {
  return DISPUTE_STATUS_TONE[status] ?? DISPUTE_STATUS_TONE.closed;
}
