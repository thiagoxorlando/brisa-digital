/**
 * POST /api/stripe/create-checkout
 *
 * Creates a Stripe Checkout Session for the PRO plan.
 * Returns { url } — redirect the browser to this URL to start checkout.
 *
 * Billing model:
 *   7-day free trial  →  $29 first month  →  $79/month thereafter
 *
 * Implementation:
 *   - Subscription mode with trial_period_days from plan_settings.
 *   - A "once" coupon covering the intro discount ($79 − $29 = $50)
 *     is applied to the subscription so only the first invoice is
 *     discounted; subsequent invoices charge the full recurring price.
 *   - All prices / product / coupon IDs are derived from plan_settings
 *     (admin-controlled) — nothing is hardcoded.
 *
 * Safety:
 *   - Asaas is NOT touched. Existing Asaas flows are unaffected.
 *   - The session is not connected to plan activation yet;
 *     that happens when the stripe webhook delivers invoice.paid.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import {
  getStripe,
  assertStripeConfigured,
  getOrCreateProPrice,
  getOrCreateIntroCoupon,
} from "@/lib/stripe";

export async function POST(_req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Config guard ───────────────────────────────────────────────────────────

  try {
    assertStripeConfigured();
  } catch {
    return NextResponse.json(
      { error: "Stripe billing is not yet configured on this server." },
      { status: 503 }
    );
  }

  const stripe   = getStripe();
  const supabase = createServerClient({ useServiceRole: true });

  // ── Existing subscription guard ────────────────────────────────────────────

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, plan, plan_status")
    .eq("id", user.id)
    .single();

  if (
    profile?.stripe_subscription_id &&
    profile?.plan_status !== "canceled" &&
    profile?.plan_status !== "incomplete_expired"
  ) {
    return NextResponse.json(
      { error: "You already have an active subscription. Use the billing portal to manage it." },
      { status: 400 }
    );
  }

  // ── Plan settings (admin-controlled, no hardcoded prices) ─────────────────

  const planSetting = await getLivePlanSetting("pro");
  const {
    trial_days,
    intro_price,
    intro_cycles,
    recurring_price,
    currency,
    name: planName,
  } = planSetting;

  if (!planSetting.is_available) {
    return NextResponse.json({ error: "PRO plan is not currently available." }, { status: 400 });
  }

  // ── Find or create Stripe Price ────────────────────────────────────────────
  // Prices are looked up by a deterministic lookup_key so we never create
  // duplicates across deploys.

  const priceId = await getOrCreateProPrice(stripe, {
    recurringPrice: recurring_price,
    currency:       currency.toLowerCase(),
    planName,
  });

  // ── Find or create intro coupon ────────────────────────────────────────────
  // Only attach a coupon when intro pricing is configured and the recurring
  // price actually differs from the intro price.

  let couponId: string | undefined;
  if (
    intro_price > 0 &&
    intro_cycles > 0 &&
    recurring_price > 0 &&
    intro_price < recurring_price
  ) {
    couponId = await getOrCreateIntroCoupon(stripe, {
      introPrice:     intro_price,
      recurringPrice: recurring_price,
      currency:       currency.toLowerCase(),
    });
  }

  // ── Build app URL (supports localhost in dev) ──────────────────────────────

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://brisahub.com.br").replace(/\/$/, "");

  // ── Create Checkout Session ────────────────────────────────────────────────

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode:     "subscription",
    currency: currency.toLowerCase(),

    // Metadata propagated to subscription and visible in webhooks
    metadata: {
      user_id:  user.id,
      plan_key: "pro",
    },

    line_items: [
      { price: priceId, quantity: 1 },
    ],

    subscription_data: {
      trial_period_days: trial_days > 0 ? trial_days : undefined,
      trial_settings: trial_days > 0
        ? { end_behavior: { missing_payment_method: "cancel" } }
        : undefined,
      metadata: {
        user_id:  user.id,
        plan_key: "pro",
      },
    },

    // Apply intro coupon when configured
    ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),

    // Re-use existing Stripe customer if the user has checked out before
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email ?? undefined }
    ),

    // Require card up-front (prevent trial without a payment method on file)
    payment_method_collection: "always",

    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/pricing`,

    // Let Stripe collect a billing address (required for tax compliance)
    billing_address_collection: "auto",

    // NOTE: allow_promotion_codes must NOT be set when `discounts` is present —
    // Stripe rejects sessions that include both parameters simultaneously.
    // When discounts is set (intro coupon), Stripe automatically hides the
    // promo code input. When there is no coupon, omitting this field is also
    // correct: we do not expose a promo code field at launch.
  };

  let checkoutSession: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    checkoutSession = await stripe.checkout.sessions.create(sessionParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe session creation failed";
    console.error("[stripe/create-checkout] session creation error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: "Stripe returned a session without a URL." },
      { status: 502 }
    );
  }

  console.log(
    `[stripe/create-checkout] session created: user=${user.id} session=${checkoutSession.id}`,
    `trial=${trial_days}d intro=${intro_price} recurring=${recurring_price} ${currency}`
  );

  return NextResponse.json({ url: checkoutSession.url });
}
