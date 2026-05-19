import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: submission, error: fetchErr } = await supabase
    .from("submissions")
    .select("id, job_id, talent_user_id, referrer_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let isOwningAgency = false;
  let isWorkspaceOwner = false;
  let isWorkspaceCreator = false;

  if (caller?.role === "agency" && submission.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("agency_id, workspace_id, created_by_user_id")
      .eq("id", submission.job_id)
      .single();

    if (job) {
      isOwningAgency = !job.workspace_id && job.agency_id === user.id;

      if (job.workspace_id) {
        const workspaceAccess = await getUserPremiumWorkspace(user.id);
        const belongsToWorkspace =
          workspaceAccess?.workspace.id === job.workspace_id &&
          workspaceAccess?.membership.status === "active";

        isWorkspaceOwner = Boolean(belongsToWorkspace && workspaceAccess?.membership.role === "owner");
        isWorkspaceCreator = Boolean(belongsToWorkspace && job.created_by_user_id === user.id);
      }
    }
  }

  let talentCanDelete = false;
  let talentDeleteReason: string | null = null;

  if (submission.talent_user_id === user.id) {
    const submissionStatus = String(submission.status ?? "").toLowerCase();
    const cancellableStatuses = new Set(["pending", "in_review"]);

    if (!cancellableStatuses.has(submissionStatus)) {
      talentDeleteReason = "Esta candidatura não pode mais ser cancelada.";
    } else {
      const { data: activeContract } = await supabase
        .from("contracts")
        .select("id")
        .eq("job_id", submission.job_id)
        .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`)
        .not("status", "in", '("cancelled","rejected")')
        .is("deleted_at", null)
        .maybeSingle();

      if (activeContract) {
        talentDeleteReason = "Já existe contrato vinculado a esta candidatura.";
      } else {
        talentCanDelete = true;
      }
    }
  }

  const canDelete =
    caller?.role === "admin" ||
    isOwningAgency ||
    isWorkspaceOwner ||
    isWorkspaceCreator ||
    talentCanDelete ||
    submission.referrer_id === user.id;

  if (!canDelete) {
    if (submission.talent_user_id === user.id && talentDeleteReason) {
      return NextResponse.json({ error: talentDeleteReason }, { status: 409 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Talent cancelling their own submission → soft-cancel so it stays visible
  if (submission.talent_user_id === user.id && talentCanDelete) {
    const { error } = await supabase
      .from("submissions")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) {
      console.error("[DELETE /api/submissions/[id]] soft-cancel", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  }

  // Agency / admin / referrer → hard delete
  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[DELETE /api/submissions/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
