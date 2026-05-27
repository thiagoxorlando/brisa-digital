import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify, notifyAdmins } from "@/lib/notify";
import { requireHireLimit } from "@/lib/requireActiveSubscription";
import { resolvePlanInfo, type Plan } from "@/lib/plans";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { isJobFull, JOB_FULL_MESSAGE, JOB_UNAVAILABLE_MESSAGE } from "@/lib/jobAvailability";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";
import {
  resolveContractCreationAccess,
} from "@/lib/contractCreationAccess.server";
import { resolveWorkspaceLifecycleByJobId, talentWorkspaceContractsHref } from "@/lib/workspaceLifecycle";
import { ensureContractForBooking } from "@/lib/ensureContractForBooking.server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    job_id,
    talent_id,
    talent_user_id,
    agency_id,
    contract_file_url,
    job_date,
    job_time,
    location,
    job_description,
    payment_amount,
    payment_method,
    additional_notes,
    is_rehire,
  } = body;

  const resolvedTalentUserId = talent_user_id ?? talent_id ?? null;

  if (!resolvedTalentUserId || !agency_id) {
    return NextResponse.json({ error: "talent_user_id and agency_id are required" }, { status: 400 });
  }
  if (payment_amount === undefined || payment_amount === null || isNaN(Number(payment_amount)) || Number(payment_amount) < 0) {
    return NextResponse.json({ error: "payment_amount must be 0 or greater" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const access = await resolveContractCreationAccess({
    userId: user.id,
    jobId: job_id ?? null,
    requestedAgencyId: agency_id ?? null,
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const resolvedAgencyId = access.agencyId;
  const resolvedWorkspaceId = access.kind === "workspace" ? access.workspaceId : null;
  const resolvedCreatedByUserId = access.kind === "workspace" ? user.id : null;

  const workspaceAccess = await getUserPremiumWorkspace(user.id);
  let effectivePlan = "free" as Plan;
  let jobCapacityInfo: { status: string | null; talentsNeeded: number | null; maxHiresPerJob: number | null; activeHires: number } | null = null;

  if (job_id) {
    const { data: jobOwner, error: jobOwnerErr } = await supabase
      .from("jobs")
      .select("agency_id, status, deleted_at, number_of_talents_required, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobOwnerErr || !jobOwner) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (jobOwner.agency_id !== resolvedAgencyId) {
      return NextResponse.json({ error: "Job does not belong to this agency" }, { status: 403 });
    }

    if (jobOwner.deleted_at || ["closed", "draft", "inactive"].includes(jobOwner.status ?? "")) {
      return NextResponse.json({ error: JOB_UNAVAILABLE_MESSAGE }, { status: 409 });
    }

    const workspaceId = (jobOwner as { workspace_id?: string | null }).workspace_id ?? null;
    effectivePlan =
      workspaceId && workspaceAccess?.workspace.id === workspaceId && workspaceAccess.membership.status === "active"
        ? "premium"
        : ((await supabase
            .from("profiles")
            .select("plan")
            .eq("id", resolvedAgencyId)
            .single()).data?.plan ?? "free") as Plan;

    const liveSetting = await getLivePlanSetting(effectivePlan);
    const { count: activeHires } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", resolvedAgencyId)
      .eq("job_id", job_id)
      .not("status", "in", '("cancelled","rejected")')
      .is("deleted_at", null);

    if (isJobFull({
      currentHires: activeHires ?? 0,
      talentsNeeded: jobOwner.number_of_talents_required ?? 1,
      maxHiresPerJob: liveSetting.max_hires_per_job,
    })) {
      return NextResponse.json({ error: JOB_FULL_MESSAGE }, { status: 409 });
    }

    jobCapacityInfo = {
      status: jobOwner.status ?? null,
      talentsNeeded: jobOwner.number_of_talents_required ?? 1,
      maxHiresPerJob: liveSetting.max_hires_per_job,
      activeHires: activeHires ?? 0,
    };
  }

  if (!job_id || effectivePlan !== "premium") {
    const limited = await requireHireLimit(resolvedAgencyId, job_id ?? null);
    if (limited) return limited;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", resolvedAgencyId)
    .single();

  if (!job_id) {
    effectivePlan = (profile?.plan ?? "free") as Plan;
  }

  const planInfo = resolvePlanInfo({ plan: effectivePlan });

  const amount = Number(payment_amount);
  const liveSetting = await getLivePlanSetting(effectivePlan);
  const commission_amount = Math.round(amount * liveSetting.commission_rate * 100) / 100;
  const net_amount = amount - commission_amount;

  console.log("[plan] create_contract", {
    agencyId: resolvedAgencyId,
    resolvedAgencyId,
    jobId: job_id ?? null,
    plan: planInfo.plan,
    amount,
    commissionAmount: commission_amount,
    netAmount: net_amount,
  });

  let jobTitle = job_description?.slice(0, 100) ?? "Contract Job";
  if (job_id) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", job_id)
      .single();
    if (jobRow?.title) jobTitle = jobRow.title;
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      job_id: job_id ?? null,
      agency_id: resolvedAgencyId,
      talent_user_id: resolvedTalentUserId,
      job_title: jobTitle,
      price: amount,
      status: "pending",
    })
    .select("id")
    .single();

  if (bookingErr) {
    console.error("[POST /api/contracts] booking insert", bookingErr);
    return NextResponse.json({ error: bookingErr.message }, { status: 400 });
  }

  let contract;
  try {
    contract = await ensureContractForBooking({
      supabase,
      booking: {
        id: booking.id,
        job_id: job_id ?? null,
        agency_id: resolvedAgencyId,
        talent_user_id: resolvedTalentUserId,
        job_title: jobTitle,
        price: amount,
      },
      overrides: {
        workspace_id: resolvedWorkspaceId,
        created_by_user_id: resolvedCreatedByUserId,
        job_date: job_date ?? null,
        job_time: job_time ?? null,
        location: location ?? null,
        job_description: job_description ?? null,
        payment_amount: amount,
        payment_method: payment_method ?? null,
        additional_notes: additional_notes ?? null,
        contract_file_url: contract_file_url ?? null,
        status: "sent",
      },
    });
  } catch (contractError) {
    const message = contractError instanceof Error ? contractError.message : "Contract creation failed";
    console.error("[POST /api/contracts]", message);
    await supabase.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.log("[contracts] created row", {
    id:                 contract.id,
    job_id:             contract.job_id,
    agency_id:          contract.agency_id,
    workspace_id:       (contract as Record<string, unknown>).workspace_id ?? null,
    talent_id:          contract.talent_id,
    talent_user_id:     contract.talent_user_id,
    status:             contract.status,
    created_by_user_id: (contract as Record<string, unknown>).created_by_user_id ?? null,
  });

  const workspaceLifecycle = await resolveWorkspaceLifecycleByJobId(supabase, job_id ?? null);
  const talentContractsHref = talentWorkspaceContractsHref(workspaceLifecycle?.workspaceSlug);

  if (is_rehire) {
    const { data: agencyProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", resolvedAgencyId)
      .single();
    const agencyName = agencyProfile?.full_name ?? "a agencia";
    await notify(resolvedTalentUserId, "rehire", `Voce foi contratado novamente por ${agencyName}`, talentContractsHref);
  } else {
    await notify(resolvedTalentUserId, "contract", "Voce recebeu um novo contrato", talentContractsHref);
  }

  await notifyAdmins(
    "booking",
    `Nova reserva criada: ${jobTitle}`,
    "/admin/bookings",
    `admin-booking-created:${booking.id}`,
  );
  await notifyAdmins(
    "contract",
    `Novo contrato criado: ${jobTitle}`,
    "/admin/contracts",
    `admin-contract-created:${contract.id}`,
  );

  if (
    job_id &&
    jobCapacityInfo &&
    isJobFull({
      currentHires: jobCapacityInfo.activeHires + 1,
      talentsNeeded: jobCapacityInfo.talentsNeeded,
      maxHiresPerJob: jobCapacityInfo.maxHiresPerJob,
    })
  ) {
    await supabase
      .from("jobs")
      .update({ status: "closed" })
      .eq("id", job_id)
      .eq("status", "open");
  }

  return NextResponse.json({ contract }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get("agency_id");
  const talentId = searchParams.get("talent_id");

  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let query = supabase
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });

  if (caller?.role === "admin") {
    if (agencyId) query = query.eq("agency_id", agencyId);
    if (talentId) query = query.or(`talent_user_id.eq.${talentId},talent_id.eq.${talentId}`);
  } else if (caller?.role === "agency") {
    if (agencyId && agencyId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    query = query.eq("agency_id", user.id);
  } else if (caller?.role === "talent") {
    if (talentId && talentId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    query = query.or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`);
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ contracts: data });
}
