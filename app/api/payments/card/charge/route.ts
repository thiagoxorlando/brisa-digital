import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// POST /api/payments/card/charge
// Body: { card_id: string (DB uuid), amount: number, description: string }
//
// Used for subscription payments — charges a saved card without user interaction.
// Returns: { payment_id, status }

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { card_id, amount, description } = await req.json();

  if (!card_id)           return NextResponse.json({ error: "card_id is required" }, { status: 400 });
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch saved card + verify ownership
  const { data: card, error: fetchErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id, brand, last_four")
    .eq("id", card_id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const mpClient    = new MercadoPagoConfig({ accessToken });

  // Generate a single-use payment token from the saved card
  let token: string;
  try {
    const cardToken = await new CardToken(mpClient).create({
      body: { card_id: card.mp_card_id },
    });
    token = cardToken.id!;
  } catch (err) {
    console.error("[card/charge] CardToken.create failed:", err);
    return NextResponse.json({ error: "Failed to generate payment token" }, { status: 502 });
  }

  // Fetch payer email
  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? "pagador@brisadigital.com";

  // Charge the card
  let result;
  try {
    result = await new Payment(mpClient).create({
      body: {
        transaction_amount: amount,
        description:        description ?? "Pagamento — Brisa Digital",
        installments:       1,
        token,
        payment_method_id:  card.brand ?? "visa",
        payer: {
          id:    card.mp_customer_id,
          email,
          type:  "customer",
        },
        metadata: { user_id: user.id, card_id: card.id },
      },
      requestOptions: { idempotencyKey: `card-charge-${user.id}-${Date.now()}` },
    });
  } catch (err) {
    console.error("[card/charge] Payment.create failed:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 502 });
  }

  if (result.status === "rejected") {
    return NextResponse.json(
      { error: "Payment rejected", detail: result.status_detail },
      { status: 402 }
    );
  }

  // Record in wallet_transactions
  await supabase.from("wallet_transactions").insert({
    user_id:     user.id,
    type:        "payment",
    amount,
    description: description ?? "Pagamento com cartão",
    payment_id:  String(result.id),
  });

  return NextResponse.json({ payment_id: result.id, status: result.status });
}
