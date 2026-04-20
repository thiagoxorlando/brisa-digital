import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

type Props = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Props) {
  const { id: jobId } = await params;
  const { talent_id, agency_id } = await req.json();

  if (!talent_id || !agency_id) {
    return NextResponse.json(
      { error: "talent_id and agency_id required" },
      { status: 400 },
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, job_date, agency_id")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.agency_id !== agency_id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { data: invite, error } = await supabase
    .from("job_invites")
    .insert({ job_id: jobId, talent_id, agency_id, status: "pending" })
    .select()
    .single();

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "already_invited" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const dateStr = job.job_date
    ? new Date(job.job_date + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null;

  const msg = dateStr
    ? `Você foi convidado para um trabalho em ${dateStr}: "${job.title}"`
    : `Você foi convidado para uma vaga: "${job.title}"`;

  await notify(talent_id, "job_invite", msg, `/talent/jobs/${jobId}`);

  return NextResponse.json({ invite }, { status: 201 });
}
