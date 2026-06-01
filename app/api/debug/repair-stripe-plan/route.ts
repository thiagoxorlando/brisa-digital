/**
 * GET /api/debug/repair-stripe-plan
 *
 * Temporary repair endpoint for broken Stripe subscription state.
 * For the logged-in user only: fetches their Stripe subscription live
 * and writes the correct plan/status/dates back to profiles.
 *
 * Returns before/after JSON so the operator can verify what changed.
 * Remove this file once all broken accounts are corrected.
 */

import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe, isStripeConfigured, mapStripeStatusToPlanStatus, type Stripe as StripeType } from "@/lib/stripe";

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  // ── Read current DB state ─────────────────────────────────────────────────

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("plan, plan_status, trial_ends_at, plan_expires_at, stripe_subscription_id, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const before = {
    plan:                   (profileRow as Record<string, unknown> | null)?.plan          ?? null,
    plan_status:            (profileRow as Record<string, unknown> | null)?.plan_status   ?? null,
    trial_ends_at:          (profileRow as Record<string, unknown> | null)?.trial_ends_at ?? null,
    plan_expires_at:        (profileRow as Record<string, unknown> | null)?.plan_expires_at ?? null,
    stripe_subscription_id: (profileRow as Record<string, unknown> | null)?.stripe_subscription_id ?? null,
    stripe_customer_id:     (profileRow as Record<string, unknown> | null)?.stripe_customer_id ?? null,
  };

  const stripeSubId = before.stripe_subscription_id as string | null;

  if (!stripeSubId) {
    return NextResponse.json({
      message:         "No stripe_subscription_id on profile — nothing to repair.",
      before,
      after:           null,
      action:          "none",
    });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured on this server." }, { status: 503 });
  }

  // ── Fetch live Stripe subscription ───────────────────────────────────────

  let sub: StripeType.Subscription;
  try {
    sub = await getStripe().subscriptions.retrieve(stripeSubId) as StripeType.Subscription;
  } catch (err) {
    return NextResponse.json({
      error:   `Failed to fetch subscription from Stripe: ${err instanceof Error ? err.message : String(err)}`,
      before,
    }, { status: 502 });
  }

  const stripeStatus = sub.status; // trialing | active | canceled | past_due | ...

  // ── Build patch based on Stripe status ───────────────────────────────────

  let patch: Record<string, unknown>;
  let action: string;

  if (stripeStatus === "trialing" || stripeStatus === "active") {
    const trialEnd   = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    const periodEnd  = (sub as unknown as { current_period_end?: number }).current_period_end;
    const expiresAt  = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    patch = {
      plan:                   "pro",
      plan_status:            mapStripeStatusToPlanStatus(stripeStatus),
      stripe_subscription_id: sub.id,
      pro_trial_used:         true,
    };
    if (typeof sub.customer === "string") patch.stripe_customer_id = sub.customer;
    if (trialEnd)  patch.trial_ends_at  = trialEnd;
    if (expiresAt) patch.plan_expires_at = expiresAt;
    action = `repaired → pro (Stripe status: ${stripeStatus})`;

  } else if (stripeStatus === "canceled") {
    patch = {
      plan:                   "free",
      plan_status:            "canceled",
      trial_ends_at:          null,
      stripe_subscription_id: null,
      plan_expires_at:        null,
    };
    action = "repaired → free (Stripe subscription is canceled)";

  } else {
    // past_due, incomplete, etc.
    patch = {
      plan_status: mapStripeStatusToPlanStatus(stripeStatus),
    };
    action = `updated plan_status to ${stripeStatus} (no plan change)`;
  }

  // ── Apply patch ───────────────────────────────────────────────────────────

  const { error: updateError } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({
      error:  `DB update failed: ${updateError.message}`,
      before,
      patch,
    }, { status: 500 });
  }

  // ── Read updated state ────────────────────────────────────────────────────

  const { data: updatedRow } = await supabase
    .from("profiles")
    .select("plan, plan_status, trial_ends_at, plan_expires_at, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const after = {
    plan:                   (updatedRow as Record<string, unknown> | null)?.plan            ?? null,
    plan_status:            (updatedRow as Record<string, unknown> | null)?.plan_status     ?? null,
    trial_ends_at:          (updatedRow as Record<string, unknown> | null)?.trial_ends_at   ?? null,
    plan_expires_at:        (updatedRow as Record<string, unknown> | null)?.plan_expires_at ?? null,
    stripe_subscription_id: (updatedRow as Record<string, unknown> | null)?.stripe_subscription_id ?? null,
  };

  return NextResponse.json({
    action,
    stripe_status: stripeStatus,
    before,
    after,
    patch_applied: patch,
  });
}
