import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify } from "@/lib/notify";

type LinkedReferral = {
  id: string;
  referrer_id: string;
  submission_id: string | null;
  status: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    job_id, talent_id, email, bio, mode,
    photo_front_url, photo_left_url, photo_right_url, video_url,
    curriculum_url, portfolio_url,
    talent_name,
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
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSelfApplication = Boolean(talent_id);
  if (isSelfApplication) {
    if (caller?.role !== "talent" || talent_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (referrer_id && referrer_id !== user.id) {
      return NextResponse.json({ error: "Invalid referrer" }, { status: 403 });
    }
  } else if (caller?.role !== "talent" || referrer_id !== user.id) {
    return NextResponse.json({ error: "Referral submissions require the logged-in referrer" }, { status: 403 });
  }

  let { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title, agency_id, visibility, application_requirements")
    .eq("id", job_id)
    .single();

  if (jobError?.message?.includes("application_requirements")) {
    ({ data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, agency_id, visibility")
      .eq("id", job_id)
      .single());
  }

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
    talent_user_id:  talent_id ? user.id : null,
    talent_name:     talent_id ? null : (talent_name ?? null),
    email:           email ?? null,
    bio:             bio ?? null,
    referrer_id:     talent_id ? (linkedReferral?.referrer_id ?? null) : (referrer_id ?? null),
    status:          "pending",
    mode,
    photo_front_url: photo_front_url ?? null,
    photo_left_url:  photo_left_url ?? null,
    photo_right_url: photo_right_url ?? null,
    video_url:       video_url ?? null,
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
    ({ data, error } = await supabase
      .from("submissions")
      .insert(fullSubmission)
      .select()
      .single());
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
      ({ data, error } = await supabase
        .from("submissions")
        .insert(baseSubmission)
        .select()
        .single());
    }
  }

  if (error) {
    console.error("[POST /api/submissions]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (isSelfApplication && linkedReferral) {
    // Commission foundation: after this referred job is completed/paid,
    // finalize referral_invites.commission_amount as paid_job_amount * 0.02
    // and move status through commission_due -> paid when payout is handled.
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
    const displayName = talent_name ?? (talent_id
      ? (await supabase.from("talent_profiles").select("full_name").eq("id", talent_id).single())
          .data?.full_name ?? "A talent"
      : "A talent");

    await notify(
      job.agency_id,
      "job_application",
      `${displayName} se candidatou à "${job.title ?? "sua vaga"}"`,
      "/agency/submissions"
    );
  }

  return NextResponse.json({ submission: data }, { status: 201 });
}
