import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforce, normaliseStatus, validateBookingStatus, getUnifiedBookingStatus } from "@/lib/bookingStatus";

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
    // Reject invalid booking statuses — "signed" is contract-only
    const statusErr = validateBookingStatus(String(updates.status));
    if (statusErr) return NextResponse.json({ error: statusErr }, { status: 422 });

    // Fetch booking to get current status + contract identifiers
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, job_id, talent_user_id, agency_id")
      .eq("id", id)
      .single();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Enforce valid state machine transition (normalises booking→contract equivalents)
    const err = enforce(booking.status ?? "pending", String(updates.status));
    if (err) return NextResponse.json({ error: err }, { status: 422 });

    // Sync the matching contract. Map booking status → contract status equivalent.
    // Admin overrides do NOT trigger wallet operations; this is a manual correction.
    if (booking.talent_user_id && booking.agency_id) {
      const newBookingStatus = String(updates.status);
      // pending_payment→signed, confirmed→confirmed, paid→paid, cancelled→cancelled
      const contractStatus = normaliseStatus(newBookingStatus);
      const now = new Date().toISOString();
      const contractUpdates: Record<string, unknown> = { status: contractStatus };
      if (contractStatus === "signed")    contractUpdates.signed_at    = now;
      if (contractStatus === "confirmed") contractUpdates.confirmed_at = now;
      if (contractStatus === "paid")      contractUpdates.paid_at      = now;

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
  const newStatus = updates.status ? String(updates.status) : undefined;
  return NextResponse.json({
    ok: true,
    ...(newStatus ? { derived_status: getUnifiedBookingStatus(newStatus, newStatus) } : {}),
  });
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
