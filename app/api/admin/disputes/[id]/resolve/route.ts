import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { renderNotificationTemplate, type NotificationKey } from "@/lib/notificationTemplates";
import { brl } from "@/lib/brl";
import { validateSingleDispute } from "@/lib/disputeValidation.server";

type ResolutionAction = "release" | "refund" | "split" | "close";

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function toAmount(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function resultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function errorStatus(errorCode: string) {
  if (["dispute_not_found", "contract_not_found"].includes(errorCode)) return 404;
  if (
    [
      "invalid_escrow_amount",
      "invalid_split_amount",
      "split_requires_amount",
      "admin_note_required",
      "invalid_note_visibility",
      "missing_required_argument",
      "invalid_action",
      "talent_not_found",
      "agency_not_found",
      "talent_profile_not_found",
      "agency_profile_not_found",
    ].includes(errorCode)
  ) {
    return 422;
  }
  if (
    [
      "dispute_not_open",
      "contract_not_confirmed",
      "escrow_not_found",
      "payout_already_exists",
      "refund_already_exists",
      "split_exceeds_escrow",
    ].includes(errorCode)
  ) {
    return 409;
  }
  return 400;
}

function templateForAction(action: ResolutionAction): NotificationKey {
  if (action === "release") return "dispute_resolved_release";
  if (action === "refund") return "dispute_resolved_refund";
  return "dispute_closed";
}

function joinReasons(reasons: string[]) {
  return reasons.map((reason) => reason.trim()).filter(Boolean).join(" | ");
}

function integrityMessage(reasons: string[]) {
  const text = joinReasons(reasons).toLowerCase();
  if (text.includes("talento") && text.includes("workspace")) {
    return "Disputa invalida: talento nao pertence ao workspace.";
  }
  if (text.includes("workspace_id mismatch")) {
    return "Disputa invalida: workspace do contrato e da disputa nao conferem.";
  }
  if (text.includes("contrato")) {
    return "Disputa invalida: contrato nao encontrado ou inconsistente.";
  }
  return "Disputa invalida: revise os vinculos antes de resolver.";
}

function resolutionErrorMessage(errorCode: string, details: Record<string, unknown>) {
  switch (errorCode) {
    case "dispute_not_open":
      return "Esta disputa ja foi resolvida.";
    case "contract_not_confirmed":
      return "Contrato nao esta em custodia para esta resolucao.";
    case "escrow_not_found":
      return "Custodia nao encontrada para este contrato.";
    case "invalid_escrow_amount":
      return "Contrato sem saldo em custodia.";
    case "payout_already_exists":
      return "Este contrato ja possui pagamento registrado.";
    case "refund_already_exists":
      return "Este contrato ja possui reembolso registrado.";
    case "split_exceeds_escrow":
      return `A divisao excede a custodia disponivel (${brl(toAmount(details.escrow_amount))}).`;
    case "invalid_split_amount":
      return "Valores da divisao invalidos.";
    case "split_requires_amount":
      return "Informe ao menos um valor para a divisao.";
    case "talent_not_found":
    case "talent_profile_not_found":
      return "Talento vinculado ao contrato nao foi encontrado.";
    case "agency_not_found":
    case "agency_profile_not_found":
      return "Agencia vinculada ao contrato nao foi encontrada.";
    case "admin_note_required":
      return "Nota administrativa obrigatoria para resolver a disputa.";
    case "invalid_note_visibility":
      return "Visibilidade da nota invalida.";
    case "contract_not_found":
      return "Contrato da disputa nao foi encontrado.";
    case "dispute_not_found":
      return "Disputa nao encontrada.";
    default:
      return typeof details.error === "string" ? details.error : "Nao foi possivel resolver a disputa.";
  }
}

function rpcFailureMessage(rpcError: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}) {
  const rawParts = [rpcError.message, rpcError.details, rpcError.hint].filter(Boolean);
  const rawMessage = rawParts.join(" | ");
  const lowered = rawMessage.toLowerCase();

  if (lowered.includes("paid_by_user_id")) {
    return {
      error: "A migracao contracts.paid_by_user_id ainda nao foi aplicada.",
      adminMessage: "Execute supabase/manual/20260522_run_before_deploy.sql antes de resolver disputas.",
      errorCode: "schema_missing_paid_by_user_id",
      rawError: rawMessage,
    };
  }

  if (lowered.includes("resolve_contract_dispute") && lowered.includes("does not exist")) {
    return {
      error: "A RPC de resolucao de disputa nao esta instalada no banco.",
      adminMessage: "Execute supabase/manual/20260522_run_before_deploy.sql para criar resolve_contract_dispute().",
      errorCode: "rpc_missing_resolve_contract_dispute",
      rawError: rawMessage,
    };
  }

  return {
    error: "Falha interna ao resolver a disputa.",
    adminMessage: rawMessage || "Sem detalhes retornados pelo banco.",
    errorCode: "rpc_resolution_failed",
    rawError: rawMessage,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: ResolutionAction;
    note?: string;
    talentAmount?: number | string;
    agencyRefundAmount?: number | string;
    noteVisibility?: "internal" | "public";
  };
  const action = body.action;
  const note = body.note?.trim() ?? "";
  const noteVisibility = body.noteVisibility === "public" ? "public" : "internal";

  if (!id || !action || !["release", "refund", "split", "close"].includes(action)) {
    return NextResponse.json({ error: "Valid dispute id and action are required." }, { status: 400 });
  }

  if (note.length < 3) {
    return NextResponse.json({ error: "Admin note is required." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: before } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, workspace_id, status, reason, resolution_note")
    .eq("id", id)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, workspace_id")
    .eq("id", before.contract_id)
    .maybeSingle();

  const integrity = await validateSingleDispute(supabase, {
    id,
    contract_id: before.contract_id,
    workspace_id: (before as { workspace_id?: string | null }).workspace_id ?? null,
  });
  if (!integrity.isValid) {
    return NextResponse.json(
      {
        error: integrityMessage(integrity.invalidReasons),
        adminMessage: joinReasons(integrity.invalidReasons),
        invalidReasons: integrity.invalidReasons,
      },
      { status: 422 },
    );
  }

  const { data: result, error: rpcError } = await supabase.rpc("resolve_contract_dispute", {
    p_dispute_id: id,
    p_admin_user_id: auth.userId,
    p_action: action,
    p_admin_note: note,
    p_talent_amount: action === "split" ? toAmount(body.talentAmount) : null,
    p_agency_refund_amount: action === "split" ? toAmount(body.agencyRefundAmount) : null,
    p_note_visibility: noteVisibility,
  });

  if (rpcError) {
    console.error("[admin/dispute-resolve] rpc failed", {
      disputeId: id,
      contractId: before.contract_id,
      action,
      code: rpcError.code,
      message: rpcError.message,
      details: rpcError.details,
      hint: rpcError.hint,
    });
    return NextResponse.json(rpcFailureMessage(rpcError), { status: 500 });
  }

  const resolved = resultRecord(result);
  if (resolved.ok !== true) {
    const code = String(resolved.error ?? "resolution_failed");
    return NextResponse.json(
      {
        error: resolutionErrorMessage(code, resolved),
        errorCode: code,
        details: resolved,
      },
      { status: errorStatus(code) },
    );
  }

  let workspaceOwnerId: string | null = null;
  let workspaceSlug: string | null = null;
  if (contract?.workspace_id) {
    const { data: workspace } = await supabase
      .from("premium_workspaces")
      .select("owner_user_id, slug")
      .eq("id", contract.workspace_id)
      .maybeSingle();
    workspaceOwnerId = workspace?.owner_user_id ?? null;
    workspaceSlug = (workspace as { slug?: string | null } | null)?.slug ?? null;
  }

  if (contract) {
    const amount =
      action === "refund"
        ? toAmount(resolved.agency_refund_amount)
        : action === "release" || action === "split"
          ? toAmount(resolved.talent_amount)
          : 0;
    const tpl = renderNotificationTemplate(templateForAction(action), {
      contractId: contract.id.slice(0, 8),
      disputeId: id,
      amount: brl(amount),
    });
    const recipients = uniqueIds([
      contract.agency_id,
      contract.talent_user_id ?? contract.talent_id,
      workspaceOwnerId,
    ]);
    const talentUserId = contract.talent_user_id ?? contract.talent_id;

    await Promise.all(
      recipients.map((userId) => {
        const link = userId === talentUserId
          ? (workspaceSlug ? `/talent/workspaces/${workspaceSlug}/contracts` : "/talent/contracts")
          : contract.workspace_id && userId === workspaceOwnerId
            ? "/agency/workspace/contracts"
            : "/agency/contracts";
        return notify(
          userId,
          tpl.channel,
          action === "split"
            ? `A disputa do contrato ${contract.id.slice(0, 8)} foi resolvida com divisao: talento ${brl(toAmount(resolved.talent_amount))}, reembolso ${brl(toAmount(resolved.agency_refund_amount))}.`
            : tpl.body,
          link,
          `dispute-resolved:${id}:${action}:${userId}`,
        );
      }),
    ).catch((notifyError) => {
      console.error("[admin/dispute-resolve] notify failed", notifyError);
    });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: `dispute_${action}`,
    entityType: "contract_dispute",
    entityId: id,
    before: {
      status: before.status,
      resolution_note: before.resolution_note ?? null,
    },
    after: {
      status: resolved.status,
      action,
      talent_amount: resolved.talent_amount ?? null,
      agency_refund_amount: resolved.agency_refund_amount ?? null,
      referral_commission: resolved.referral_commission ?? null,
      platform_retained: resolved.platform_retained ?? null,
    },
    metadata: {
      contractId: before.contract_id,
      noteVisibility,
      payoutTransactionId: resolved.payout_transaction_id ?? null,
      refundTransactionId: resolved.refund_transaction_id ?? null,
    },
  });

  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${id}`);

  return NextResponse.json({ ok: true, result: resolved });
}
