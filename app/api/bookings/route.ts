import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { getUnifiedBookingStatus, validateBookingStatus } from "@/lib/bookingStatus";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, agency_id, talent_id, job_title, price, status } = body;

  if (!talent_id) {
    return NextResponse.json({ error: "talent_id is required" }, { status: 400 });
  }

  const safeStatus = status ?? "pending";
  const statusErr  = validateBookingStatus(safeStatus);
  if (statusErr) return NextResponse.json({ error: statusErr }, { status: 422 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      job_id,
      agency_id,
      talent_user_id: talent_id,
      job_title:      job_title ?? null,
      price:          price     ?? 0,
      status:         safeStatus,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/bookings]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notify(talent_id, "booking", "Você foi reservado!", "/talent/bookings");

  // No contract exists yet at creation time — always aguardando_assinatura
  return NextResponse.json({
    booking: {
      ...data,
      derived_status: getUnifiedBookingStatus(data.status ?? "pending", null),
    },
  }, { status: 201 });
}
