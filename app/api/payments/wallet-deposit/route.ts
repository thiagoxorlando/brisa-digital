import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

// POST /api/payments/wallet-deposit
// Body: { amount: number }
// Creates a Mercado Pago PIX to top up the agency's platform wallet balance.
// Returns: { qr_code, qr_code_base64, payment_id, tx_id }

export async function POST(req: NextRequest) {
  const body = await req.json();
  const numAmount = Number(body.amount);

  if (!numAmount || numAmount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADO_PAGO_ACCESS_TOKEN is not configured" }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // Pre-insert a pending transaction so the webhook can find it by payment_id later
  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount:      numAmount,
      description: "Depósito PIX — aguardando confirmação",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet-deposit] insert tx error:", txErr);
    return NextResponse.json({ error: "Could not create deposit record" }, { status: 500 });
  }

  const client        = new MercadoPagoConfig({ accessToken });
  const paymentClient = new Payment(client);
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await paymentClient.create({
      body: {
        transaction_amount: numAmount,
        description:        "Depósito na plataforma Brisa Digital",
        payment_method_id:  "pix",
        payer:              { email: user.email ?? "agency@brisadigital.com" },
        metadata:           { type: "wallet_deposit", user_id: user.id, tx_id: txRecord.id },
        notification_url:   `${appUrl}/api/webhooks/mercadopago`,
      },
      requestOptions: { idempotencyKey: `wallet-deposit-${txRecord.id}` },
    });
  } catch (err) {
    console.error("[wallet-deposit] Mercado Pago error:", err);
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({ error: "Failed to create PIX payment" }, { status: 502 });
  }

  // Attach payment_id to the transaction so the webhook can match it
  await supabase
    .from("wallet_transactions")
    .update({ payment_id: String(result.id) })
    .eq("id", txRecord.id);

  const txData = result.point_of_interaction?.transaction_data ?? {};

  return NextResponse.json({
    qr_code:        txData.qr_code        ?? null,
    qr_code_base64: txData.qr_code_base64 ?? null,
    payment_id:     result.id,
    tx_id:          txRecord.id,
  });
}
