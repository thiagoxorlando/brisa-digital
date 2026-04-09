import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

const ALLOWED_ACTIONS = ["accept", "reject", "agency_sign", "pay", "cancel_job", "withdraw"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await req.json();

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}` }, { status: 400 });
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

  const now = new Date().toISOString();

  // ── Talent: accept (sign) ──────────────────────────────────────────────────
  if (action === "accept") {
    if (contract.status !== "sent") {
      return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "signed", signed_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Upgrade the pending booking to pending_payment
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "pending_payment" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending")
      .select("id");

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    } else {
      bookingQuery = bookingQuery.is("job_id", null);
    }

    const upgraded = await bookingQuery;

    // If no existing pending booking was updated, create one
    if (upgraded.error || !upgraded.data || upgraded.data.length === 0) {
      await supabase.from("bookings").insert({
        job_id:         contract.job_id    ?? null,
        agency_id:      contract.agency_id ?? null,
        talent_user_id: contract.talent_id,
        job_title:      contract.job_description?.slice(0, 100) ?? "Contract Job",
        price:          contract.payment_amount ?? 0,
        status:         "pending_payment",
      });
    }

    await notify(contract.agency_id, "contract", "Talent signed the contract", "/agency/contracts");
    await notify(contract.talent_id, "booking", "You were booked", "/talent/bookings");

    return NextResponse.json({ ok: true, status: "signed" });
  }

  // ── Talent: reject ────────────────────────────────────────────────────────
  if (action === "reject") {
    if (contract.status !== "sent") {
      return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "rejected" })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    let deleteQuery = supabase
      .from("bookings")
      .delete()
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending");

    if (contract.job_id) {
      deleteQuery = deleteQuery.eq("job_id", contract.job_id);
    } else {
      deleteQuery = deleteQuery.is("job_id", null);
    }

    await deleteQuery;
    await notify(contract.agency_id, "contract", "Talent rejected your contract", "/agency/contracts");

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // ── Agency: deposit + sign → confirmed ────────────────────────────────────
  if (action === "agency_sign") {
    if (contract.status !== "signed") {
      return NextResponse.json({ error: "Contract must be signed by talent first" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "confirmed", agency_signed_at: now, deposit_paid_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    await notify(contract.talent_id, "contract", "Agency confirmed your contract and made a deposit", "/talent/contracts");

    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  // ── Agency: pay talent after job ──────────────────────────────────────────
  if (action === "pay") {
    if (contract.status !== "confirmed") {
      return NextResponse.json({ error: "Contract must be confirmed before paying" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "paid", paid_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Update booking to paid — only match active (pending_payment) booking for this contract
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "paid" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending_payment");

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    }

    await bookingQuery;

    await notify(contract.talent_id, "payment", "Agency released your payment — funds on the way!", "/talent/finances");

    return NextResponse.json({ ok: true, status: "paid" });
  }

  // ── Agency: cancel after contract was signed ──────────────────────────────
  if (action === "cancel_job") {
    if (!["signed", "confirmed"].includes(contract.status)) {
      return NextResponse.json({ error: "Contract cannot be cancelled at this stage" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Cancel associated booking — only match active booking for this contract
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .in("status", ["pending", "pending_payment"]);

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    }

    await bookingQuery;

    await notify(contract.talent_id, "contract", "Agency cancelled the contract", "/talent/contracts");

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  // ── Talent: withdraw funds after payment released ─────────────────────
  if (action === "withdraw") {
    if (contract.status !== "paid") {
      return NextResponse.json({ error: "Contract must be paid before withdrawal" }, { status: 409 });
    }
    if (contract.withdrawn_at) {
      return NextResponse.json({ error: "Already withdrawn" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ withdrawn_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    await notify(contract.talent_id, "payment", "Your withdrawal has been processed", "/talent/finances");

    return NextResponse.json({ ok: true, withdrawn_at: now });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
