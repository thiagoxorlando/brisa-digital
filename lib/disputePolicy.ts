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
  | "resolved_split"
  | "closed";

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open:             "Aberta",
  under_review:     "Em análise",
  resolved_refund:  "Resolvida (reembolso)",
  resolved_release: "Resolvida (liberação)",
  resolved_split:   "Resolvida (divisao)",
  closed:           "Encerrada",
};

export const DISPUTE_STATUS_TONE: Record<DisputeStatus, string> = {
  open:             "bg-red-50 text-red-700 ring-1 ring-red-100",
  under_review:     "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  resolved_refund:  "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
  resolved_release: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  resolved_split:   "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100",
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

// ─── Integrity validation ──────────────────────────────────────────────────

export type DisputeScope = "open_space" | "premium" | "unknown";

export type DisputeIntegrityResult = {
  isValid: boolean;
  scope: DisputeScope;
  /** Human-readable reasons; empty when isValid = true */
  invalidReasons: string[];
};

/**
 * All data needed to validate a single dispute's integrity.
 * All fields come from already-loaded DB rows — no DB calls here.
 *
 * - `undefined` means "not checked / not applicable"
 * - `null`      means "checked and not found"
 */
export type DisputeIntegrityInput = {
  dispute: {
    workspace_id: string | null;
    contract_id: string;
  };
  contract: {
    workspace_id: string | null;
    agency_id: string | null;
    talent_id: string | null;
    talent_user_id: string | null;
    job_id: string | null;
    status: string | null;
  } | null;
  job: { workspace_id: string | null } | null;
  /** null = workspace not found in DB */
  premiumWorkspace: { id: string } | null | undefined;
  /** null = talent has no active membership row */
  talentWorkspaceMembership: { status: string; removed_at: string | null } | null | undefined;
};

/**
 * Pure validation — no DB calls.
 *
 * Rules:
 *  OPEN SPACE — contract.workspace_id IS NULL, dispute.workspace_id IS NULL,
 *               job.workspace_id IS NULL.
 *  PREMIUM    — contract.workspace_id = dispute.workspace_id,
 *               job.workspace_id = contract.workspace_id (when present),
 *               workspace exists, talent is an active workspace member.
 */
export function validateDisputeIntegrity(
  input: DisputeIntegrityInput,
): DisputeIntegrityResult {
  const reasons: string[] = [];

  if (!input.contract) {
    return { isValid: false, scope: "unknown", invalidReasons: ["Contrato não encontrado"] };
  }

  const disputeWsId   = input.dispute.workspace_id;
  const contractWsId  = input.contract.workspace_id;
  const jobWsId       = input.job?.workspace_id ?? null;
  const isPremiumDispute  = Boolean(disputeWsId);
  const isPremiumContract = Boolean(contractWsId);
  const isPremiumJob      = Boolean(jobWsId);

  let scope: DisputeScope;

  if (!isPremiumDispute && !isPremiumContract && !isPremiumJob) {
    scope = "open_space";
  } else if (isPremiumDispute || isPremiumContract) {
    scope = "premium";
  } else {
    scope = "unknown";
    reasons.push("Escopo indeterminado: job tem workspace mas contrato/disputa não têm");
  }

  if (scope === "premium") {
    if (!disputeWsId) {
      reasons.push("dispute.workspace_id ausente para disputa Premium");
    }
    if (!contractWsId) {
      reasons.push("contract.workspace_id ausente para disputa Premium");
    }
    if (disputeWsId && contractWsId && disputeWsId !== contractWsId) {
      reasons.push(
        `workspace_id mismatch: disputa(${disputeWsId.slice(0, 8)}) ≠ contrato(${contractWsId.slice(0, 8)})`,
      );
    }
    if (jobWsId && contractWsId && jobWsId !== contractWsId) {
      reasons.push(
        `workspace_id mismatch: job(${jobWsId.slice(0, 8)}) ≠ contrato(${contractWsId.slice(0, 8)})`,
      );
    }
    if (input.premiumWorkspace === null) {
      reasons.push("Workspace Premium não encontrado no banco");
    }
    if (input.talentWorkspaceMembership === null) {
      reasons.push("Talento não tem vínculo ativo com este workspace Premium");
    } else if (
      input.talentWorkspaceMembership !== undefined &&
      (input.talentWorkspaceMembership.status !== "active" ||
        input.talentWorkspaceMembership.removed_at !== null)
    ) {
      reasons.push("Vínculo do talento com o workspace está inativo ou removido");
    }
  } else if (scope === "open_space") {
    if (isPremiumJob) {
      reasons.push("Disputa Open Space tem job vinculado a workspace Premium");
    }
  }

  return { isValid: reasons.length === 0, scope, invalidReasons: reasons };
}

/**
 * Returns true if this dispute is eligible for resolution (not invalid, not terminal).
 * Combines validity + lifecycle check.
 */
export function canAdminResolveDispute(
  status: DisputeStatus,
  integrityResult: DisputeIntegrityResult,
): { allowed: boolean; reason?: string } {
  if (!integrityResult.isValid) {
    return {
      allowed: false,
      reason: `Disputa inválida — revisar vínculos antes de resolver. ${integrityResult.invalidReasons.join("; ")}`,
    };
  }
  if (!canResolveDispute(status)) {
    return { allowed: false, reason: "Disputa já resolvida ou encerrada." };
  }
  return { allowed: true };
}
