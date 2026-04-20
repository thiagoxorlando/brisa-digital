import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// POST /api/payments/contract
// Body: { contract_id: string }
//
// Response (wallet):  { method: "wallet" }
// Response (pix):     { method: "pix", qr_code, qr_code_base64, payment_id }

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contract_id } = await req.json();
  if (!contract_id) {
    return NextResponse.json({ error: "contract_id is required" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // ── Fetch contract ────────────────────────────────────────────────────────
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, status, payment_status, payment_amount, agency_id, talent_id, job_id, job_description")
    .eq("id", contract_id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (contract.payment_status === "paid") {
    return NextResponse.json({ error: "Already paid" }, { status: 409 });
  }

  const amount = Number(contract.payment_amount ?? 0);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
  }

  // ── Fetch agency wallet balance ───────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance")
    .eq("id", contract.agency_id)
    .single();

  const walletBalance = Number(profile?.wallet_balance ?? 0);

  // ══════════════════════════════════════════════════════════════════════════
  // PATH A: Wallet payment
  // ══════════════════════════════════════════════════════════════════════════
  if (walletBalance >= amount) {
    // Atomically deduct balance
    const { error: rpcErr } = await supabase.rpc("increment_wallet_balance", {
      p_user_id: contract.agency_id,
      p_amount:  -amount,
    });

    if (rpcErr) {
      console.error("[payments/contract] wallet deduct failed:", rpcErr.message);
      return NextResponse.json({ error: "Wallet deduction failed" }, { status: 500 });
    }

    // Record wallet transaction
    await supabase.from("wallet_transactions").insert({
      user_id:     contract.agency_id,
      type:        "payment",
      amount,
      description: `Pagamento de contrato — ${contract.job_description?.slice(0, 60) ?? contract_id}`,
      payment_id:  contract_id,
    });

    const now = new Date().toISOString();

    // Mark contract paid (atomic guard)
    const { data: updated, error: updateErr } = await supabase
      .from("contracts")
      .update({ payment_status: "paid", status: "confirmed", paid_at: now })
      .eq("id", contract_id)
      .eq("payment_status", "pending")
      .select("id");

    if (updateErr || !updated?.length) {
      console.error("[payments/contract] contract update failed:", updateErr?.message ?? "no rows");
      // Refund wallet
      await supabase.rpc("increment_wallet_balance", {
        p_user_id: contract.agency_id,
        p_amount:  amount,
      });
      return NextResponse.json({ error: "Contract update failed" }, { status: 500 });
    }

    // ── Post-payment side effects (mirrors webhook logic) ─────────────────
    const { job_id, talent_id, agency_id } = contract;

    // Job fill check
    if (job_id) {
      const [{ count: filledCount }, { data: job }] = await Promise.all([
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job_id)
          .eq("payment_status", "paid")
          .is("deleted_at", null),
        supabase
          .from("jobs")
          .select("number_of_talents_required, status")
          .eq("id", job_id)
          .single(),
      ]);

      if (job) {
        const needed = job.number_of_talents_required ?? 1;
        if ((filledCount ?? 0) >= needed && job.status !== "filled" && job.status !== "closed") {
          await supabase.from("jobs").update({ status: "filled" }).eq("id", job_id);
        }
      }
    }

    // Booking upsert
    if (talent_id && agency_id) {
      const { data: existing } = await supabase
        .from("bookings")
        .select("id")
        .eq("talent_user_id", talent_id)
        .eq("agency_id", agency_id)
        .eq("status", "pending_payment")
        .maybeSingle();

      if (existing) {
        await supabase.from("bookings").update({ status: "confirmed" }).eq("id", existing.id);
      } else {
        const { count: dupCount } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("talent_user_id", talent_id)
          .eq("agency_id", agency_id)
          .in("status", ["confirmed", "paid"]);

        if ((dupCount ?? 0) === 0) {
          const { data: jobRow } = job_id
            ? await supabase.from("jobs").select("title").eq("id", job_id).single()
            : { data: null };

          await supabase.from("bookings").insert({
            job_id:         job_id ?? null,
            agency_id,
            talent_user_id: talent_id,
            job_title:      jobRow?.title ?? contract.job_description?.slice(0, 100) ?? "Contract Job",
            price:          amount,
            status:         "confirmed",
          });
        }
      }
    }

    return NextResponse.json({ method: "wallet" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATH B: PIX payment
  // ══════════════════════════════════════════════════════════════════════════
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADO_PAGO_ACCESS_TOKEN is not configured" }, { status: 500 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(contract.agency_id);
  const email = authUser?.user?.email ?? "pagador@brisadigital.com";

  const client        = new MercadoPagoConfig({ accessToken });
  const paymentClient = new Payment(client);
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const description   = `Pagamento — ${contract.job_description?.slice(0, 50) ?? "Contrato Brisa Digital"}`;

  let result;
  try {
    result = await paymentClient.create({
      body: {
        transaction_amount: amount,
        description,
        payment_method_id:  "pix",
        payer:              { email },
        metadata:           { contract_id },
        notification_url:   `${appUrl}/api/webhooks/mercadopago`,
      },
      requestOptions: { idempotencyKey: `pix-${contract_id}` },
    });
  } catch (err) {
    console.error("[payments/contract] Mercado Pago error:", err);
    return NextResponse.json({ error: "Failed to create PIX payment" }, { status: 502 });
  }

  const txData = result.point_of_interaction?.transaction_data ?? {};

  await supabase
    .from("contracts")
    .update({ pix_payment_id: String(result.id!), payment_status: "pending" })
    .eq("id", contract_id);

  return NextResponse.json({
    method:         "pix",
    qr_code:        txData.qr_code        ?? null,
    qr_code_base64: txData.qr_code_base64 ?? null,
    payment_id:     result.id!,
  });
}
