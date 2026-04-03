import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, notify_admin, mark_paid } = body;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: booking } = await supabase
    .from("bookings")
    .select("talent_user_id, agency_id, job_title, job_id, status")
    .eq("id", id)
    .single();

  const newStatus = mark_paid ? "paid" : status;

  if (!newStatus) {
    return NextResponse.json({ error: "status or mark_paid is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const jobTitle = booking?.job_title ?? "a job";

  // Notify talent when agency marks as paid
  if (mark_paid && booking?.talent_user_id) {
    await notify(
      booking.talent_user_id,
      "payment",
      "You received payment",
      "/talent/finances"
    );
  }

  return NextResponse.json({ ok: true });
}
