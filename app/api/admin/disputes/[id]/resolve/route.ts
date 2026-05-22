import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { renderNotificationTemplate, type NotificationKey } from "@/lib/notificationTemplates";
import { brl } from "@/lib/brl";

type ResolutionAction = "release" | "refund" | "split" | "close";

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function toAmount(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function resultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function errorStatus(errorCode: string) {
  if (["dispute_not_found", "contract_not_found"].includes(errorCode)) return 404;
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
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
    .select("id, contract_id, status, reason, resolution_note")
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
      action,
      message: rpcError.message,
    });
    return NextResponse.json({ error: "Could not resolve dispute." }, { status: 500 });
  }

  const resolved = resultRecord(result);
  if (resolved.ok !== true) {
    const code = String(resolved.error ?? "resolution_failed");
    return NextResponse.json({ error: code, details: resolved }, { status: errorStatus(code) });
  }

  let workspaceOwnerId: string | null = null;
  if (contract?.workspace_id) {
    const { data: workspace } = await supabase
      .from("premium_workspaces")
      .select("owner_user_id")
      .eq("id", contract.workspace_id)
      .maybeSingle();
    workspaceOwnerId = workspace?.owner_user_id ?? null;
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
          ? "/talent/contracts"
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
