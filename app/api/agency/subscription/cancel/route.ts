/**
 * POST /api/agency/subscription/cancel
 *
 * Cancels the agency's Stripe subscription immediately.
 *
 * Key invariant: we look up the live subscription in Stripe even when
 * profiles.plan="free" — because billing page Pass 2 updates the plan
 * asynchronously (it was "void update(...)"). If the user cancels before
 * that async write completes the DB still shows "free" even though the
 * Stripe subscription is active. We must NOT bail out early.
 *
 * Lookup order for stripe_subscription_id:
 *   1. profiles.stripe_subscription_id (direct column)
 *   2. Stripe customer subscription list via profiles.stripe_customer_id
 */

import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("plan, plan_status, stripe_subscription_id, stripe_customer_id, asaas_subscription_id, subscription_provider")
    .eq("id", user.id)
    .single();

  const profile               = profileRow as Record<string, unknown> | null;
  let   stripeSubscriptionId  = (profile?.stripe_subscription_id as string | null) ?? null;
  const stripeCustomerId      = (profile?.stripe_customer_id      as string | null) ?? null;
  const asaasSubscriptionId   = (profile?.asaas_subscription_id   as string | null) ?? null;
  const subscriptionProvider  = (profile?.subscription_provider   as string | null) ?? "asaas";
  const currentPlanStatus     = (profile?.plan_status              as string | null) ?? "inactive";

  // Already canceled — idempotent. Note: do NOT check currentPlan === "free" here.
  // Billing page Pass 2 shows PRO from Stripe live without updating DB immediately.
  // The DB can still say "free" while a live Stripe subscription exists.
  if (currentPlanStatus === "canceled" || currentPlanStatus === "cancelled") {
    return NextResponse.json({ ok: true, message: "Subscription already canceled." });
  }

  // ── Stripe path ───────────────────────────────────────────────────────────────

  const isStripeUser = subscriptionProvider === "stripe" || !!stripeSubscriptionId || !!stripeCustomerId;

  if (isStripeUser) {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured on this server." },
        { status: 503 },
      );
    }

    const stripe = getStripe();

    // If we don't have a subscription ID, look up the active subscription from
    // the customer record. This happens when billing page Pass 2 hadn't yet
    // written stripe_subscription_id to the DB when cancel was clicked.
    if (!stripeSubscriptionId && stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 10,
        });
        const active = subs.data.find(
          (s) => s.status === "trialing" || s.status === "active" || s.status === "past_due",
        );
        if (active) {
          stripeSubscriptionId = active.id;
          console.log("[subscription/cancel] resolved sub via customer list", {
            userId:         user.id,
            customerId:     stripeCustomerId,
            subscriptionId: stripeSubscriptionId,
            status:         active.status,
          });
        }
      } catch (err) {
        console.warn("[subscription/cancel] could not list customer subscriptions:", String(err));
      }
    }

    if (!stripeSubscriptionId) {
      // No Stripe subscription found anywhere — DB-only cleanup is all we can do.
      console.warn("[subscription/cancel] no stripe subscription found; cleaning DB only", {
        userId: user.id,
      });
      await cancelInDatabase(supabase, user.id);
      return NextResponse.json({ ok: true });
    }

    try {
      const canceledSub = await stripe.subscriptions.cancel(stripeSubscriptionId);
      console.log("[subscription/cancel] Stripe subscription canceled", {
        userId:         user.id,
        subscriptionId: stripeSubscriptionId,
        status:         canceledSub.status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No such subscription") || msg.includes("resource_missing")) {
        // Already gone on Stripe's side — clean up DB.
        console.warn("[subscription/cancel] Stripe subscription already gone", {
          userId: user.id, stripeSubscriptionId,
        });
      } else {
        console.error("[subscription/cancel] Stripe cancel failed", { userId: user.id, msg });
        return NextResponse.json({ error: `Failed to cancel subscription: ${msg}` }, { status: 502 });
      }
    }

    await cancelInDatabase(supabase, user.id);
    await sendCancelNotification(user.id);

    console.log("[subscription/cancel] complete — profile set to free/canceled", { userId: user.id });
    return NextResponse.json({ ok: true });
  }

  // ── Asaas fallback (legacy Brazilian agencies) ────────────────────────────────

  if (asaasSubscriptionId) {
    try {
      const { cancelSubscription } = await import("@/lib/asaas");
      await cancelSubscription(asaasSubscriptionId);
      console.log("[subscription/cancel] Asaas subscription canceled", {
        userId: user.id, asaasSubscriptionId,
      });
    } catch (err) {
      console.warn("[subscription/cancel] Asaas cancel non-fatal:", String(err));
    }
  }

  await cancelInDatabase(supabase, user.id);
  await sendCancelNotification(user.id);
  return NextResponse.json({ ok: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cancelInDatabase(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      plan:                   "free",
      plan_status:            "canceled",
      trial_ends_at:          null,
      stripe_subscription_id: null,
      plan_expires_at:        null,
    } as Record<string, unknown>)
    .eq("id", userId);

  if (error) {
    console.error("[subscription/cancel] DB update failed", { userId, error: error.message });
    throw new Error(`DB update failed: ${error.message}`);
  }
}

async function sendCancelNotification(userId: string) {
  try {
    const { notify } = await import("@/lib/notify");
    const { renderNotificationTemplate } = await import("@/lib/notificationTemplates");
    const { title, body, link } = renderNotificationTemplate("subscription_canceled", {});
    await notify([userId], "billing", `${title}: ${body}`, link, `subscription_canceled:${userId}`);
  } catch (err) {
    console.warn("[subscription/cancel] notification failed (non-fatal):", String(err));
  }
}
