import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    status?: string;
    note?: string;
  };
  const nextStatus = body.status?.trim();
  const note = body.note?.trim() ?? "";

  if (!id || nextStatus !== "under_review") {
    return NextResponse.json({ error: "Only under_review is supported here." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: dispute, error: disputeError } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, status")
    .eq("id", id)
    .maybeSingle();

  if (disputeError) {
    console.error("[admin/dispute-status] load failed", disputeError.message);
    return NextResponse.json({ error: "Could not load dispute." }, { status: 500 });
  }

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  if (dispute.status !== "open") {
    return NextResponse.json({ error: "Only open disputes can move to under review." }, { status: 409 });
  }

  const { error } = await supabase
    .from("contract_disputes")
    .update({ status: "under_review" })
    .eq("id", id)
    .eq("status", "open");

  if (error) {
    console.error("[admin/dispute-status] update failed", error.message);
    return NextResponse.json({ error: "Could not update dispute." }, { status: 500 });
  }

  if (note) {
    await supabase.from("contract_dispute_notes").insert({
      dispute_id: id,
      admin_user_id: auth.userId,
      visibility: "internal",
      body: note,
    });
  }

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, workspace_id")
    .eq("id", dispute.contract_id)
    .maybeSingle();

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
    const tpl = renderNotificationTemplate("dispute_under_review", {
      contractId: contract.id.slice(0, 8),
      disputeId: id,
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
          tpl.body,
          link,
          `dispute-under-review:${id}:${userId}`,
        );
      }),
    ).catch((notifyError) => {
      console.error("[admin/dispute-status] notify failed", notifyError);
    });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "dispute_under_review",
    entityType: "contract_dispute",
    entityId: id,
    before: { status: "open" },
    after: { status: "under_review", note: note || null },
  });

  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${id}`);

  return NextResponse.json({ ok: true, status: "under_review" });
}
