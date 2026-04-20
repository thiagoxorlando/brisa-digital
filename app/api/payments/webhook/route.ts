import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

// POST /api/payments/webhook
// Receives Mercado Pago payment notifications (IPN).
// Mercado Pago sends: { type: "payment", data: { id: "12345678" } }
//
// On payment approved:
//   deposit → signed → confirmed  (sets agency_signed_at, deposit_paid_at)
//   final   → confirmed → paid    (sets paid_at, updates booking)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // Malformed — ack to stop MP retries
  }

  if (body.type !== "payment" || !(body.data as Record<string, unknown>)?.id) {
    return NextResponse.json({ ok: true }); // Not a payment event — ignore
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const paymentId = Number((body.data as Record<string, unknown>).id);
  const client    = new MercadoPagoConfig({ accessToken });

  // ── Fetch and verify payment from Mercado Pago ────────────────────────────
  let payment;
  try {
    payment = await new Payment(client).get({ id: paymentId });
  } catch (err) {
    console.error("[Webhook] Could not fetch payment", paymentId, err);
    return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });
  }

  if (payment.status !== "approved") {
    return NextResponse.json({ ok: true }); // Not yet approved — nothing to do
  }

  const contractId: string | undefined = (payment.metadata as Record<string, string>)?.contract_id;
  const paymentType: string | undefined = (payment.metadata as Record<string, string>)?.type;

  if (!contractId || !paymentType) {
    console.warn("[Webhook] Missing metadata on payment", paymentId);
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const now      = new Date().toISOString();

  // ── Deposit confirmed → contract becomes "confirmed" ──────────────────────
  if (paymentType === "deposit") {
    const { data: contract } = await supabase
      .from("contracts")
      .select("talent_id, agency_id, status")
      .eq("id", contractId)
      .single();

    if (!contract || contract.status !== "signed") {
      return NextResponse.json({ ok: true }); // Already processed or wrong state
    }

    const { error } = await supabase
      .from("contracts")
      .update({ status: "confirmed", agency_signed_at: now, deposit_paid_at: now })
      .eq("id", contractId);

    if (error) {
      console.error("[Webhook] deposit update error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await notify(
      contract.talent_id,
      "contract",
      "Agência confirmou o contrato e realizou o depósito",
      "/talent/contracts"
    );
    await notify(
      contract.agency_id,
      "payment",
      "Depósito PIX confirmado — contrato ativo",
      "/agency/contracts"
    );
  }

  // ── Final payment confirmed → contract becomes "paid" ─────────────────────
  if (paymentType === "final") {
    const { data: contract } = await supabase
      .from("contracts")
      .select("talent_id, agency_id, status, job_id")
      .eq("id", contractId)
      .single();

    if (!contract || contract.status !== "confirmed") {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("contracts")
      .update({ status: "paid", paid_at: now })
      .eq("id", contractId);

    if (error) {
      console.error("[Webhook] final payment update error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update associated booking
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "paid" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id",      contract.agency_id)
      .eq("status",         "pending_payment");

    if (contract.job_id) bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    await bookingQuery;

    await notify(contract.talent_id, "payment", "Pagamento recebido — saque disponível",  "/talent/finances");
    await notify(contract.agency_id, "payment", "Pagamento final PIX confirmado",          "/agency/contracts");

    // Notify referrer (if any) of their 2% commission
    const REFERRAL_RATE = 0.02;
    const { data: contractFull } = await supabase
      .from("contracts")
      .select("payment_amount")
      .eq("id", contractId)
      .single();
    if (contract.talent_id && contractFull?.payment_amount) {
      let inviteQuery = supabase
        .from("referral_invites")
        .select("id, referrer_id")
        .eq("referred_user_id", contract.talent_id)
        .neq("status", "fraud_reported");
      if (contract.job_id) inviteQuery = inviteQuery.eq("job_id", contract.job_id);
      const { data: invite } = await inviteQuery.maybeSingle();
      if (invite?.referrer_id) {
        const commission = parseFloat((contractFull.payment_amount * REFERRAL_RATE).toFixed(2));
        await supabase
          .from("referral_invites")
          .update({ commission_paid: commission, status: "commission_paid" })
          .eq("id", invite.id);
        const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(commission);
        await notify(invite.referrer_id, "payment", `Comissão de indicação liberada: ${brl}`, "/talent/referrals");
      }
    }
  }

  return NextResponse.json({ ok: true });
}
