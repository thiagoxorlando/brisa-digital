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

  // Notify talent: booked
  await notify(talent_id, "booking", "You were booked", "/talent/bookings");

  return NextResponse.json({ booking: data }, { status: 201 });
}
