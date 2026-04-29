import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

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
  if (selectedPlan === "premium") {
    return NextResponse.json({ error: "Plano Premium em breve. Selecione o plano Pro." }, { status: 403 });
  }

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

  if (selectedPlan === "free") {
    // Fetch stripe_subscription_id separately — only needed here, and column may not exist
    // in older DB instances; handle gracefully so plan cancellation still works.
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
      })
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

  if (body.chargeImmediately === false) {
    return NextResponse.json(
      { error: "Planos pagos precisam passar pelo Stripe Billing." },
      { status: 400 },
    );
  }

  const definition = PLAN_DEFINITIONS[selectedPlan];
  const amountInCents = Math.round(definition.price * 100);
  if (amountInCents <= 0) {
    return NextResponse.json({ error: "Valor do plano invalido." }, { status: 400 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? user.email ?? null;
  const customerId = await getOrCreateStripeCustomer(supabase, user.id, email);

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: amountInCents,
          recurring: { interval: "month" },
          product_data: { name: `BrisaHub ${definition.label}` },
        },
      },
    ],
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
    success_url: `${APP_URL}/agency/billing?stripe_plan=success`,
    cancel_url: `${APP_URL}/agency/billing?stripe_plan=cancel`,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Stripe nao retornou URL de assinatura." }, { status: 500 });
  }

  console.log("[stripe billing] checkout created", {
    sessionId: checkoutSession.id,
    userId: user.id,
    plan: selectedPlan,
  });

  return NextResponse.json({
    ok: true,
    provider: "stripe",
    url: checkoutSession.url,
    session_id: checkoutSession.id,
  });
}
