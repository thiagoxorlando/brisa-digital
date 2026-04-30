import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BLOCKING_PLAN_STATUSES = new Set(["active", "trialing", "past_due", "cancelling", "cancel_at_period_end"]);

type StripeProfileState = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
};

function getStripePriceId(plan: Plan): string | null {
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID ?? null;
  if (plan === "premium") return process.env.STRIPE_PREMIUM_PRICE_ID ?? null;
  return null;
}

function hasBlockingPlanStatus(status: string | null | undefined) {
  return typeof status === "string" && BLOCKING_PLAN_STATUSES.has(status);
}

function isBlockingStripeSubscription(subscription: Awaited<ReturnType<ReturnType<typeof getStripe>["subscriptions"]["list"]>>["data"][number]) {
  return (
    subscription.status === "active" ||
    subscription.status === "trialing" ||
    subscription.status === "past_due" ||
    Boolean(subscription.cancel_at_period_end)
  );
}

// POST /api/agencies/plan-change
// Paid agency plans are handled by Stripe Billing Checkout.
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    plan?: string;
  };

  if (!body.plan || !PLAN_KEYS.includes(body.plan as Plan)) {
    return NextResponse.json({ error: "Plano invalido" }, { status: 400 });
  }

  const selectedPlan = body.plan as Plan;

  if (selectedPlan === "premium") {
    console.warn("[plan] premium temporarily disabled", { userId: user.id });
    return NextResponse.json({ error: "Premium ainda não está disponível." }, { status: 400 });
  }

  if (selectedPlan !== "free" && !isStripeConfigured()) {
    console.error("[plan] Stripe not configured — STRIPE_SECRET_KEY is missing");
    return NextResponse.json({ error: "Pagamento nao configurado no servidor." }, { status: 503 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, plan, plan_status")
    .eq("id", user.id)
    .single();

  let stripeProfile: StripeProfileState | null = null;

  try {
    const stripeProfileResult = await supabase
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id, stripe_subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    stripeProfile = (stripeProfileResult.data as StripeProfileState | null) ?? null;

    if (stripeProfileResult.error) {
      console.warn("[plan] optional stripe profile lookup failed", {
        userId: user.id,
        error: stripeProfileResult.error.message,
      });
    }
  } catch (err) {
    console.warn("[plan] optional stripe profile columns unavailable", {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

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

  const currentPlanStatus = profile?.plan_status ?? null;
  const existingSubscriptionId = stripeProfile?.stripe_subscription_id ?? null;
  const existingCustomerId = stripeProfile?.stripe_customer_id ?? null;
  const existingSubscriptionStatus = stripeProfile?.stripe_subscription_status ?? null;

  if (
    selectedPlan !== "free" &&
    existingSubscriptionId &&
    (hasBlockingPlanStatus(currentPlanStatus) || hasBlockingPlanStatus(existingSubscriptionStatus))
  ) {
    console.warn("[plan] blocked duplicate subscription from profile state", {
      userId: user.id,
      selectedPlan,
      currentPlan,
      currentPlanStatus,
      existingSubscriptionId,
      existingSubscriptionStatus,
    });
    return NextResponse.json({ error: "Você já possui uma assinatura ativa." }, { status: 400 });
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
    customerId = existingCustomerId ?? await getOrCreateStripeCustomer(supabase, user.id, email);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[plan] getOrCreateStripeCustomer failed", { userId: user.id, error: message });
    return NextResponse.json({ error: "Erro ao preparar cliente Stripe." }, { status: 500 });
  }

  try {
    const subscriptions = await getStripe().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const blockingSubscription = subscriptions.data.find(isBlockingStripeSubscription);

    if (blockingSubscription) {
      console.warn("[plan] blocked duplicate subscription from Stripe", {
        userId: user.id,
        customerId,
        selectedPlan,
        subscriptionId: blockingSubscription.id,
        status: blockingSubscription.status,
        cancelAtPeriodEnd: blockingSubscription.cancel_at_period_end,
      });
      return NextResponse.json({ error: "Você já possui uma assinatura ativa." }, { status: 400 });
    }
  } catch (err) {
    console.error("[plan] failed to inspect Stripe subscriptions", {
      userId: user.id,
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Nao foi possivel verificar assinaturas existentes no Stripe." }, { status: 500 });
  }

  const stripePriceId = getStripePriceId(selectedPlan);
  if (!stripePriceId) {
    console.error("[plan] stripe price id not configured", { plan: selectedPlan });
    return NextResponse.json({ error: `Stripe price id missing for plan ${selectedPlan}` }, { status: 500 });
  }

  const lineItems = [{ price: stripePriceId, quantity: 1 }];

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
