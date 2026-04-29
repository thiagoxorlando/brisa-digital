import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// POST /api/payments/wallet-deposit
// Body: { amount: number }
// Creates a Stripe Checkout session to top up the agency internal wallet.
// The wallet balance is credited only by the Stripe webhook after payment.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { amount?: unknown };
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Valor invalido." }, { status: 400 });
  }

  if (parseFloat(amount.toFixed(2)) !== amount) {
    return NextResponse.json({ error: "Valor invalido." }, { status: 400 });
  }

  if (amount > 100_000) {
    return NextResponse.json({ error: "Valor excede o limite por deposito." }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem depositar na carteira." }, { status: 403 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? user.email ?? null;

  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: user.id,
      type: "deposit",
      amount,
      description: "Deposito via Stripe Checkout - aguardando pagamento",
      provider: "stripe",
      provider_status: "pending_checkout",
      status: "pending",
      idempotency_key: `stripe_wallet_deposit_pending:${user.id}:${randomUUID()}`,
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[stripe wallet deposit] failed to create pending transaction", txErr?.message);
    return NextResponse.json({ error: "Erro ao criar deposito." }, { status: 500 });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(supabase, user.id, email);
    const amountInCents = Math.round(amount * 100);

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: amountInCents,
            product_data: { name: "Credito de carteira BrisaHub" },
          },
        },
      ],
      metadata: {
        type: "wallet_deposit",
        user_id: user.id,
        wallet_transaction_id: txRecord.id,
        amount: amount.toFixed(2),
      },
      payment_intent_data: {
        metadata: {
          type: "wallet_deposit",
          user_id: user.id,
          wallet_transaction_id: txRecord.id,
        },
      },
      success_url: `${APP_URL}/agency/finances?stripe_wallet=success`,
      cancel_url: `${APP_URL}/agency/finances?stripe_wallet=cancel`,
    });

    await supabase
      .from("wallet_transactions")
      .update({ reference_id: checkoutSession.id })
      .eq("id", txRecord.id);

    if (!checkoutSession.url) {
      throw new Error("Stripe Checkout session URL missing.");
    }

    console.log("[stripe wallet deposit] checkout created", {
      sessionId: checkoutSession.id,
      txId: txRecord.id,
      userId: user.id,
      amount,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      session_id: checkoutSession.id,
      tx_id: txRecord.id,
      amount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe wallet deposit] checkout failed", {
      txId: txRecord.id,
      userId: user.id,
      error: message,
    });

    await supabase
      .from("wallet_transactions")
      .update({
        status: "failed",
        provider_status: "checkout_failed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", txRecord.id);

    return NextResponse.json({ error: "Erro ao abrir pagamento Stripe." }, { status: 500 });
  }
}
