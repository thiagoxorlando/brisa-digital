import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforce } from "@/lib/bookingStatus";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServerClient({ useServiceRole: true });

  const allowed = ["status", "price"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (updates.status) {
    // Fetch booking to get current status + contract identifiers
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, job_id, talent_user_id, agency_id")
      .eq("id", id)
      .single();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Enforce valid state machine transition
    const err = enforce(booking.status ?? "sent", String(updates.status));
    if (err) return NextResponse.json({ error: err }, { status: 422 });

    // Contracts are the master — sync the matching contract when status changes.
    // Admin overrides do NOT trigger wallet operations; this is a manual correction.
    if (booking.talent_user_id && booking.agency_id) {
      const newStatus = String(updates.status);
      const contractUpdates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "signed")    contractUpdates.signed_at    = new Date().toISOString();
      if (newStatus === "confirmed") contractUpdates.confirmed_at = new Date().toISOString();
      if (newStatus === "paid")      contractUpdates.paid_at      = new Date().toISOString();

      let q = supabase
        .from("contracts")
        .update(contractUpdates)
        .eq("talent_id",  booking.talent_user_id)
        .eq("agency_id",  booking.agency_id)
        .neq("status", "paid");   // never override a paid contract

      if (booking.job_id) {
        q = (q as any).eq("job_id", booking.job_id);
      } else {
        q = (q as any).is("job_id", null);
      }

      await q;
    }
  }

  const { error } = await supabase.from("bookings").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from("bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
