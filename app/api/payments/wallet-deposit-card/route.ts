import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// POST /api/payments/wallet-deposit-card
// Body: { card_id: string (DB uuid), amount: number }
// Charges a saved card and credits the agency's platform wallet balance.
// Returns: { success: true, amount }

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

  // Verify the card belongs to this user
  const { data: card, error: cardErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id, brand, last_four")
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
    return NextResponse.json({ error: "Erro ao processar cartão." }, { status: 502 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? "pagador@brisadigital.com";

  // Charge the card
  let result;
  try {
    result = await new Payment(mpClient).create({
      body: {
        transaction_amount: numAmount,
        description:        "Depósito na plataforma Brisa Digital",
        installments:       1,
        token,
        payment_method_id:  card.brand ?? "visa",
        payer: {
          id:    card.mp_customer_id,
          email,
          type:  "customer",
        },
        metadata: { type: "wallet_deposit_card", user_id: user.id },
      },
      requestOptions: { idempotencyKey: `wallet-deposit-card-${user.id}-${Date.now()}` },
    });
  } catch (err) {
    console.error("[wallet-deposit-card] Payment.create failed:", err);
    return NextResponse.json({ error: "Pagamento falhou. Tente novamente." }, { status: 502 });
  }

  if (result.status === "rejected") {
    return NextResponse.json(
      { error: "Pagamento recusado pela operadora.", detail: result.status_detail },
      { status: 402 }
    );
  }

  // Credit wallet balance atomically via RPC
  await supabase.rpc("increment_wallet_balance", {
    p_user_id: user.id,
    p_amount:  numAmount,
  });

  // Record the deposit
  await supabase.from("wallet_transactions").insert({
    user_id:     user.id,
    type:        "deposit",
    amount:      numAmount,
    description: `Depósito via cartão ${card.brand?.toUpperCase() ?? ""} •••• ${card.last_four ?? ""}`.trim(),
    payment_id:  String(result.id),
  });

  return NextResponse.json({ success: true, amount: numAmount });
}
