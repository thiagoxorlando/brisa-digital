/**
 * POST /api/admin/disputes/qa-create
 *
 * Admin-only endpoint that creates a QA test dispute immediately,
 * bypassing the job-date eligibility check that normally blocks
 * dispute creation before a job has taken place.
 *
 * SAFE GUARANTEES:
 *  - Admin auth required — inaccessible to agency/talent.
 *  - All workspace/talent/contract relationships are fully validated.
 *    Invalid disputes cannot be created even via this endpoint.
 *  - Does NOT mutate wallet balance.
 *  - Creates a real dispute row tagged with "[QA test]" in the reason.
 *  - Blocks payout on the contract (same as any real dispute).
 *  - Writes to audit log.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";
import { validateSingleDispute } from "@/lib/disputeValidation.server";

const QA_REASON_SUFFIX = "[QA test]";
const MIN_REASON_LENGTH = 10;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as {
    contract_id?: string;
    reason?: string;
  };

  const contractId = body.contract_id?.trim();
  const rawReason  = (body.reason ?? "Disputa criada pelo admin para fins de QA.").trim();

  if (!contractId) {
    return NextResponse.json({ error: "contract_id é obrigatório." }, { status: 400 });
  }
  if (rawReason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { error: `reason deve ter ao menos ${MIN_REASON_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  const reason = rawReason.endsWith(QA_REASON_SUFFIX)
    ? rawReason
    : `${rawReason} ${QA_REASON_SUFFIX}`;

  const supabase = createServerClient({ useServiceRole: true });

  // Load contract
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, workspace_id, job_id, status")
    .eq("id", contractId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  // Contract must be in a state where escrow can exist (confirmed or later, or signed for agent-backed)
  const eligibleStatuses = ["confirmed", "paid", "signed"];
  if (!eligibleStatuses.includes(contract.status ?? "")) {
    return NextResponse.json(
      {
        error: `Contrato com status "${contract.status}" não pode ter disputa de QA. Use um contrato em status: ${eligibleStatuses.join(", ")}.`,
      },
      { status: 422 },
    );
  }

  // Validate dispute integrity — even QA disputes must be valid
  const integrity = await validateSingleDispute(supabase, {
    id: "preview",
    contract_id: contractId,
    workspace_id: contract.workspace_id ?? null,
  });

  if (!integrity.isValid) {
    return NextResponse.json(
      {
        error: "Não é possível criar disputa QA: relacionamentos inválidos.",
        invalidReasons: integrity.invalidReasons,
      },
      { status: 422 },
    );
  }

  // Check no active dispute already exists
  const { data: existing } = await supabase
    .from("contract_disputes")
    .select("id, status")
    .eq("contract_id", contractId)
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json(
      { ok: true, alreadyOpen: true, id: existing.id, status: existing.status },
    );
  }

  // Create the dispute
  const { data: dispute, error: insertError } = await supabase
    .from("contract_disputes")
    .insert({
      contract_id:      contractId,
      workspace_id:     contract.workspace_id ?? null,
      opened_by_user_id: auth.userId,
      reason,
      status: "open",
    })
    .select("id, status")
    .single();

  if (insertError || !dispute) {
    console.error("[qa-create] insert failed", insertError?.message);
    return NextResponse.json({ error: "Não foi possível criar a disputa." }, { status: 500 });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "dispute_opened",
    entityType: "contract_dispute",
    entityId: dispute.id,
    after: { contractId, status: "open", reason, qa: true },
  });

  revalidatePath("/admin/disputes");

  return NextResponse.json({ ok: true, id: dispute.id, status: dispute.status, qa: true });
}
