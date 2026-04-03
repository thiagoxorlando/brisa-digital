import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await req.json();

  if (!["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (contract.status !== "sent") {
    return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
  }

  // "accept" means talent signed the contract → status = "signed"
  const newStatus = action === "accept" ? "signed" : "rejected";

  const { error: updateErr } = await supabase
    .from("contracts")
    .update({
      status:    newStatus,
      signed_at: action === "accept" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  if (action === "accept") {
    // Upgrade the pending booking to pending_payment (awaiting agency to pay)
    const upgraded = await supabase
      .from("bookings")
      .update({ status: "pending_payment" })
      .eq("talent_user_id", contract.talent_id)
      .eq("status", "pending")
      .eq("job_id", contract.job_id ?? "");

    if (upgraded.error || upgraded.count === 0) {
      // Fallback: create booking if the pending one was not found
      await supabase.from("bookings").insert({
        job_id:         contract.job_id    ?? null,
        agency_id:      contract.agency_id ?? null,
        talent_user_id: contract.talent_id,
        job_title:      contract.job_description?.slice(0, 100) ?? "Contract Job",
        price:          contract.payment_amount ?? 0,
        status:         "pending_payment",
      });
    }

    // Notify agency — contract signed
    await notify(
      contract.agency_id,
      "contract_signed",
      `Talent signed your contract. Payment is now pending.`,
      "/agency/bookings"
    );
    // Notify talent — booking status updated
    await notify(
      contract.talent_id,
      "booking_updated",
      `Your contract has been signed. Booking is pending payment.`,
      "/talent/bookings"
    );
  } else {
    // Remove the pending booking created when the contract was sent
    if (contract.job_id) {
      await supabase
        .from("bookings")
        .delete()
        .eq("talent_user_id", contract.talent_id)
        .eq("job_id", contract.job_id)
        .eq("status", "pending");
    }

    await notify(
      contract.agency_id,
      "booking_cancelled",
      `Talent rejected your contract offer.`,
      "/agency/contracts"
    );
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ contract: data });
}
