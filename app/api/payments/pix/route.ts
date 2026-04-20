import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createServerClient } from "@/lib/supabase";

// POST /api/payments/pix
// Body: { contract_id: string, amount?: number, email?: string }
// amount and email are optional — fetched from contract/auth when omitted.
// Returns: { qr_code, qr_code_base64, payment_id }

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { contract_id, amount: bodyAmount, email: bodyEmail } = body;

  if (!contract_id) {
    return NextResponse.json({ error: "contract_id is required" }, { status: 400 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADO_PAGO_ACCESS_TOKEN is not configured" }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // ── Fetch contract ────────────────────────────────────────────────────────
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, status, payment_amount, agency_id, job_description")
    .eq("id", contract_id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // ── Resolve amount ────────────────────────────────────────────────────────
  const amount = Number(bodyAmount ?? contract.payment_amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
  }

  // ── Resolve payer email from auth when not provided ───────────────────────
  let email = bodyEmail as string | undefined;
  if (!email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(contract.agency_id);
    email = authUser?.user?.email ?? "pagador@brisadigital.com";
  }

  // ── Create PIX payment ────────────────────────────────────────────────────
  const client         = new MercadoPagoConfig({ accessToken });
  const paymentClient  = new Payment(client);
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const description    = `Pagamento — ${contract.job_description?.slice(0, 50) ?? "Contrato Brisa Digital"}`;

  let result;
  try {
    result = await paymentClient.create({
      body: {
        transaction_amount: amount,
        description,
        payment_method_id: "pix",
        payer:             { email },
        metadata:          { contract_id },
        notification_url:  `${appUrl}/api/webhooks/mercadopago`,
      },
      requestOptions: { idempotencyKey: `pix-${contract_id}` },
    });
  } catch (err) {
    console.error("[PIX] Mercado Pago error:", err);
    return NextResponse.json({ error: "Failed to create PIX payment" }, { status: 502 });
  }

  const txData       = result.point_of_interaction?.transaction_data ?? {};
  const qrCode       = txData.qr_code        ?? null;
  const qrCodeBase64 = txData.qr_code_base64 ?? null;
  const paymentId    = result.id!;

  // ── Persist in contract ───────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("contracts")
    .update({ pix_payment_id: String(paymentId), payment_status: "pending" })
    .eq("id", contract_id);

  if (updateErr) console.error("[PIX] Supabase update error:", updateErr);

  return NextResponse.json({ qr_code: qrCode, qr_code_base64: qrCodeBase64, payment_id: paymentId });
}
