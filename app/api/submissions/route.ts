import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    job_id, talent_id, email, bio, mode,
    photo_front_url, photo_left_url, photo_right_url, video_url,
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

  const { data, error } = await supabase
    .from("submissions")
    .insert({
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
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/submissions]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify agency that owns this job
  const { data: job } = await supabase
    .from("jobs")
    .select("title, agency_id")
    .eq("id", job_id)
    .single();

  if (job?.agency_id) {
    const displayName = talent_name ?? (talent_id
      ? (await supabase.from("talent_profiles").select("full_name").eq("id", talent_id).single())
          .data?.full_name ?? "A talent"
      : "A talent");

    await notify(
      job.agency_id,
      "job_application",
      `${displayName} applied to "${job.title ?? "your job"}"`,
      "/agency/submissions"
    );
  }

  return NextResponse.json({ submission: data }, { status: 201 });
}
