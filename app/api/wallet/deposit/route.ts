import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensureAsaasCustomer, AsaasCustomerError } from "@/lib/asaasCustomer";
import { asaas, AsaasApiError } from "@/lib/asaasClient";

// POST /api/wallet/deposit
// Body: { amount: number, email?: string }
// Returns: { qr_code, qr_code_base64, payment_id, tx_id, creditAmount, fee, totalCharged }
// Duplicate entry-point for wallet PIX deposit — same logic as /api/payments/wallet-deposit.

interface AsaasPayment { id: string; status: string }
interface AsaasPixQrCode { encodedImage: string; payload: string; expirationDate: string }

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const amount = Number(body.amount);

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (!process.env.ASAAS_API_KEY || !process.env.ASAAS_API_URL) {
    console.error("[wallet/deposit] Asaas env vars not configured");
    return NextResponse.json({ error: "Integração de pagamento não configurada." }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: agency } = await supabase
    .from("agencies")
    .select("company_name")
    .eq("id", user.id)
    .single();
  const agencyName = agency?.company_name ?? "Agência";

  const email: string = body.email ?? user.email ?? "deposito@brisahub.com.br";

  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount,
      description: "Depósito via PIX (pendente)",
      provider:    "asaas",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet/deposit] Failed to log pending deposit:", txErr?.message);
    return NextResponse.json({ error: "Could not create deposit record" }, { status: 500 });
  }

  let asaasCustomerId: string;
  try {
    asaasCustomerId = await ensureAsaasCustomer(user.id, agencyName, email);
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error(
      "[wallet/deposit] Asaas customer error:",
      err instanceof AsaasCustomerError ? err.message : String(err),
    );
    return NextResponse.json({ error: "Erro ao configurar cliente de pagamento." }, { status: 500 });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  console.log("[ASAAS PAYMENT PAYLOAD]", JSON.stringify({
    value:       amount,
    billingType: "PIX",
    customer:    asaasCustomerId,
  }, null, 2));

  let payment: AsaasPayment;
  try {
    payment = await asaas<AsaasPayment>("/payments", {
      method: "POST",
      body:   JSON.stringify({
        customer:          asaasCustomerId,
        billingType:       "PIX",
        value:             amount,
        dueDate:           dueDateStr,
        description:       agencyName
          ? `BrisaHub — Depósito de Saldo (${agencyName})`
          : "BrisaHub — Depósito de Saldo",
        externalReference: txRecord.id,
      }),
    });
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error("[ASAAS PAYMENT ERROR FULL]", {
      status: err instanceof AsaasApiError ? err.status : null,
      body:   JSON.stringify(err instanceof AsaasApiError ? err.body : String(err), null, 2),
    });
    return NextResponse.json({ error: "Failed to create PIX payment" }, { status: 502 });
  }

  await supabase
    .from("wallet_transactions")
    .update({ payment_id: payment.id })
    .eq("id", txRecord.id);

  let pixQr: AsaasPixQrCode | null = null;
  try {
    pixQr = await asaas<AsaasPixQrCode>(`/payments/${payment.id}/pixQrCode`);
  } catch (err) {
    console.error(
      "[wallet/deposit] PIX QR fetch failed (non-fatal):",
      err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err),
    );
  }

  console.log("[wallet/deposit] Asaas PIX created:", payment.id, "tx:", txRecord.id);

  return NextResponse.json({
    qr_code:        pixQr?.payload      ?? null,
    qr_code_base64: pixQr?.encodedImage ?? null,
    payment_id:     payment.id,
    tx_id:          txRecord.id,
    creditAmount:   amount,
    fee:            0,
    totalCharged:   amount,
  });
}
