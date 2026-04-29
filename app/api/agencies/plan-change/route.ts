import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Returns the Stripe Price ID for a plan from env vars, e.g. STRIPE_PRICE_PRO_ID.
// If not configured, falls back to inline price_data so the checkout still works.
function getStripePriceId(plan: Plan): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_ID`;
  return process.env[key] ?? null;
}

// POST /api/agencies/plan-change
// Paid agency plans are handled by Stripe Billing Checkout.
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    plan?: string;
    chargeImmediately?: boolean;
  };

  if (!body.plan || !PLAN_KEYS.includes(body.plan as Plan)) {
    return NextResponse.json({ error: "Plano invalido" }, { status: 400 });
  }

  const selectedPlan = body.plan as Plan;

  const supabase = createServerClient({ useServiceRole: true });

  // Select only stable columns — stripe_subscription_id was added in a later migration
  // and may not exist yet in production. Fetching it here would make the query fail and
  // return a null profile, which incorrectly blocks the role check.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .single();

  console.log("[plan] role check", {
    userId: user.id,
    role: profile?.role ?? null,
    isAgency: profile?.role === "agency",
    queryError: profileError?.message ?? null,
  });

  if (profileError) {
    console.error("[plan] profile query failed", { userId: user.id, error: profileError.message });
    return NextResponse.json({ error: "Erro interno ao verificar perfil." }, { status: 500 });
  }

  if (profile?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem alterar planos" }, { status: 403 });
  }

  const currentPlan = profile?.plan ?? "free";
  if (currentPlan === selectedPlan) {
    return NextResponse.json({ error: "Voce ja esta neste plano" }, { status: 400 });
  }

  // ── Cancel / downgrade to free ────────────────────────────────────────────────
  if (selectedPlan === "free") {
    // Fetch stripe_subscription_id separately — column may not exist in older DB instances.
    let subscriptionId: string | null = null;
    try {
      const { data: stripeProfile } = await supabase
        .from("profiles")
        .select("stripe_subscription_id")
        .eq("id", user.id)
        .maybeSingle();
      subscriptionId = (stripeProfile as Record<string, unknown> | null)?.stripe_subscription_id as string | null ?? null;
    } catch {
      // Column does not exist yet — treated as no active subscription
    }

    if (subscriptionId) {
      try {
        await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        console.log("[plan] subscription cancel_at_period_end scheduled", {
          userId: user.id,
          subscriptionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[stripe billing] cancel at period end failed", {
          userId: user.id,
          subscriptionId,
          error: message,
        });
        return NextResponse.json({ error: "Nao foi possivel cancelar a assinatura no Stripe." }, { status: 500 });
      }
    }

    const effectiveAt = new Date();
    effectiveAt.setDate(effectiveAt.getDate() + 30);

    await supabase
      .from("profiles")
      .update({
        plan_status: "cancelling",
        stripe_subscription_status: subscriptionId ? "cancel_at_period_end" : "inactive",
      } as Record<string, unknown>)
      .eq("id", user.id);

    await supabase
      .from("agencies")
      .update({ subscription_status: "cancelling" })
      .eq("id", user.id);

    return NextResponse.json({
      ok: true,
      plan: selectedPlan,
      effectiveAt: effectiveAt.toISOString(),
      deferred: true,
      provider: "stripe",
    });
  }

  // ── Paid plan upgrade via Stripe Checkout ────────────────────────────────────
  const definition = PLAN_DEFINITIONS[selectedPlan];
  const amountInCents = Math.round(definition.price * 100);
  if (amountInCents <= 0) {
    return NextResponse.json({ error: "Valor do plano invalido." }, { status: 400 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? user.email ?? null;

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(supabase, user.id, email);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[plan] getOrCreateStripeCustomer failed", { userId: user.id, error: message });
    return NextResponse.json({ error: "Erro ao preparar cliente Stripe." }, { status: 500 });
  }

  // Use pre-configured Stripe Price ID if available; fall back to inline price_data.
  const stripePriceId = getStripePriceId(selectedPlan);

  const lineItems = stripePriceId
    ? [{ price: stripePriceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: amountInCents,
            recurring: { interval: "month" as const },
            product_data: { name: `BrisaHub ${definition.label}` },
          },
        },
      ];

  let checkoutSession: Awaited<ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]>>;
  try {
    checkoutSession = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: {
        type: "plan_subscription",
        user_id: user.id,
        plan: selectedPlan,
      },
      subscription_data: {
        metadata: {
          type: "plan_subscription",
          user_id: user.id,
          plan: selectedPlan,
        },
      },
      success_url: `${APP_URL}/agency/billing?success=true`,
      cancel_url:  `${APP_URL}/agency/billing?canceled=true`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[plan] stripe checkout session create failed", {
      userId: user.id,
      plan: selectedPlan,
      error: message,
    });
    return NextResponse.json({ error: "Erro ao criar sessao de pagamento Stripe." }, { status: 500 });
  }

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Stripe nao retornou URL de assinatura." }, { status: 500 });
  }

  console.log("[stripe billing] checkout created", {
    sessionId: checkoutSession.id,
    userId: user.id,
    plan: selectedPlan,
    priceId: stripePriceId ?? "inline_price_data",
  });

  return NextResponse.json({
    ok: true,
    provider: "stripe",
    url: checkoutSession.url,
    session_id: checkoutSession.id,
  });
}
