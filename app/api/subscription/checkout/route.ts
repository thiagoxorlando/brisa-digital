import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// POST /api/subscription/checkout
// Body: { card_id: string }   ← DB uuid of a saved_cards row
//
// Charges the subscription fee against the saved card.
// Webhook receives the approved event and activates the plan.
//
// Returns: { payment_id, status }

const PLAN_PRICE_BRL = 99; // R$ 99 / month

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { card_id } = await req.json();
  if (!card_id) return NextResponse.json({ error: "card_id is required" }, { status: 400 });

  const supabase     = createServerClient({ useServiceRole: true });
  const accessToken  = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const mpClient     = new MercadoPagoConfig({ accessToken });

  // ── Fetch saved card (ownership check) ───────────────────────────────────
  const { data: card, error: cardErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id, brand")
    .eq("id", card_id)
    .eq("user_id", user.id)
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // ── Guard: already active plan ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profile?.plan && profile.plan !== "free") {
    return NextResponse.json({ error: "Plan already active" }, { status: 409 });
  }

  // ── Generate single-use payment token from saved card ─────────────────────
  let token: string;
  try {
    const cardToken = await new CardToken(mpClient).create({
      body: { card_id: card.mp_card_id },
    });
    token = cardToken.id!;
  } catch (err) {
    console.error("[subscription/checkout] CardToken.create failed:", err);
    return NextResponse.json({ error: "Failed to tokenize card" }, { status: 502 });
  }

  // ── Fetch payer email ─────────────────────────────────────────────────────
  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? "pagador@brisadigital.com";

  // ── Charge subscription fee ───────────────────────────────────────────────
  let result;
  try {
    result = await new Payment(mpClient).create({
      body: {
        transaction_amount: PLAN_PRICE_BRL,
        description:        "Brisa Digital — Assinatura Pro (mensal)",
        installments:       1,
        token,
        payment_method_id:  card.brand ?? "visa",
        payer: {
          id:    card.mp_customer_id,
          email,
          type:  "customer",
        },
        metadata: {
          type:    "subscription",
          user_id: user.id,
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/mercadopago`,
      },
      requestOptions: { idempotencyKey: `sub-checkout-${user.id}-${Date.now()}` },
    });
  } catch (err) {
    console.error("[subscription/checkout] Payment.create failed:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 502 });
  }

  if (result.status === "rejected") {
    // Mark plan as past_due immediately on rejection
    await supabase
      .from("profiles")
      .update({ plan_status: "past_due" })
      .eq("id", user.id);

    return NextResponse.json(
      { error: "Payment rejected", detail: result.status_detail },
      { status: 402 }
    );
  }

  // If approved synchronously (some card types) — activate plan immediately.
  // The webhook will also fire; idempotency guard there prevents double activation.
  if (result.status === "approved") {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase
      .from("profiles")
      .update({
        plan:            "pro",
        plan_status:     "active",
        plan_expires_at: expiresAt.toISOString(),
      })
      .eq("id", user.id);

    await supabase.from("wallet_transactions").insert({
      user_id:      user.id,
      type:         "payment",
      amount:       PLAN_PRICE_BRL,
      description:  "Assinatura Pro — Brisa Digital",
      payment_id:   String(result.id),
      reference_id: "subscription",
    });
  }

  return NextResponse.json({ payment_id: result.id, status: result.status });
}
