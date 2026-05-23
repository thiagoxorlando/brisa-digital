/**
 * POST /api/contracts/[id]/dispute
 *
 * Self-service dispute creation for agencies and talents.
 *
 * WHO CAN OPEN:
 *  - Agency owner: contract.agency_id = user.id
 *  - Talent:       contract.talent_user_id = user.id
 *                  OR contract.talent_id = user.id (legacy)
 *                  + must be active Premium workspace member for Premium contracts
 *  - Workspace owner: premium_workspaces.owner_user_id = user.id
 *  - Active workspace agent: workspace_agents.user_id = user.id
 *    but only if the contract's job was created by them
 *  - Admin: always allowed
 *
 * ELIGIBILITY:
 *  - Contract must be in "confirmed" status (escrow locked).
 *  - No other active dispute (open / under_review) for this contract.
 *  - reason must be ≥ 20 characters.
 *
 * All relationships are validated via lib/disputeValidation.server before
 * inserting the row — invalid scopes are rejected.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { logAdminAction } from "@/lib/auditLog";
import { validateSingleDispute } from "@/lib/disputeValidation.server";
import { notify, notifyAdmins } from "@/lib/notify";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

const MIN_REASON_LENGTH = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractId } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = body.reason?.trim() ?? "";

  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { error: `O motivo deve ter ao menos ${MIN_REASON_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

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

  // Must be in confirmed status to dispute (escrow must be present)
  if (contract.status !== "confirmed") {
    return NextResponse.json(
      {
        error: `Apenas contratos em custódia (status "confirmed") podem ser disputados. Status atual: "${contract.status}".`,
      },
      { status: 422 },
    );
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  const isAgencyOwner   = contract.agency_id === user.id;
  const isTalent        = contract.talent_user_id === user.id || contract.talent_id === user.id;

  let isWorkspaceOwner  = false;
  let isWorkspaceAgent  = false;
  let isAdmin           = false;

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  isAdmin = profile?.role === "admin";

  if (contract.workspace_id && !isAgencyOwner && !isTalent && !isAdmin) {
    // Check workspace owner
    const { data: ws } = await supabase
      .from("premium_workspaces")
      .select("owner_user_id")
      .eq("id", contract.workspace_id)
      .maybeSingle();
    isWorkspaceOwner = ws?.owner_user_id === user.id;

    if (!isWorkspaceOwner) {
      // Check active workspace agent — and only for their own jobs
      const { data: agentRow } = await supabase
        .from("workspace_agents")
        .select("id")
        .eq("workspace_id", contract.workspace_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (agentRow && contract.job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("created_by_user_id")
          .eq("id", contract.job_id)
          .maybeSingle();
        isWorkspaceAgent = job?.created_by_user_id === user.id;
      }
    }
  }

  const isAuthorized = isAdmin || isAgencyOwner || isTalent || isWorkspaceOwner || isWorkspaceAgent;
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Você não tem permissão para abrir uma disputa neste contrato." },
      { status: 403 },
    );
  }

  // For Premium contracts, talent must be an active workspace member
  if (contract.workspace_id && isTalent && !isAdmin) {
    const { data: membership } = await supabase
      .from("premium_workspace_talents")
      .select("id, status")
      .eq("workspace_id", contract.workspace_id)
      .eq("talent_user_id", user.id)
      .is("removed_at", null)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "Você não tem vínculo ativo com este workspace Premium." },
        { status: 403 },
      );
    }
  }

  // ── Validate dispute integrity ────────────────────────────────────────────
  const integrity = await validateSingleDispute(supabase, {
    id: "preview",
    contract_id: contractId,
    workspace_id: contract.workspace_id ?? null,
  });

  if (!integrity.isValid) {
    return NextResponse.json(
      {
        error: "Este contrato tem relacionamentos inválidos. Contate o suporte.",
        invalidReasons: integrity.invalidReasons,
      },
      { status: 422 },
    );
  }

  // ── Duplicate check ───────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from("contract_disputes")
    .select("id, status")
    .eq("contract_id", contractId)
    .in("status", ["open", "under_review"])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json(
      { ok: true, alreadyOpen: true, id: existing.id, status: existing.status },
    );
  }

  // ── Insert dispute ────────────────────────────────────────────────────────
  const { data: dispute, error: insertError } = await supabase
    .from("contract_disputes")
    .insert({
      contract_id:       contractId,
      workspace_id:      contract.workspace_id ?? null,
      opened_by_user_id: user.id,
      reason,
      status: "open",
    })
    .select("id, status")
    .single();

  if (insertError || !dispute) {
    console.error("[contract/dispute] insert failed", insertError?.message);
    return NextResponse.json({ error: "Não foi possível abrir a disputa." }, { status: 500 });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const tpl = renderNotificationTemplate("dispute_opened", {
    contractId: contractId.slice(0, 8),
    disputeId:  dispute.id,
  });

  const notifyUsers = new Set<string>();
  if (contract.agency_id)     notifyUsers.add(contract.agency_id);
  if (contract.talent_user_id) notifyUsers.add(contract.talent_user_id);
  else if (contract.talent_id) notifyUsers.add(contract.talent_id);

  if (contract.workspace_id) {
    const { data: ws } = await supabase
      .from("premium_workspaces")
      .select("owner_user_id")
      .eq("id", contract.workspace_id)
      .maybeSingle();
    if (ws?.owner_user_id) notifyUsers.add(ws.owner_user_id);
  }

  notifyUsers.delete(user.id); // don't notify the opener

  await Promise.all([
    ...[...notifyUsers].map((uid) =>
      notify(uid, tpl.channel, `${tpl.body} Motivo: ${reason}`, "/disputes", `dispute-opened:${dispute.id}:${uid}`)
        .catch(() => {}),
    ),
    notifyAdmins(tpl.channel, `Nova disputa aberta: contrato ${contractId.slice(0, 8)}. Motivo: ${reason}`, "/admin/disputes")
      .catch(() => {}),
  ]);

  // ── Audit log ─────────────────────────────────────────────────────────────
  if (isAdmin) {
    await logAdminAction({
      adminId: user.id,
      action: "dispute_opened",
      entityType: "contract_dispute",
      entityId: dispute.id,
      after: { contractId, status: "open", reason },
    });
  }

  revalidatePath("/admin/disputes");

  return NextResponse.json({ ok: true, id: dispute.id, status: dispute.status });
}
