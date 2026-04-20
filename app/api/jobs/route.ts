import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { requireJobLimit } from "@/lib/requireActiveSubscription";
import { getJobSuggestions } from "@/lib/getJobSuggestions";
import { resolvePlanInfo } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title, description, category, budget, deadline,
    job_date, job_time, job_role, agency_id, location,
    gender, age_min, age_max, status,
    number_of_talents_required, auto_invite,
    visibility: rawVisibility,
    application_requirements,
  } = body;

  const limited = await requireJobLimit(agency_id);
  if (limited) return limited;

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agency_id)
    .single();
  const planInfo = resolvePlanInfo(profile);

  // Only premium agencies may create private jobs
  const isPremium = planInfo.plan === "premium";
  const visibility = isPremium && rawVisibility === "private" ? "private" : "public";

  console.log("[plan] create_job", {
    agencyId: agency_id,
    plan: planInfo.plan,
    visibility,
    maxActiveJobs: planInfo.maxActiveJobs,
  });

  const baseInsert = {
    title, description, category, budget, deadline, agency_id,
    visibility,
    job_date:                   job_date  ?? null,
    job_time:                   job_time  ?? null,
    job_role:                   job_role  ?? null,
    location:                   location  ?? null,
    gender:                     gender    ?? null,
    age_min:                    age_min   ?? null,
    age_max:                    age_max   ?? null,
    number_of_talents_required: number_of_talents_required ?? 1,
    status:                     status ?? "open",
  };

  let { data, error } = await supabase
    .from("jobs")
    .insert({ ...baseInsert, application_requirements: Array.isArray(application_requirements) ? application_requirements : [] })
    .select()
    .single();

  // Column may not be in schema cache yet — fall back without it
  if (error?.message?.includes("application_requirements")) {
    ({ data, error } = await supabase
      .from("jobs")
      .insert(baseInsert)
      .select()
      .single());
  }

  if (error) {
    console.error("[POST /api/jobs] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const isPublished = !status || status === "open";

  // Auto-invite — for private jobs, only invite from agency history + existing invitees
  if (auto_invite && isPublished) {
    const supabaseInvite = createServerClient({ useServiceRole: true });
    const { suggestions, job_date: jDate } = await getJobSuggestions(data.id, agency_id, 5, visibility === "private");
    const toInvite = suggestions.filter((s) => !s.is_unavailable);

    if (toInvite.length > 0) {
      await supabaseInvite.from("job_invites").insert(
        toInvite.map((t) => ({
          job_id:    data.id,
          talent_id: t.id,
          agency_id,
          status:    "pending",
        })),
      );

      const dateStr = jDate
        ? new Date(jDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
        : null;
      const msg = dateStr
        ? `Você foi convidado para um trabalho em ${dateStr}: "${title ?? "Nova vaga"}"`
        : `Você foi convidado para uma vaga: "${title ?? "Nova vaga"}"`;

      await notify(toInvite.map((t) => t.id), "job_invite", msg, `/talent/jobs/${data.id}`);
    }
  }

  // Public jobs: notify all available talents. Private jobs: invites only (above).
  if (isPublished && visibility === "public") {
    let talentIds: string[] = [];

    if (job_date) {
      const { data: availRows } = await supabase
        .from("talent_availability")
        .select("talent_id")
        .eq("date", job_date)
        .eq("is_available", true);
      talentIds = (availRows ?? []).map((r) => r.talent_id);
    }

    if (!talentIds.length) {
      const { data: talentProfiles } = await supabase.from("talent_profiles").select("id");
      talentIds = (talentProfiles ?? []).map((p) => p.id);
    }

    if (talentIds.length) {
      await notify(talentIds, "new_job", `Nova vaga publicada: "${title ?? "Sem título"}"`, `/talent/jobs/${data.id}`);
    }
  }

  return NextResponse.json({ job: data }, { status: 201 });
}
