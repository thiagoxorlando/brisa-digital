import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

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

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch job to check visibility and ownership
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, agency_id, visibility")
    .eq("id", job_id)
    .single();

  // Private job: only invited talents may apply
  if (job?.visibility === "private" && talent_id) {
    const { data: invite } = await supabase
      .from("job_invites")
      .select("id")
      .eq("job_id", job_id)
      .eq("talent_id", talent_id)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json(
        { error: "Esta vaga é privada e está disponível apenas para talentos convidados." },
        { status: 403 }
      );
    }
  }

  const baseInsert = {
    job_id,
    talent_user_id:  talent_id  ?? null,
    talent_name:     talent_id  ? null : (talent_name ?? null),
    email:           email      ?? null,
    bio:             bio        ?? null,
    referrer_id:     referrer_id ?? null,
    status:          "pending",
    mode,
    photo_front_url: photo_front_url ?? null,
    photo_left_url:  photo_left_url  ?? null,
    photo_right_url: photo_right_url ?? null,
    video_url:       video_url       ?? null,
  };

  let { data, error } = await supabase
    .from("submissions")
    .insert({ ...baseInsert, curriculum_url: curriculum_url ?? null, portfolio_url: portfolio_url ?? null })
    .select()
    .single();

  // Columns may not be in schema cache yet — fall back without them
  if (error?.message?.includes("curriculum_url") || error?.message?.includes("portfolio_url")) {
    ({ data, error } = await supabase
      .from("submissions")
      .insert(baseInsert)
      .select()
      .single());
  }

  if (error) {
    console.error("[POST /api/submissions]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify agency that owns this job
  if (job?.agency_id) {
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
