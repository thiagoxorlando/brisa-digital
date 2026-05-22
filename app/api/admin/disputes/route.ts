import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

type ContractForDispute = {
  id: string;
  agency_id: string | null;
  talent_id: string | null;
  talent_user_id?: string | null;
  workspace_id?: string | null;
  job_id: string | null;
};

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function notifyDisputeParties(params: {
  supabase: ReturnType<typeof createServerClient>;
  contract: ContractForDispute;
  disputeId: string;
  reason: string;
}) {
  const contractShort = params.contract.id.slice(0, 8);
  const tpl = renderNotificationTemplate("dispute_opened", {
    contractId: contractShort,
    disputeId: params.disputeId,
  });

  let workspaceOwnerId: string | null = null;
  if (params.contract.workspace_id) {
    const { data: workspace } = await params.supabase
      .from("premium_workspaces")
      .select("owner_user_id")
      .eq("id", params.contract.workspace_id)
      .maybeSingle();
    workspaceOwnerId = workspace?.owner_user_id ?? null;
  }

  const recipients = uniqueIds([
    params.contract.agency_id,
    params.contract.talent_user_id ?? params.contract.talent_id,
    workspaceOwnerId,
  ]);
  const talentUserId = params.contract.talent_user_id ?? params.contract.talent_id;

  await Promise.all(
    recipients.map((userId) => {
      const link = userId === talentUserId
        ? "/talent/contracts"
        : params.contract.workspace_id && userId === workspaceOwnerId
          ? "/agency/workspace/contracts"
          : "/agency/contracts";
      return notify(
        userId,
        tpl.channel,
        `${tpl.body} Motivo: ${params.reason}`,
        link,
        `dispute-opened:${params.disputeId}:${userId}`,
      );
    }),
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as {
    contractId?: string;
    reason?: string;
  };
  const contractId = body.contractId?.trim();
  const reason = body.reason?.trim();

  if (!contractId || !reason) {
    return NextResponse.json({ error: "contractId and reason are required." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, workspace_id, job_id")
    .eq("id", contractId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contractError) {
    console.error("[admin/disputes] contract lookup failed", contractError.message);
    return NextResponse.json({ error: "Could not load contract." }, { status: 500 });
  }

  if (!contract) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("contract_disputes")
    .select("id, status")
    .eq("contract_id", contractId)
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[admin/disputes] active lookup failed", existingError.message);
    return NextResponse.json({ error: "Could not check existing disputes." }, { status: 500 });
  }

  if (existing?.id) {
    return NextResponse.json({ ok: true, alreadyOpen: true, id: existing.id, status: existing.status });
  }

  const { data: dispute, error } = await supabase
    .from("contract_disputes")
    .insert({
      contract_id: contractId,
      workspace_id: contract.workspace_id ?? null,
      opened_by_user_id: auth.userId,
      reason,
      status: "open",
    })
    .select("id, status")
    .single();

  if (error || !dispute) {
    console.error("[admin/disputes] insert failed", error?.message);
    return NextResponse.json({ error: "Could not open dispute." }, { status: 500 });
  }

  await notifyDisputeParties({
    supabase,
    contract: contract as ContractForDispute,
    disputeId: dispute.id,
    reason,
  }).catch((notifyError) => {
    console.error("[admin/disputes] notify failed", notifyError);
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "dispute_opened",
    entityType: "contract_dispute",
    entityId: dispute.id,
    after: { contractId, status: "open", reason },
  });

  revalidatePath("/admin/disputes");

  return NextResponse.json({ ok: true, id: dispute.id, status: dispute.status });
}
