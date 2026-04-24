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
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const {
    plan,
    chargeImmediately,
    useWallet,
    savedCardId,
  } = (await req.json()) as {
    plan?: string;
    chargeImmediately?: boolean;
    useWallet?: boolean;
    savedCardId?: string;
  };

  if (!plan || !PLAN_KEYS.includes(plan as Plan)) {
    return NextResponse.json({ error: "Plano invalido" }, { status: 400 });
  }

  const selectedPlan = plan as Plan;

  if (selectedPlan === "premium") {
    return NextResponse.json({ error: "Plano Premium em breve. Selecione o plano Pro." }, { status: 403 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, plan, wallet_balance")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem alterar planos" }, { status: 403 });
  }

  const currentPlan = profile?.plan ?? "free";

  if (currentPlan === selectedPlan) {
    return NextResponse.json({ error: "Voce ja esta neste plano" }, { status: 400 });
  }

  const nextBillingDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  })();

  if (!chargeImmediately && selectedPlan !== "free") {
    return NextResponse.json(
      { error: "Planos pagos precisam de pagamento aprovado para ativacao" },
      { status: 403 },
    );
  }

  if (chargeImmediately && useWallet && selectedPlan !== "free") {
    const amount = PLAN_PRICES[selectedPlan];
    const balance = Number(profile?.wallet_balance ?? 0);

    if (balance < amount) {
      return NextResponse.json(
        { error: "Saldo insuficiente na carteira", available: balance, required: amount },
        { status: 402 },
      );
    }

    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    const { error: walletErr } = await supabase
      .from("profiles")
      .update({
        wallet_balance: balance - amount,
        plan: selectedPlan,
        plan_status: "active",
        plan_expires_at: newExpiry.toISOString(),
      })
      .eq("id", user.id)
      .gte("wallet_balance", amount)
      .select("id")
      .single();

    if (walletErr) {
      return NextResponse.json({ error: "Saldo insuficiente na carteira" }, { status: 402 });
    }

    await supabase.from("wallet_transactions").insert({
      user_id: user.id,
      type: "payment",
      amount: -amount,
      description: `Plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} - debitado da carteira`,
    });

    return NextResponse.json({
      ok: true,
      plan: selectedPlan,
      effectiveAt: new Date().toISOString(),
      expiresAt: newExpiry.toISOString(),
      paidVia: "wallet",
    });
  }

  if (chargeImmediately && selectedPlan !== "free") {
    if (!savedCardId) {
      return NextResponse.json({ error: "Cartao obrigatorio para cobranca imediata" }, { status: 400 });
    }

    const { data: card } = await supabase
      .from("saved_cards")
      .select("id, mp_card_id, mp_customer_id, brand, last_four")
      .eq("id", savedCardId)
      .eq("user_id", user.id)
      .single();

    if (!card) {
      return NextResponse.json({ error: "Cartao nao encontrado" }, { status: 404 });
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
    if (!accessToken) {
      return NextResponse.json({ error: "Configuracao de pagamento nao encontrada" }, { status: 500 });
    }

    const mpClient = new MercadoPagoConfig({ accessToken });
    const amount = PLAN_PRICES[selectedPlan];

    let token: string;
    try {
      const cardToken = await new CardToken(mpClient).create({
        body: { card_id: card.mp_card_id },
      });
      token = cardToken.id!;
    } catch (err) {
      console.error("[plan-change] CardToken.create failed:", err);
      return NextResponse.json({ error: "Falha ao processar cartao" }, { status: 502 });
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email ?? "pagador@brisadigital.com";

    let result;
    try {
      result = await new Payment(mpClient).create({
        body: {
          transaction_amount: amount,
          description: `Plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} - Brisa Digital`,
          installments: 1,
          token,
          payment_method_id: card.brand ?? "visa",
          payer: {
            id: card.mp_customer_id,
            email,
            type: "customer",
          },
          metadata: { user_id: user.id, plan: selectedPlan },
        },
        requestOptions: { idempotencyKey: `plan-change-${user.id}-${selectedPlan}-${Date.now()}` },
      });
    } catch (err) {
      console.error("[plan-change] Payment.create failed:", err);
      return NextResponse.json({ error: "Pagamento recusado pelo processador" }, { status: 502 });
    }

    if (result.status === "rejected") {
      return NextResponse.json(
        { error: "Pagamento rejeitado pelo banco", detail: result.status_detail },
        { status: 402 },
      );
    }

    if (result.status !== "approved") {
      return NextResponse.json(
        {
          error: "Pagamento ainda nao aprovado. O plano nao foi alterado.",
          paymentStatus: result.status,
          paymentId: result.id,
        },
        { status: 409 },
      );
    }

    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    await supabase
      .from("profiles")
      .update({
        plan: selectedPlan,
        plan_status: "active",
        plan_expires_at: newExpiry.toISOString(),
      })
      .eq("id", user.id);

    await supabase.from("wallet_transactions").insert({
      user_id: user.id,
      type: "payment",
      amount,
      description: `Plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} - cobranca imediata`,
    });

    return NextResponse.json({
      ok: true,
      plan: selectedPlan,
      effectiveAt: new Date().toISOString(),
      expiresAt: newExpiry.toISOString(),
      paidVia: "card",
      paymentId: result.id,
    });
  }

  if (selectedPlan === "free") {
    await supabase
      .from("profiles")
      .update({ plan: "free", plan_status: "inactive", plan_expires_at: null })
      .eq("id", user.id);

    await supabase
      .from("agencies")
      .update({ subscription_status: "cancelling" })
      .eq("id", user.id);

    return NextResponse.json({
      ok: true,
      plan: selectedPlan,
      effectiveAt: nextBillingDate.toISOString(),
      deferred: true,
    });
  }

  return NextResponse.json({ error: "Invalid plan change request" }, { status: 400 });
}
