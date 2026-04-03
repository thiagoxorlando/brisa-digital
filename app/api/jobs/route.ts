import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, category, budget, deadline, agency_id, location, gender, age_min, age_max, status, number_of_talents_required } = body;

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      title, description, category, budget, deadline, agency_id,
      location: location ?? null,
      gender: gender ?? null,
      age_min: age_min ?? null,
      age_max: age_max ?? null,
      number_of_talents_required: number_of_talents_required ?? 1,
      status: status ?? "open",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/jobs] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Only notify talent when job is published (not draft)
  if (!status || status === "open") {
    const { data: talentProfiles } = await supabase
      .from("talent_profiles")
      .select("id");

    if (talentProfiles?.length) {
      const talentIds = talentProfiles.map((p) => p.id);
      await notify(talentIds, "new_job", `New job posted: "${title ?? "Untitled"}"`, `/talent/jobs/${data.id}`);
    }
  }

  return NextResponse.json({ job: data }, { status: 201 });
}
