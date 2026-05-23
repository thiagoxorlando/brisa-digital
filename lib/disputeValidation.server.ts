/**
 * Server-side dispute integrity validation.
 *
 * Accepts pre-loaded contract / job data plus a Supabase client and performs
 * the additional DB lookups needed for Premium workspace + talent membership
 * checks. All results are returned as plain objects — no DB calls outside this
 * module.
 *
 * DO NOT use this module on the client. Import only in Server Components,
 * API routes, or server actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateDisputeIntegrity,
  type DisputeIntegrityResult,
} from "./disputePolicy";

type DisputeRow = {
  id: string;
  contract_id: string;
  workspace_id: string | null;
};

type ContractRow = {
  id: string;
  workspace_id: string | null;
  agency_id: string | null;
  talent_id: string | null;
  talent_user_id: string | null;
  job_id: string | null;
  status: string | null;
};

type JobRow = {
  id: string;
  workspace_id: string | null;
};

export type DisputeValidationEntry = DisputeIntegrityResult & { disputeId: string };

/**
 * Validates multiple disputes in a single batch.
 *
 * - Makes at most 2 extra queries: one for Premium workspaces, one for
 *   talent memberships. Data is resolved in memory afterwards.
 *
 * @param supabase  Service-role client
 * @param disputes  Dispute rows to validate
 * @param contracts Map<contractId, ContractRow> — already loaded by the caller
 * @param jobs      Map<jobId, JobRow>           — already loaded by the caller
 */
export async function batchValidateDisputes(
  supabase: SupabaseClient,
  disputes: DisputeRow[],
  contracts: Map<string, ContractRow>,
  jobs: Map<string, JobRow>,
): Promise<Map<string, DisputeValidationEntry>> {
  const results = new Map<string, DisputeValidationEntry>();

  // Collect workspace IDs referenced by Premium disputes
  const premiumWsIds = new Set(
    disputes.map((d) => d.workspace_id).filter((id): id is string => !!id),
  );

  // Batch-load Premium workspace existence
  const workspaceExistsSet = new Set<string>();
  if (premiumWsIds.size > 0) {
    const { data: workspaces } = await supabase
      .from("premium_workspaces")
      .select("id")
      .in("id", [...premiumWsIds])
      .is("deleted_at", null);
    for (const w of workspaces ?? []) workspaceExistsSet.add(w.id);
  }

  // Batch-load talent memberships for all relevant workspace/talent pairs.
  // Key format: "{workspace_id}:{talent_user_id}"
  const membershipMap = new Map<string, { status: string; removed_at: string | null }>();
  if (premiumWsIds.size > 0) {
    const { data: memberships } = await supabase
      .from("premium_workspace_talents")
      .select("workspace_id, talent_user_id, status, removed_at")
      .in("workspace_id", [...premiumWsIds])
      .is("removed_at", null)
      .eq("status", "active");
    for (const m of memberships ?? []) {
      if (m.workspace_id && m.talent_user_id) {
        membershipMap.set(`${m.workspace_id}:${m.talent_user_id}`, m);
      }
    }
  }

  for (const dispute of disputes) {
    const contract = contracts.get(dispute.contract_id) ?? null;
    const job = contract?.job_id ? (jobs.get(contract.job_id) ?? null) : null;

    // Premium-specific lookups
    let premiumWorkspace: { id: string } | null | undefined = undefined;
    let talentWorkspaceMembership: { status: string; removed_at: string | null } | null | undefined = undefined;

    if (dispute.workspace_id) {
      premiumWorkspace = workspaceExistsSet.has(dispute.workspace_id)
        ? { id: dispute.workspace_id }
        : null;

      const talentUserId =
        contract?.talent_user_id ??
        contract?.talent_id ??
        null;

      if (talentUserId) {
        talentWorkspaceMembership =
          membershipMap.get(`${dispute.workspace_id}:${talentUserId}`) ?? null;
      }
      // If no talent ID on the contract, we cannot check membership → leave undefined
    }

    const result = validateDisputeIntegrity({
      dispute: { workspace_id: dispute.workspace_id, contract_id: dispute.contract_id },
      contract,
      job,
      premiumWorkspace,
      talentWorkspaceMembership,
    });

    results.set(dispute.id, { ...result, disputeId: dispute.id });
  }

  return results;
}

/**
 * Validates a single dispute — convenience wrapper for detail pages.
 */
export async function validateSingleDispute(
  supabase: SupabaseClient,
  dispute: DisputeRow,
): Promise<DisputeValidationEntry> {
  const { data: contractRow } = await supabase
    .from("contracts")
    .select("id, workspace_id, agency_id, talent_id, talent_user_id, job_id, status")
    .eq("id", dispute.contract_id)
    .maybeSingle();

  const contract = contractRow ?? null;

  let job: JobRow | null = null;
  if (contract?.job_id) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("id, workspace_id")
      .eq("id", contract.job_id)
      .maybeSingle();
    job = jobRow ?? null;
  }

  const contractMap = contract ? new Map([[contract.id, contract]]) : new Map<string, ContractRow>();
  const jobMap = job ? new Map([[job.id, job]]) : new Map<string, JobRow>();

  const resultMap = await batchValidateDisputes(supabase, [dispute], contractMap, jobMap);
  return resultMap.get(dispute.id) ?? {
    isValid: false,
    scope: "unknown",
    invalidReasons: ["Erro interno na validação"],
    disputeId: dispute.id,
  };
}
