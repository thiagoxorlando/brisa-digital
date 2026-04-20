import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { job_id, talent_ids, agency_id } = await req.json();

  if (!job_id || !Array.isArray(talent_ids) || talent_ids.length === 0) {
    return NextResponse.json({ error: "job_id and talent_ids are required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Resolve agency_id from job if not provided directly
  let resolvedAgencyId = agency_id ?? null;
  if (!resolvedAgencyId && job_id) {
    const { data: job } = await supabase.from("jobs").select("agency_id").eq("id", job_id).single();
    resolvedAgencyId = job?.agency_id ?? null;
  }

  for (const talent_id of talent_ids) {
    if (!talent_id) continue;

    const { error } = await supabase.from("notifications").insert({
      user_id: talent_id,
      type: "job_invite",
      message: "You were invited to apply for a job",
      link: `/talent/jobs/${job_id}`,
    });

    if (error) console.error("[invite] Insert failed:", error.message, { talent_id, job_id });
  }

  return NextResponse.json({ ok: true });
}
