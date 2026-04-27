import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensureAsaasCustomer, AsaasCustomerError } from "@/lib/asaasCustomer";
import { asaas, AsaasApiError } from "@/lib/asaasClient";

// POST /api/payments/wallet-deposit
// Body: { amount: number }
// Creates an Asaas PIX charge to top up the agency's platform wallet balance.
// Returns: { qr_code, qr_code_base64, payment_id, tx_id, creditAmount, fee, totalCharged }
// qr_code        = PIX copia-e-cola text (Asaas "payload")
// qr_code_base64 = base64 QR image      (Asaas "encodedImage")

interface AsaasPayment { id: string; status: string }
interface AsaasPixQrCode { encodedImage: string; payload: string; expirationDate: string }

export async function POST(req: NextRequest) {
  const body      = await req.json();
  const numAmount = Number(body.amount);

  if (!numAmount || numAmount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ASAAS_API_KEY || !process.env.ASAAS_API_URL) {
    console.error("[wallet-deposit] Asaas env vars not configured");
    return NextResponse.json({ error: "Integração de pagamento não configurada." }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: agency } = await supabase
    .from("agencies")
    .select("company_name")
    .eq("id", user.id)
    .single();
  const agencyName = agency?.company_name ?? "Agência";

  // Pre-insert a pending transaction as the stable idempotency anchor.
  // amount = numAmount (no fee pass-through with Asaas — platform absorbs any fees).
  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount:      numAmount,
      description: "Depósito PIX — aguardando confirmação",
      provider:    "asaas",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet-deposit] insert tx error:", txErr);
    return NextResponse.json({ error: "Could not create deposit record" }, { status: 500 });
  }

  // Ensure Asaas customer (search-or-create, cached in profiles.asaas_customer_id)
  let asaasCustomerId: string;
  try {
    asaasCustomerId = await ensureAsaasCustomer(
      user.id,
      agencyName,
      user.email ?? "deposito@brisahub.com.br",
    );
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error(
      "[wallet-deposit] Asaas customer error:",
      err instanceof AsaasCustomerError ? err.message : String(err),
    );
    return NextResponse.json({ error: "Erro ao configurar cliente de pagamento." }, { status: 500 });
  }

  // Due date: tomorrow (Asaas PIX expires at end of due date)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  // Create PIX payment in Asaas
  console.log("[ASAAS PAYMENT PAYLOAD]", JSON.stringify({
    value:       numAmount,
    billingType: "PIX",
    customer:    asaasCustomerId,
  }, null, 2));

  let payment: AsaasPayment;
  try {
    payment = await asaas<AsaasPayment>("/payments", {
      method: "POST",
      body:   JSON.stringify({
        customer:             asaasCustomerId,
        billingType:          "PIX",
        value:                numAmount,
        dueDate:              dueDateStr,
        description:          `BrisaHub — Depósito de Saldo (${agencyName})`,
        externalReference:    txRecord.id,
        notificationDisabled: true,
      }),
    });
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error("[ASAAS PAYMENT ERROR FULL]", {
      status: err instanceof AsaasApiError ? err.status : null,
      body:   JSON.stringify(err instanceof AsaasApiError ? err.body : String(err), null, 2),
    });
    return NextResponse.json({ error: "Erro ao criar pagamento PIX." }, { status: 502 });
  }

  // Attach Asaas payment ID to the transaction so the webhook can find it
  await supabase
    .from("wallet_transactions")
    .update({ payment_id: payment.id })
    .eq("id", txRecord.id);

  // Fetch PIX QR code (non-fatal — UI falls back to text-only if image missing)
  let pixQr: AsaasPixQrCode | null = null;
  try {
    pixQr = await asaas<AsaasPixQrCode>(`/payments/${payment.id}/pixQrCode`);
  } catch (err) {
    console.error(
      "[wallet-deposit] PIX QR fetch failed (non-fatal):",
      err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err),
    );
  }

  console.log("[wallet-deposit] Asaas PIX created:", payment.id, "tx:", txRecord.id);

  return NextResponse.json({
    qr_code:        pixQr?.payload      ?? null,
    qr_code_base64: pixQr?.encodedImage ?? null,
    payment_id:     payment.id,
    tx_id:          txRecord.id,
    creditAmount:   numAmount,
    fee:            0,
    totalCharged:   numAmount,
  });
}
