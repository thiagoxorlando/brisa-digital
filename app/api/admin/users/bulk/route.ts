import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isAuthUserNotFound(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  return message.toLowerCase().includes("user not found");
}

async function deleteUserById(userId: string) {
  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  const submissionsResult = await supabase.from("submissions").delete().eq("talent_user_id", userId);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);

  const notificationsResult = await supabase.from("notifications").delete().eq("user_id", userId);
  if (notificationsResult.error) throw new Error(notificationsResult.error.message);

  const bookingsResult = await supabase
    .from("bookings")
    .update({ deleted_at: now })
    .or(`talent_user_id.eq.${userId},agency_id.eq.${userId}`);
  if (bookingsResult.error) throw new Error(bookingsResult.error.message);

  const talentContractsResult = await supabase
    .from("contracts")
    .update({ deleted_at: now })
    .eq("talent_id", userId)
    .neq("status", "paid");
  if (talentContractsResult.error) throw new Error(talentContractsResult.error.message);

  const agencyContractsResult = await supabase
    .from("contracts")
    .update({ deleted_at: now })
    .eq("agency_id", userId)
    .neq("status", "paid");
  if (agencyContractsResult.error) throw new Error(agencyContractsResult.error.message);

  const jobsResult = await supabase.from("jobs").select("id").eq("agency_id", userId);
  if (jobsResult.error) throw new Error(jobsResult.error.message);

  if (jobsResult.data && jobsResult.data.length > 0) {
    const jobIds = jobsResult.data.map((job) => job.id);

    const jobContractsResult = await supabase
      .from("contracts")
      .update({ deleted_at: now })
      .in("job_id", jobIds)
      .neq("status", "paid");
    if (jobContractsResult.error) throw new Error(jobContractsResult.error.message);

    const jobSubmissionsResult = await supabase.from("submissions").delete().in("job_id", jobIds);
    if (jobSubmissionsResult.error) throw new Error(jobSubmissionsResult.error.message);

    const softDeleteJobsResult = await supabase.from("jobs").update({ deleted_at: now }).in("id", jobIds);
    if (softDeleteJobsResult.error) throw new Error(softDeleteJobsResult.error.message);
  }

  const talentProfileResult = await supabase.from("talent_profiles").update({ deleted_at: now }).eq("id", userId);
  if (talentProfileResult.error) throw new Error(talentProfileResult.error.message);

  const agencyResult = await supabase.from("agencies").update({ deleted_at: now }).eq("id", userId);
  if (agencyResult.error) throw new Error(agencyResult.error.message);

  const profileResult = await supabase.from("profiles").delete().eq("id", userId);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const authResult = await supabase.auth.admin.deleteUser(userId);
  if (authResult.error && !isAuthUserNotFound(authResult.error)) {
    throw new Error(`${authResult.error.message} (${userId})`);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as { ids?: unknown; action?: unknown };
  const ids = parseIds(body.ids);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um usuario." }, { status: 400 });
  }

  if (body.action !== "freeze") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { error } = await supabase
    .from("profiles")
    .update({ is_frozen: true })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, count: ids.length });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId: adminId } = auth;

  const body = await req.json().catch(() => ({})) as { ids?: unknown };
  const ids = parseIds(body.ids);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um usuario." }, { status: 400 });
  }

  if (ids.includes(adminId)) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 });
  }

  for (const id of ids) {
    try {
      await deleteUserById(id);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Falha ao excluir usuario.",
          id,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
