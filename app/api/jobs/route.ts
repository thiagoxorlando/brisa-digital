import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify } from "@/lib/notify";
import { requireJobLimit, requireTalentsNeededForJob } from "@/lib/requireActiveSubscription";
import { getJobSuggestions } from "@/lib/getJobSuggestions";
import { resolvePlanInfo } from "@/lib/plans";
import {
  ensurePremiumWorkspaceForAgency,
  getAgentLedgerBalance,
  getUserPremiumWorkspace,
} from "@/lib/premiumWorkspace.server";
import { resolveWorkspaceLifecycleByJobId, talentWorkspaceJobDetailHref } from "@/lib/workspaceLifecycle";
import { calculateJobReservation } from "@/lib/jobReservationPolicy";

function mapJobCreationError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("row-level security")) {
    return "Você não tem permissão para criar vagas com esta conta.";
  }

  return message;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    description,
    category,
    budget,
    deadline,
    job_date,
    job_time,
    job_role,
    location,
    gender,
    age_min,
    age_max,
    status,
    number_of_talents_required,
    auto_invite,
    destination: rawDestination,
    visibility: rawVisibility,
    application_requirements,
  } = body;

  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado. Faça login novamente." }, { status: 401 });
  }

  const actorUserId = user.id;
  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller, error: callerError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", actorUserId)
    .maybeSingle();

  if (callerError) {
    console.error("[POST /api/jobs] profile lookup error:", callerError);
    return NextResponse.json({ error: mapJobCreationError(callerError.message) }, { status: 400 });
  }

  if (!caller) {
    return NextResponse.json({ error: "Perfil da conta não encontrado. Complete seu cadastro novamente." }, { status: 404 });
  }

  if (caller.role !== "agency") {
    return NextResponse.json({ error: "Apenas contas de agência podem publicar vagas." }, { status: 403 });
  }

  const [{ data: profile }, existingWorkspace] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", actorUserId).single(),
    getUserPremiumWorkspace(actorUserId),
  ]);

  const planInfo = resolvePlanInfo(profile);

  let workspaceAccess = existingWorkspace;
  let workspaceId = workspaceAccess?.workspace.id ?? null;
  const isPremiumPlan = planInfo.plan === "premium";
  const isWorkspaceMember = !!workspaceAccess;

  if (!workspaceId && isPremiumPlan) {
    workspaceAccess = await ensurePremiumWorkspaceForAgency(actorUserId);
    workspaceId = workspaceAccess?.workspace.id ?? null;
  }

  const workspaceOwnerUserId = workspaceAccess?.workspace.ownerUserId ?? actorUserId;
  const membershipRole = workspaceAccess?.membership.role ?? null;
  const requestedDestination =
    rawDestination === "open_space" || rawDestination === "premium_portal" || rawDestination === "private_invite"
      ? rawDestination
      : workspaceId
        ? rawVisibility === "private_invite"
          ? "private_invite"
          : "premium_portal"
        : "open_space";
  const targetWorkspaceId = requestedDestination === "open_space" ? null : workspaceId;

  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("id")
    .eq("id", workspaceOwnerUserId)
    .maybeSingle();

  if (agencyError) {
    console.error("[POST /api/jobs] agency lookup error:", agencyError);
    return NextResponse.json({ error: mapJobCreationError(agencyError.message) }, { status: 400 });
  }

  if (!agency) {
    return NextResponse.json(
      { error: "Cadastro de agência não encontrado. Atualize seu perfil antes de publicar uma vaga." },
      { status: 404 }
    );
  }

  const limited = await requireJobLimit(workspaceOwnerUserId);
  if (limited) return limited;

  const hiresLimited = await requireTalentsNeededForJob(
    workspaceOwnerUserId,
    Number(number_of_talents_required) || 1
  );
  if (hiresLimited) return hiresLimited;

  if (requestedDestination === "open_space" && workspaceId && membershipRole !== "owner") {
    return NextResponse.json(
      { error: "Somente o proprietario do workspace pode publicar no Open Space." },
      { status: 403 }
    );
  }

  if ((requestedDestination === "premium_portal" || requestedDestination === "private_invite") && !workspaceId) {
    return NextResponse.json(
      { error: "Vagas do portal Premium estao disponiveis apenas no Premium." },
      { status: 403 }
    );
  }

  if (isWorkspaceMember && workspaceAccess?.membership.role === "agent" && targetWorkspaceId) {
    const ledger = await getAgentLedgerBalance(targetWorkspaceId, actorUserId);
    // Policy 3: canonical reservation formula lives in lib/jobReservationPolicy.ts.
    const jobEstimate = calculateJobReservation(
      Number(budget ?? 0),
      Number(number_of_talents_required) || 1,
    );
    if (jobEstimate > ledger.availableAmount) {
      return NextResponse.json(
        { error: "Saldo alocado insuficiente. Solicite mais saldo ao proprietário." },
        { status: 403 }
      );
    }
  }

  const visibility: "public" | "private" | "private_invite" =
    requestedDestination === "private_invite" ? "private_invite" : "public";

  console.log("[plan] create_job", {
    agencyId: workspaceOwnerUserId,
    actorUserId,
    plan: planInfo.plan,
    destination: requestedDestination,
    visibility,
    workspaceId: targetWorkspaceId,
    maxActiveJobs: planInfo.maxActiveJobs,
  });

  const baseInsert: Record<string, unknown> = {
    title,
    description,
    category,
    budget,
    deadline,
    agency_id: workspaceOwnerUserId,
    visibility,
    job_date: job_date ?? null,
    job_time: job_time ?? null,
    job_role: job_role ?? null,
    location: location ?? null,
    gender: gender ?? null,
    age_min: age_min ?? null,
    age_max: age_max ?? null,
    number_of_talents_required: number_of_talents_required ?? 1,
    status: status ?? "open",
  };

  if (targetWorkspaceId) {
    baseInsert.workspace_id = targetWorkspaceId;
    baseInsert.created_by_user_id = actorUserId;
    baseInsert.invite_only = visibility === "private_invite";
  }

  let { data, error } = await supabase
    .from("jobs")
    .insert({
      ...baseInsert,
      application_requirements: Array.isArray(application_requirements) ? application_requirements : [],
    })
    .select()
    .single();

  if (error?.message?.includes("application_requirements")) {
    ({ data, error } = await supabase.from("jobs").insert(baseInsert).select().single());
  }

  if (error) {
    console.error("[POST /api/jobs] Supabase error:", error);
    return NextResponse.json({ error: mapJobCreationError(error.message) }, { status: 400 });
  }

  // Record internal allocation commitment for agent-created workspace jobs
  if (isWorkspaceMember && workspaceAccess?.membership.role === "agent" && targetWorkspaceId && data?.id) {
    // Policy 3: same canonical formula as the ledger-balance pre-check above.
    const jobEstimate = calculateJobReservation(
      Number(budget ?? 0),
      Number(number_of_talents_required) || 1,
    );
    if (jobEstimate > 0) {
      await supabase
        .from("premium_agent_wallet_transactions")
        .insert({
          workspace_id:  workspaceId,
          agent_user_id: actorUserId,
          owner_user_id: workspaceAccess.workspace.ownerUserId,
          type:          "job_commitment",
          amount:        jobEstimate,
          status:        "completed",
          related_job_id: data.id,
          created_by:    actorUserId,
        });
    }
  }

  const isPublished = !status || status === "open";

  if (auto_invite && isPublished) {
    const { suggestions, job_date: suggestedDate } = await getJobSuggestions(
      data.id,
      workspaceOwnerUserId,
      5,
      visibility === "private_invite"
    );
    const toInvite = suggestions.filter((suggestion) => !suggestion.is_unavailable);

    const workspaceLifecycle = await resolveWorkspaceLifecycleByJobId(supabase, data.id);
    const jobLink = talentWorkspaceJobDetailHref(workspaceLifecycle?.workspaceSlug, data.id);

    if (toInvite.length > 0) {
      await supabase.from("job_invites").insert(
        toInvite.map((talent) => ({
          job_id: data.id,
          talent_id: talent.id,
          agency_id: workspaceOwnerUserId,
          status: "pending",
        }))
      );

      const dateStr = suggestedDate
        ? new Date(suggestedDate + "T00:00:00").toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          })
        : null;
      const message = dateStr
        ? `Você foi convidado para um trabalho em ${dateStr}: "${title ?? "Nova vaga"}"`
        : `Você foi convidado para uma vaga: "${title ?? "Nova vaga"}"`;

      await notify(
        toInvite.map((talent) => talent.id),
        "job_invite",
        message,
        jobLink
      );
    }
  }

  if (isPublished && visibility === "public" && !targetWorkspaceId) {
    let talentIds: string[] = [];

    if (job_date) {
      const { data: availabilityRows } = await supabase
        .from("talent_availability")
        .select("talent_id")
        .eq("date", job_date)
        .eq("is_available", true);
      talentIds = (availabilityRows ?? []).map((row) => row.talent_id);
    }

    let visibleTalentQuery = supabase
      .from("talent_profiles")
      .select("id")
      .is("deleted_at", null)
      .eq("marketplace_visible", true);

    if (talentIds.length) {
      visibleTalentQuery = visibleTalentQuery.in("id", talentIds);
    }

    const { data: visibleTalentProfiles } = await visibleTalentQuery;
    talentIds = (visibleTalentProfiles ?? []).map((profileRow) => profileRow.id);

    if (talentIds.length) {
      await notify(
        talentIds,
        "new_job",
        `Nova vaga publicada: "${title ?? "Sem título"}"`,
        `/talent/jobs/${data.id}`
      );
    }
  }

  return NextResponse.json({ job: data }, { status: 201 });
}

