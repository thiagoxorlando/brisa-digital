import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";

const PLAN_PRICES: Record<Plan, number> = Object.fromEntries(
  PLAN_KEYS.map((plan) => [plan, PLAN_DEFINITIONS[plan].price]),
) as Record<Plan, number>;

// POST /api/agencies/plan-change
// Body: { plan, chargeImmediately, savedCardId }
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { plan, chargeImmediately, useWallet, savedCardId } = await req.json();

  if (!plan || !PLAN_KEYS.includes(plan)) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, wallet_balance")
    .eq("id", user.id)
    .single();

  const currentPlan = profile?.plan ?? "free";

  if (currentPlan === plan) {
    return NextResponse.json({ error: "Você já está neste plano" }, { status: 400 });
  }

  // Next billing date: always 30 days from now (can't read plan_expires_at safely)
  const nextBillingDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  })();

  // ── Immediate charge via wallet ───────────────────────────────────────────
  if (chargeImmediately && useWallet && plan !== "free") {
    const amount  = PLAN_PRICES[plan as Plan];
    const balance = Number(profile?.wallet_balance ?? 0);

    if (balance < amount) {
      return NextResponse.json(
        { error: "Saldo insuficiente na carteira", available: balance, required: amount },
        { status: 402 }
      );
    }

    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    // Deduct from wallet and update plan atomically
    const { error: walletErr } = await supabase
      .from("profiles")
      .update({
        wallet_balance:  balance - amount,
        plan,
        plan_status:     "active",
        plan_expires_at: newExpiry.toISOString(),
      })
      .eq("id", user.id);

    if (walletErr) {
      return NextResponse.json({ error: walletErr.message }, { status: 500 });
    }

    await supabase.from("wallet_transactions").insert({
      user_id:     user.id,
      type:        "payment",
      amount:      -amount,
      description: `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)} — debitado da carteira`,
    });

    return NextResponse.json({
      ok: true,
      plan,
      effectiveAt: new Date().toISOString(),
      expiresAt:   newExpiry.toISOString(),
      paidVia:     "wallet",
    });
  }

  // ── Immediate charge via card (free→paid, or paid→paid upgrade chosen now) ─
  if (chargeImmediately && plan !== "free") {
    if (!savedCardId) {
      return NextResponse.json({ error: "Cartão obrigatório para cobrança imediata" }, { status: 400 });
    }

    // Fetch saved card + verify ownership
    const { data: card } = await supabase
      .from("saved_cards")
      .select("id, mp_card_id, mp_customer_id, brand, last_four")
      .eq("id", savedCardId)
      .eq("user_id", user.id)
      .single();

    if (!card) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
    if (!accessToken) {
      return NextResponse.json({ error: "Configuração de pagamento não encontrada" }, { status: 500 });
    }

    const mpClient = new MercadoPagoConfig({ accessToken });
    const amount   = PLAN_PRICES[plan];

    // Generate single-use token from saved card
    let token: string;
    try {
      const cardToken = await new CardToken(mpClient).create({
        body: { card_id: card.mp_card_id },
      });
      token = cardToken.id!;
    } catch (err) {
      console.error("[plan-change] CardToken.create failed:", err);
      return NextResponse.json({ error: "Falha ao processar cartão" }, { status: 502 });
    }

    // Fetch payer email
    const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email ?? "pagador@brisadigital.com";

    // Charge
    let result;
    try {
      result = await new Payment(mpClient).create({
        body: {
          transaction_amount: amount,
          description:        `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)} — Brisa Digital`,
          installments:       1,
          token,
          payment_method_id:  card.brand ?? "visa",
          payer: {
            id:    card.mp_customer_id,
            email,
            type:  "customer",
          },
          metadata: { user_id: user.id, plan },
        },
        requestOptions: { idempotencyKey: `plan-change-${user.id}-${plan}-${Date.now()}` },
      });
    } catch (err) {
      console.error("[plan-change] Payment.create failed:", err);
      return NextResponse.json({ error: "Pagamento recusado pelo processador" }, { status: 502 });
    }

    if (result.status === "rejected") {
      return NextResponse.json(
        { error: "Pagamento rejeitado pelo banco", detail: result.status_detail },
        { status: 402 }
      );
    }

    // New expiry = now + 30 days
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    // Update plan in profiles
    await supabase.from("profiles").update({
      plan,
      plan_status:    "active",
      plan_expires_at: newExpiry.toISOString(),
    }).eq("id", user.id);

    // Record transaction
    await supabase.from("wallet_transactions").insert({
      user_id:     user.id,
      type:        "payment",
      amount,
      description: `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)} — cobrança imediata`,
      payment_id:  String(result.id),
    });

    return NextResponse.json({
      ok: true,
      plan,
      effectiveAt: new Date().toISOString(),
      expiresAt:   newExpiry.toISOString(),
      paymentId:   result.id,
    });
  }

  // ── Deferred change (next billing cycle) ──────────────────────────────────
  // For downgrade or upgrade-later: update plan in DB now.
  // plan_expires_at is preserved — the old plan features continue until then.
  await supabase.from("profiles").update({ plan }).eq("id", user.id);

  // If downgrading to free, mark plan_status inactive at next cycle
  if (plan === "free") {
    // Keep plan_status active until expires; a cron/webhook would finalize.
    // For now just mark the intent.
    await supabase.from("agencies")
      .update({ subscription_status: "cancelling" })
      .eq("id", user.id);
  }

  return NextResponse.json({
    ok: true,
    plan,
    effectiveAt: nextBillingDate.toISOString(),
    deferred: true,
  });
}
