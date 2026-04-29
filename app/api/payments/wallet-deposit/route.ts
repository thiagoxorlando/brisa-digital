import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STRIPE_CHECKOUT_HOSTS = new Set(["checkout.stripe.com", "pay.stripe.com"]);
const STRIPE_WALLET_DEPOSIT_DESCRIPTION = "Depósito via Stripe Checkout";

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
      description: STRIPE_WALLET_DEPOSIT_DESCRIPTION,
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
    const currency = "brl";

    if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
      throw new Error(`Invalid deposit conversion. amount=${amount} amountInCents=${amountInCents}`);
    }

    const metadata = {
      type: "wallet_deposit",
      user_id: user.id,
      wallet_transaction_id: txRecord.id,
      amount: amount.toFixed(2),
    };

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountInCents,
            product_data: { name: "Credito de carteira BrisaHub" },
          },
        },
      ],
      metadata,
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

    if (!checkoutSession.url) {
      throw new Error("Stripe Checkout session URL missing.");
    }

    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(checkoutSession.url);
    } catch {
      throw new Error(`Stripe Checkout session URL is invalid: ${checkoutSession.url}`);
    }

    if (checkoutUrl.protocol !== "https:" || !STRIPE_CHECKOUT_HOSTS.has(checkoutUrl.hostname)) {
      throw new Error(`Stripe Checkout session URL is not a hosted Stripe URL: ${checkoutSession.url}`);
    }

    await supabase
      .from("wallet_transactions")
      .update({ reference_id: checkoutSession.id })
      .eq("id", txRecord.id);

    console.log("[stripe wallet deposit] checkout created", {
      sessionId: checkoutSession.id,
      sessionUrl: checkoutSession.url,
      txId: txRecord.id,
      userId: user.id,
      amount,
      amountInCents,
      currency,
      mode: checkoutSession.mode,
      metadata,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      session_id: checkoutSession.id,
      tx_id: txRecord.id,
      amount,
      amount_in_cents: amountInCents,
      currency,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe wallet deposit] checkout failed", {
      txId: txRecord.id,
      userId: user.id,
      amount,
      error: message,
    });

    await supabase
      .from("wallet_transactions")
      .update({
        status: "failed",
        provider_status: "checkout_failed",
        admin_note: `Stripe Checkout failed: ${message}`.slice(0, 500),
        processed_at: new Date().toISOString(),
      })
      .eq("id", txRecord.id);

    return NextResponse.json({
      error: `Erro ao criar sessao do Stripe Checkout: ${message}`,
    }, { status: 500 });
  }
}
