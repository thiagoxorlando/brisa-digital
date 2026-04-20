import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getJobSuggestions } from "@/lib/getJobSuggestions";

type Props = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Props) {
  const { id: jobId } = await params;

  const { data: job } = await createServerClient({ useServiceRole: true })
    .from("jobs")
    .select("agency_id")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const agencyId =
    req.nextUrl.searchParams.get("agency_id") ?? job.agency_id;

  const { suggestions, job_date } = await getJobSuggestions(jobId, agencyId);

  return NextResponse.json({ suggestions, job_date });
}
