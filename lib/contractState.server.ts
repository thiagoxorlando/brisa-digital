/**
 * Server-side DB helpers that supply context for getContractComputedState().
 *
 * Rules:
 *   hasEscrowEvidence — only accepts wallet_transactions.type='escrow_lock'
 *     OR premium_agent_wallet_transactions.type='job_commitment' as valid proof.
 *     Never uses contract.status as a proxy for escrow evidence.
 *   getActiveDispute — returns the most recent open/under_review dispute row.
 *   batchGetActiveDisputes — same but for multiple contracts at once.
 *
 * Never import this module in client components.
 */

import { createServerClient } from "@/lib/supabase";
import type { DisputeStatus } from "@/lib/disputePolicy";

export type ActiveDisputeRow = {
  id: string;
  contract_id: string;
  status: DisputeStatus;
  opened_by: string | null;
  opened_at: string | null;
  reason: string | null;
  workspace_id: string | null;
};

/**
 * Returns true when a ledger entry proves that escrow funds were deposited.
 *
 * Accepted evidence:
 *   wallet_transactions.type = 'escrow_lock'          (Open Space + direct-pay Premium)
 *   premium_agent_wallet_transactions.type = 'job_commitment'  (agent-backed Premium)
 */
export async function hasEscrowEvidence(
  contractId: string,
  jobId: string | null,
): Promise<boolean> {
  const supabase = createServerClient({ useServiceRole: true });

  const [walletRes, agentRes] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("id")
      .eq("reference_id", contractId)
      .eq("type", "escrow_lock")
      .limit(1)
      .maybeSingle(),
    jobId
      ? supabase
          .from("premium_agent_wallet_transactions")
          .select("id")
          .eq("job_id", jobId)
          .eq("type", "job_commitment")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return Boolean(walletRes.data) || Boolean(agentRes.data);
}

/**
 * Returns the most recent open or under_review dispute for a single contract,
 * or null if none exists.
 */
export async function getActiveDispute(
  contractId: string,
): Promise<ActiveDisputeRow | null> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, status, opened_by, opened_at, reason, workspace_id")
    .eq("contract_id", contractId)
    .in("status", ["open", "under_review"])
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data as ActiveDisputeRow;
}

/**
 * Batch version: returns Map<contractId, ActiveDisputeRow> for all contracts
 * in the list that have an active dispute. Safe to call with an empty array.
 */
export async function batchGetActiveDisputes(
  contractIds: string[],
): Promise<Map<string, ActiveDisputeRow>> {
  if (contractIds.length === 0) return new Map();

  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, status, opened_by, opened_at, reason, workspace_id")
    .in("contract_id", contractIds)
    .in("status", ["open", "under_review"])
    .order("opened_at", { ascending: false });

  const map = new Map<string, ActiveDisputeRow>();
  for (const row of (data ?? []) as ActiveDisputeRow[]) {
    if (row.contract_id && !map.has(row.contract_id)) {
      map.set(row.contract_id, row);
    }
  }
  return map;
}
