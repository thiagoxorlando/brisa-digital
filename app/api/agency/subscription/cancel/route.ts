/**
 * POST /api/agency/subscription/cancel
 *
 * Cancels the agency's subscription. Works for both trial and active subscriptions.
 *
 * Stripe strategy: cancel_at_period_end = false (immediate cancellation).
 * Rationale: For a 7-day trial, "cancel at period end" would mean the user
 * keeps PRO access until the trial naturally expires — but since no charge
 * has been made yet, there's no benefit to the user and it adds complexity.
 * Immediate cancellation revokes access now and prevents any future charge.
 *
 * Idempotency: safe to call multiple times — Stripe returns the already-
 * canceled subscription on repeat calls; Supabase update is a no-op if state
 * is already "canceled".
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
    .select("plan, plan_status, stripe_subscription_id, asaas_subscription_id, subscription_provider")
    .eq("id", user.id)
    .single();

  const profile = profileRow as Record<string, unknown> | null;
  const stripeSubscriptionId  = (profile?.stripe_subscription_id  as string | null) ?? null;
  const asaasSubscriptionId   = (profile?.asaas_subscription_id   as string | null) ?? null;
  const subscriptionProvider  = (profile?.subscription_provider   as string | null) ?? "asaas";
  const currentPlan           = (profile?.plan                     as string | null) ?? "free";
  const currentPlanStatus     = (profile?.plan_status              as string | null) ?? "inactive";

  // Nothing to cancel
  if (currentPlan === "free") {
    return NextResponse.json({ ok: true, message: "Already on free plan." });
  }

  // Already canceled — idempotent
  if (currentPlanStatus === "canceled" || currentPlanStatus === "cancelled") {
    return NextResponse.json({ ok: true, message: "Subscription already canceled." });
  }

  // ── Stripe cancellation ───────────────────────────────────────────────────────

  if (subscriptionProvider === "stripe" || stripeSubscriptionId) {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured on this server." },
        { status: 503 },
      );
    }

    if (!stripeSubscriptionId) {
      // No Stripe subscription ID — update DB directly (edge case: checkout
      // completed but subscription events haven't fired yet).
      console.warn("[subscription/cancel] no stripe_subscription_id on Stripe user; updating DB only", {
        userId: user.id,
      });
      await cancelInDatabase(supabase, user.id);
      return NextResponse.json({ ok: true });
    }

    const stripe = getStripe();

    try {
      // Cancel immediately — prevents any future charges including end-of-trial.
      const canceledSubscription = await stripe.subscriptions.cancel(stripeSubscriptionId);

      console.log("[subscription/cancel] Stripe subscription canceled", {
        userId:         user.id,
        subscriptionId: stripeSubscriptionId,
        status:         canceledSubscription.status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // "No such subscription" means it was already canceled on Stripe's side.
      // Treat as success and clean up the local state.
      if (msg.includes("No such subscription") || msg.includes("resource_missing")) {
        console.warn("[subscription/cancel] Stripe subscription already gone — cleaning up DB", {
          userId: user.id,
          stripeSubscriptionId,
        });
      } else {
        console.error("[subscription/cancel] Stripe cancel failed", { userId: user.id, msg });
        return NextResponse.json({ error: `Failed to cancel subscription: ${msg}` }, { status: 502 });
      }
    }

    // Update Supabase immediately. The customer.subscription.deleted webhook
    // will also update the profile when it fires, but we must not leave the user
    // in a paid state if the webhook is delayed or missed.
    await cancelInDatabase(supabase, user.id);
    await sendCancelNotification(user.id);

    console.log("[subscription/cancel] profile updated to free/canceled", { userId: user.id });
    return NextResponse.json({ ok: true });
  }

  // ── Asaas fallback (legacy Brazilian agencies) ────────────────────────────────

  if (asaasSubscriptionId) {
    try {
      // Dynamic import keeps Asaas code out of the Stripe path
      const { cancelSubscription } = await import("@/lib/asaas");
      await cancelSubscription(asaasSubscriptionId);
      console.log("[subscription/cancel] Asaas subscription canceled", {
        userId: user.id,
        asaasSubscriptionId,
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
