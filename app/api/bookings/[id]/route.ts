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
    .select("talent_user_id, agency_id, job_title, job_id, status, price")
    .eq("id", id)
    .single();

  const newStatus = mark_paid ? "paid" : status;

  if (!newStatus) {
    return NextResponse.json({ error: "status or mark_paid is required" }, { status: 400 });
  }

  // ── Confirm booking: check balance and hold funds in escrow ──────────────
  if (newStatus === "confirmed" && booking?.status === "confirmed") {
    return NextResponse.json({ error: "already_confirmed" }, { status: 409 });
  }

  if (newStatus === "confirmed" && booking?.agency_id) {
    const required = booking.price ?? 0;

    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", booking.agency_id)
      .single();

    const available = Number(profile?.wallet_balance ?? 0);

    if (available < required) {
      return NextResponse.json(
        { error: "insufficient_balance", required, available },
        { status: 402 }
      );
    }

    // Deduct from balance and record escrow transaction
    await supabase
      .from("profiles")
      .update({ wallet_balance: available - required })
      .eq("id", booking.agency_id);

    await supabase.from("wallet_transactions").insert({
      user_id:     booking.agency_id,
      type:        "escrow",
      amount:      required,
      description: `Custódia: ${booking.job_title ?? "vaga"} — fundos retidos até conclusão`,
    });

    await notify(
      booking.agency_id,
      "booking",
      `Reserva confirmada — R$ ${required.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} retidos em custódia`,
      "/agency/finances"
    );
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // When cancelling, remove the talent's submission so they can re-apply
  if (newStatus === "cancelled" && booking?.talent_user_id && booking?.job_id) {
    await supabase
      .from("submissions")
      .delete()
      .eq("job_id", booking.job_id)
      .eq("talent_user_id", booking.talent_user_id);
  }

  const jobTitle = booking?.job_title ?? "a job";

  // Notify talent when agency marks as paid
  if (mark_paid && booking?.talent_user_id) {
    await notify(
      booking.talent_user_id,
      "payment",
      "Seu pagamento foi concluído",
      "/talent/finances"
    );
  }

  return NextResponse.json({ ok: true });
}
