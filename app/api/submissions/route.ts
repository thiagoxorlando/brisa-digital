import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify } from "@/lib/notify";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { isJobOpenForApplications, JOB_UNAVAILABLE_MESSAGE } from "@/lib/jobAvailability";
import { isPremiumInviteOnlyJob, isPremiumPortalVisibleJob } from "@/lib/jobVisibility";
import type { Plan } from "@/lib/plans";
import { hasActivePremiumWorkspaceTalentMembership, isWorkspacePortalJobVisibility } from "@/lib/workspacePortalJobs";
import { agencyWorkspaceJobDetailHref, resolveWorkspaceLifecycleByJobId } from "@/lib/workspaceLifecycle";

type LinkedReferral = {
  id: string;
  referrer_id: string;
  submission_id: string | null;
  status: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    job_id,
    talent_id,
    email,
    bio,
    mode,
    photo_front_url,
    photo_left_url,
    photo_right_url,
    video_url,
    curriculum_url,
    portfolio_url,
    talent_name,
    invite_token,
  } = body;

  const referrer_id: string | null =
    typeof body.referrer_id === "string" && body.referrer_id.trim().length > 0
      ? body.referrer_id.trim()
      : null;

  if (!job_id) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }
  if (!talent_id && !talent_name) {
    return NextResponse.json({ error: "talent_id or talent_name is required" }, { status: 400 });
  }

  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const isSelfApplication = Boolean(talent_id);
  if (isSelfApplication) {
    if (caller?.role !== "talent" || talent_id !== user.id) {
      return NextResponse.json({ error: "Somente talentos podem se candidatar a esta vaga." }, { status: 403 });
    }
    if (referrer_id && referrer_id !== user.id) {
      return NextResponse.json({ error: "Invalid referrer" }, { status: 403 });
    }
  } else if (caller?.role !== "talent" || referrer_id !== user.id) {
    return NextResponse.json({ error: "Referral submissions require the logged-in referrer" }, { status: 403 });
  }

  let { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title, agency_id, workspace_id, visibility, status, deleted_at, number_of_talents_required, application_requirements")
    .eq("id", job_id)
    .single();

  if (jobError?.message?.includes("application_requirements")) {
    ({ data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, agency_id, workspace_id, visibility, status, deleted_at, number_of_talents_required")
      .eq("id", job_id)
      .single());
  }

  if (jobError || !job) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  const [{ data: agencyProfile }, { count: activeHires }] = await Promise.all([
    job.agency_id
      ? supabase.from("profiles").select("plan").eq("id", job.agency_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job_id)
      .not("status", "in", '("cancelled","rejected")')
      .is("deleted_at", null),
  ]);

  const liveSetting = await getLivePlanSetting((agencyProfile?.plan ?? "free") as Plan);
  if (
    !isJobOpenForApplications({
      status: job.status ?? null,
      deletedAt: (job as { deleted_at?: string | null }).deleted_at ?? null,
      currentHires: activeHires ?? 0,
      talentsNeeded: (job as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
      maxHiresPerJob: liveSetting.max_hires_per_job,
    })
  ) {
    return NextResponse.json({ error: "Vaga não disponível para novas candidaturas." }, { status: 409 });
  }

  let linkedReferral: LinkedReferral | null = null;
  if (isSelfApplication) {
    const { data: linkedReferralRows } = await supabase
      .from("referral_invites")
      .select("id, referrer_id, submission_id, status")
      .eq("job_id", job_id)
      .eq("referred_user_id", user.id)
      .neq("status", "fraud_reported")
      .order("created_at", { ascending: true })
      .limit(1);

    linkedReferral = (linkedReferralRows?.[0] ?? null) as LinkedReferral | null;
  }

  if (job.visibility === "private") {
    const { data: invite } = await supabase
      .from("job_invites")
      .select("id")
      .eq("job_id", job_id)
      .eq("talent_id", user.id)
      .maybeSingle();

    if (!invite && !linkedReferral) {
      return NextResponse.json(
        { error: "Esta vaga é privada e está disponível apenas para talentos convidados ou indicados." },
        { status: 403 }
      );
    }
  }

  const normalizedInviteToken =
    typeof invite_token === "string" && invite_token.trim() ? invite_token.trim() : null;
  let inviteLinkId: string | null = null;
  let inviteUseCount = 0;
  const workspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
  const workspaceMemberAccess = await hasActivePremiumWorkspaceTalentMembership(
    supabase,
    workspaceId,
    user.id,
  );

  if (isPremiumInviteOnlyJob({ visibility: job.visibility, workspaceId })) {
    const { data: directInvite } = await supabase
      .from("job_invites")
      .select("id")
      .eq("job_id", job_id)
      .eq("talent_id", user.id)
      .maybeSingle();

    if (!normalizedInviteToken && !directInvite) {
      return NextResponse.json({ error: "Convite inválido ou expirado." }, { status: 403 });
    }

    if (!directInvite) {
      const { data: link } = await supabase
        .from("job_invite_links")
        .select("id, status, expires_at, revoked_at, use_count, max_uses")
        .eq("token", normalizedInviteToken)
        .eq("job_id", job_id)
        .maybeSingle();

      const validInvite =
        !!link &&
        link.status === "active" &&
        !link.revoked_at &&
        (!link.expires_at || new Date(link.expires_at) > new Date()) &&
        (link.max_uses == null || Number(link.use_count ?? 0) < Number(link.max_uses));

      if (!validInvite) {
        return NextResponse.json({ error: "Convite inválido ou expirado." }, { status: 403 });
      }

      inviteLinkId = String(link.id);
      inviteUseCount = Number(link.use_count ?? 0);
    }
  } else if (
    (isPremiumPortalVisibleJob({ visibility: job.visibility, workspaceId }) ||
      isWorkspacePortalJobVisibility(job.visibility, workspaceId)) &&
    !workspaceMemberAccess
  ) {
    return NextResponse.json(
      { error: "Você precisa entrar no portal desta agência para acessar esta vaga." },
      { status: 403 }
    );
  }

  if (isSelfApplication) {
    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id")
      .eq("job_id", job_id)
      .eq("talent_user_id", user.id)
      .maybeSingle();

    if (existingSubmission && (!linkedReferral?.submission_id || linkedReferral.submission_id !== existingSubmission.id)) {
      return NextResponse.json({ error: "Você já se candidatou a esta vaga." }, { status: 409 });
    }
  }

  const applicationRequirements = Array.isArray(
    (job as { application_requirements?: unknown } | null)?.application_requirements
  )
    ? ((job as { application_requirements?: unknown[] }).application_requirements ?? []).filter(
        (requirement): requirement is string => typeof requirement === "string"
      )
    : [];

  if (talent_id && applicationRequirements.length > 0) {
    const missing: string[] = [];
    if (applicationRequirements.includes("photos") && (!photo_front_url || !photo_left_url || !photo_right_url)) {
      missing.push("fotos");
    }
    if (applicationRequirements.includes("video") && !video_url) missing.push("vídeo");
    if (applicationRequirements.includes("curriculum") && !curriculum_url) missing.push("currículo");
    if (applicationRequirements.includes("portfolio") && !portfolio_url) missing.push("portfólio");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Envie os itens solicitados pela vaga: ${missing.join(", ")}.` },
        { status: 400 }
      );
    }
  }

  const baseSubmission = {
    job_id,
    talent_user_id: talent_id ? user.id : null,
    talent_name: talent_id ? null : (talent_name ?? null),
    email: email ?? null,
    bio: bio ?? null,
    referrer_id: talent_id ? (linkedReferral?.referrer_id ?? null) : (referrer_id ?? null),
    status: "pending",
    mode,
    photo_front_url: photo_front_url ?? null,
    photo_left_url: photo_left_url ?? null,
    photo_right_url: photo_right_url ?? null,
    video_url: video_url ?? null,
  };
  const fullSubmission = {
    ...baseSubmission,
    curriculum_url: curriculum_url ?? null,
    portfolio_url: portfolio_url ?? null,
  };

  let data;
  let error;

  if (isSelfApplication && linkedReferral?.submission_id) {
    ({ data, error } = await supabase
      .from("submissions")
      .update(fullSubmission)
      .eq("id", linkedReferral.submission_id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase.from("submissions").insert(fullSubmission).select().single());
  }

  if (error?.message?.includes("curriculum_url") || error?.message?.includes("portfolio_url")) {
    if (isSelfApplication && linkedReferral?.submission_id) {
      ({ data, error } = await supabase
        .from("submissions")
        .update(baseSubmission)
        .eq("id", linkedReferral.submission_id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase.from("submissions").insert(baseSubmission).select().single());
    }
  }

  if (error) {
    console.error("[POST /api/submissions]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (inviteLinkId) {
    await supabase
      .from("job_invite_links")
      .update({ use_count: inviteUseCount + 1 })
      .eq("id", inviteLinkId)
      .then(() => null);
  }

  if (isSelfApplication && linkedReferral) {
    await supabase
      .from("referral_invites")
      .update({
        submission_id: data.id,
        referred_user_id: user.id,
        status: "applied",
        applied_at: new Date().toISOString(),
      })
      .eq("id", linkedReferral.id);
  }

  if (job.agency_id) {
    const displayName =
      talent_name ??
      (talent_id
        ? (await supabase.from("talent_profiles").select("full_name").eq("id", talent_id).single()).data?.full_name ??
          "Talento"
        : "Talento");

    await notify(
      job.agency_id,
      "job_application",
      `${displayName} se candidatou à "${job.title ?? "sua vaga"}"`,
      agencyWorkspaceJobDetailHref(
        (await resolveWorkspaceLifecycleByJobId(supabase, job_id))?.workspaceSlug,
        job_id,
      )
    );
  }

  return NextResponse.json({ submission: data }, { status: 201 });
}


