import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { createPayment, getPixQrCode } from "@/lib/asaas";

// dueDate: today + 1 day, formatted as YYYY-MM-DD
function nextDayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => ({})) as { amount?: number };
  const amount = Number(body.amount ?? 0);

  if (!amount || amount < 10) {
    return NextResponse.json({ error: "Valor mínimo é R$10" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // 1. Get Asaas customer ID — call /api/asaas/customer via shared DB read
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("asaas_customer_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const customerId = (profile as Record<string, unknown>).asaas_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json(
      { error: "CPF/CNPJ inválido" },
      { status: 400 },
    );
  }

  // 2. Create a pending wallet_transaction so the webhook can credit the wallet on confirmation
  const { data: tx, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      status:      "pending",
      amount,
      description: "Depósito via PIX Asaas (pendente)",
      provider:    "asaas",
    })
    .select("id")
    .single();

  if (txErr || !tx) {
    console.error("[asaas deposit] failed to create pending transaction", txErr?.message);
    return NextResponse.json({ error: "Erro ao iniciar depósito." }, { status: 500 });
  }

  // 3. Create Asaas PIX payment — externalReference links back to our transaction row
  let paymentId: string;
  let invoiceUrl: string | null = null;

  try {
    const payment = await createPayment({
      customer:          customerId,
      billingType:       "PIX",
      value:             amount,
      dueDate:           nextDayDate(),
      description:       "Depósito BrisaHub",
      externalReference: tx.id,
    } as Parameters<typeof createPayment>[0] & { externalReference?: string });

    paymentId  = payment.id;
    invoiceUrl = payment.invoiceUrl ?? null;

    console.log("[asaas deposit] created", { userId: user.id, paymentId, amount });
  } catch (err) {
    // Clean up the pending row so it doesn't become a ghost record
    await supabase.from("wallet_transactions").delete().eq("id", tx.id);

    console.error("[asaas deposit] failed", { userId: user.id, error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao criar pagamento Asaas." },
      { status: 502 },
    );
  }

  // 4. Attach Asaas payment ID and initial status to the transaction
  await supabase
    .from("wallet_transactions")
    .update({
      asaas_payment_id: paymentId,
      asaas_status:     "PENDING",
    } as Record<string, unknown>)
    .eq("id", tx.id);

  // 5. Fetch PIX QR code (non-fatal — invoiceUrl is still usable without it)
  let pixQrCode: string | null   = null;
  let pixCopyPaste: string | null = null;

  try {
    const qr   = await getPixQrCode(paymentId);
    pixQrCode   = qr.encodedImage ?? null;
    pixCopyPaste = qr.payload     ?? null;
  } catch (err) {
    console.warn("[asaas deposit] pixQrCode fetch failed (non-fatal)", String(err));
  }

  return NextResponse.json({ paymentId, invoiceUrl, pixQrCode, pixCopyPaste });
}
