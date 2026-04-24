import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";
import { calcFeeBreakdown, CARD_FEE_RATE } from "@/lib/mp-fees";

// POST /api/payments/wallet-deposit-card
// Body: { card_id: string (DB uuid), amount: number }
// Charges a saved card and credits the agency's platform wallet balance.
// Returns: { success: true, amount, fee, totalCharged }

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body      = await req.json();
  const cardId    = body.card_id as string | undefined;
  const numAmount = Number(body.amount);

  if (!cardId)              return NextResponse.json({ error: "card_id é obrigatório."          }, { status: 400 });
  if (!numAmount || numAmount <= 0) return NextResponse.json({ error: "Valor inválido."           }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem depositar na carteira da plataforma." }, { status: 403 });
  }

  // Verify the card belongs to this user
  const { data: card, error: cardErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id, brand, last_four, holder_document_type, holder_document_number")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Pagamentos não configurados." }, { status: 500 });
  }

  // Resolve agency name for better MP description
  const { data: agency } = await supabase
    .from("agencies")
    .select("company_name")
    .eq("id", user.id)
    .single();
  const agencyName = agency?.company_name ?? null;

  // Fee breakdown: numAmount = desired wallet credit.
  // When CARD_FEE_RATE = 0 (default), totalCharged = numAmount (no change).
  // Set MERCADO_PAGO_CARD_FEE_RATE in .env.local to pass the fee to the payer.
  const { creditAmount, fee, totalCharged } = calcFeeBreakdown(numAmount, CARD_FEE_RATE);

  // Pre-insert a pending transaction to get a stable idempotency key before
  // calling Mercado Pago. The same key on any retry ensures MP deduplicates the
  // charge rather than creating a second one.
  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount:      creditAmount,
      description: "Depósito via cartão — aguardando confirmação",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet-deposit-card] pre-insert tx error:", txErr);
    return NextResponse.json({ error: "Erro ao criar registro de depósito." }, { status: 500 });
  }

  const mpClient = new MercadoPagoConfig({ accessToken });

  // Generate a single-use token from the saved card
  let token: string;
  try {
    const cardToken = await new CardToken(mpClient).create({
      body: { card_id: card.mp_card_id },
    });
    token = cardToken.id!;
  } catch (err) {
    console.error("[wallet-deposit-card] CardToken.create failed:", err);
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({ error: "Erro ao processar cartão." }, { status: 502 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? "deposito@brisahub.com.br";

  // Charge the card using the pre-inserted transaction ID as the idempotency key.
  // totalCharged = gross amount so that after MP deducts its fee the platform
  // receives exactly creditAmount. When CARD_FEE_RATE = 0, totalCharged = creditAmount.
  let result;
  try {
    result = await new Payment(mpClient).create({
      body: {
        transaction_amount: totalCharged,
        description:        agencyName
          ? `BrisaHub — Depósito de Saldo (${agencyName})`
          : "BrisaHub — Depósito de Saldo",
        installments:       1,
        token,
        payment_method_id:  card.brand ?? "visa",
        payer: {
          id:         card.mp_customer_id,
          email,
          type:       "customer",
          first_name: agencyName ?? undefined,
          ...(card.holder_document_type && card.holder_document_number ? {
            identification: {
              type:   card.holder_document_type,
              number: card.holder_document_number,
            },
          } : {}),
        },
        metadata: {
          type:      "wallet_deposit_card",
          user_id:   user.id,
          agency_id: user.id,
          tx_id:     txRecord.id,
        },
      },
      requestOptions: { idempotencyKey: `wallet-deposit:${txRecord.id}` },
    });
  } catch (err) {
    console.error("[wallet-deposit-card] Payment.create failed:", err);
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({ error: "Pagamento falhou. Tente novamente." }, { status: 502 });
  }

  if (result.status === "rejected") {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json(
      { error: "Pagamento recusado pela operadora.", detail: result.status_detail },
      { status: 402 }
    );
  }

  if (result.status !== "approved") {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json(
      {
        error: "Pagamento ainda nao aprovado. A carteira nao foi creditada.",
        paymentStatus: result.status,
        paymentId: result.id,
      },
      { status: 409 },
    );
  }

  // Credit wallet balance atomically via RPC — creditAmount = what should be
  // added to the wallet (fee already stripped if CARD_FEE_RATE > 0)
  await supabase.rpc("increment_wallet_balance", {
    p_user_id: user.id,
    p_amount:  creditAmount,
  });

  // Update the pre-inserted record with the final payment details
  await supabase
    .from("wallet_transactions")
    .update({
      payment_id:  String(result.id),
      description: `Depósito via cartão ${card.brand?.toUpperCase() ?? ""} •••• ${card.last_four ?? ""}`.trim(),
    })
    .eq("id", txRecord.id);

  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(creditAmount);
  await notifyAdmins(
    "payment",
    `Depósito de carteira confirmado: ${brl}`,
    "/admin/finances",
    `admin-wallet-deposit-card:${result.id ?? txRecord.id}`,
  );

  return NextResponse.json({ success: true, amount: creditAmount, fee, totalCharged });
}
