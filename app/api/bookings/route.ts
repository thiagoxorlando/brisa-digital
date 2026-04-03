import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, agency_id, talent_id, job_title, price, status } = body;

  if (!talent_id) {
    return NextResponse.json({ error: "talent_id is required" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      job_id,
      agency_id,
      talent_user_id: talent_id,
      job_title:      job_title ?? null,
      price:          price     ?? 0,
      status:         status    ?? "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/bookings]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const title = job_title ?? "a job";

  // Notify talent: selected for a job
  await notify(talent_id, "job_selected", `You've been selected for "${title}"!`);

  // Notify agency: booking was created (look up agency_id from job if not passed)
  let agencyUserId = agency_id ?? null;
  if (!agencyUserId && job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("agency_id")
      .eq("id", job_id)
      .single();
    agencyUserId = job?.agency_id ?? null;
  }
  if (agencyUserId) {
    await notify(agencyUserId, "booking_created", `Booking confirmed for "${title}"`);
  }

  return NextResponse.json({ booking: data }, { status: 201 });
}
