import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const { job_id, talent_ids } = await req.json();

  if (!job_id || !Array.isArray(talent_ids) || talent_ids.length === 0) {
    return NextResponse.json({ error: "job_id and talent_ids are required" }, { status: 400 });
  }

  for (const talent_id of talent_ids) {
    console.log("Creating job_invite notification", { talent_id, job_id });
    await notify(talent_id, "job_invite", "You were invited to apply for a job", `/talent/jobs/${job_id}`);
  }

  return NextResponse.json({ ok: true });
}
