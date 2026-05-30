/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook endpoint for Phase 4B (subscription billing).
 *
 * Security:
 *   - Signature verified via constructWebhookEvent() before any DB writes.
 *   - Idempotent: every processed event_id is written to stripe_webhook_events;
 *     duplicate deliveries return 200 immediately.
 *
 * Handled events:
 *   checkout.session.completed        — link Stripe customer/subscription to profile
 *   customer.subscription.created     — initial subscription record
 *   customer.subscription.updated     — status changes (trial→active, active→past_due, etc.)
 *   customer.subscription.deleted     — cancellation finalised
 *   invoice.paid                       — payment confirmed, activate plan
 *   invoice.payment_failed             — card declined, set past_due
 *
 * NOT YET CONNECTED to the main checkout or plan-activation flow.
 * This handler is wired up but dormant until Phase 4B.3 (checkout).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  constructWebhookEvent,
  mapStripeStatusToPlanStatus,
  getPlanKeyFromSubscription,
  type Stripe,
} from "@/lib/stripe";

// ── Config ────────────────────────────────────────────────────────────────────

// Stripe sends the raw body; Next.js must NOT parse it.
// This config tells the Next.js App Router to expose the raw request body.
export const config = { api: { bodyParser: false } };

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Read raw body (required for signature verification)
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  // 2. Verify signature — rejects replayed / tampered requests
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe/webhook] signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // 3. Idempotency — skip if already processed
  const { data: existing } = await supabase
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 4. Persist event immediately (before processing) for observability
  await supabase.from("stripe_webhook_events").insert({
    id:         event.id,
    event_type: event.type,
    payload:    event as unknown as Record<string, unknown>,
  } as Record<string, unknown>);

  // 5. Dispatch to event-specific handler
  let processingError: string | null = null;

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(supabase, event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event type — acknowledged but not processed
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err);
    console.error(`[stripe/webhook] error processing ${event.type} (${event.id}):`, processingError);
    // Mark event as errored but still return 200 — Stripe should not retry on logic errors.
    await supabase
      .from("stripe_webhook_events")
      .update({ error: processingError } as Record<string, unknown>)
      .eq("id", event.id);

    return NextResponse.json({ ok: true, error: processingError });
  }

  // 6. Mark event as fully processed
  await supabase
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("id", event.id);

  return NextResponse.json({ ok: true });
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 *
 * Fired when an agency completes a Stripe Checkout session.
 * Links the Stripe customer + subscription IDs to the BrisaHub profile.
 *
 * NOTE: Plan activation happens via invoice.paid, not here — the trial period
 * means no payment may be collected at checkout time.
 */
async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createServerClient>,
  session: Stripe.Checkout.Session,
) {
  const userId          = session.metadata?.user_id;
  const customerId      = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId  = typeof session.subscription === "string" ? session.subscription : null;
  const planKey         = session.metadata?.plan_key ?? "pro";

  if (!userId) {
    console.warn("[stripe/webhook] checkout.session.completed: missing user_id in metadata");
    return;
  }

  const patch: Record<string, unknown> = {
    subscription_provider: "stripe",
  };
  if (customerId)     patch.stripe_customer_id     = customerId;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
  if (planKey)        patch.plan                   = planKey;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] checkout.session.completed: user=${userId} customer=${customerId} subscription=${subscriptionId}`);
}

/**
 * customer.subscription.created
 *
 * Fired when a Stripe subscription is created (typically after checkout).
 * Sets the initial plan status (usually "trialing" for PRO).
 */
async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const planStatus  = mapStripeStatusToPlanStatus(subscription.status);
  const planKey     = getPlanKeyFromSubscription(subscription);
  const trialEnd    = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  const patch: Record<string, unknown> = {
    plan:                   planKey,
    plan_status:            planStatus,
    stripe_subscription_id: subscription.id,
    subscription_provider:  "stripe",
  };
  if (trialEnd) {
    patch.trial_ends_at   = trialEnd;
    patch.trial_started_at = new Date().toISOString();
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] subscription.created: user=${userId} status=${planStatus} plan=${planKey}`);
}

/**
 * customer.subscription.updated
 *
 * Fired on any subscription change: status transitions, price changes,
 * trial expiration, etc.
 */
async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const planStatus = mapStripeStatusToPlanStatus(subscription.status);
  const planKey    = getPlanKeyFromSubscription(subscription);

  const patch: Record<string, unknown> = {
    plan:        planKey,
    plan_status: planStatus,
  };

  // If subscription was canceled, downgrade to free
  if (subscription.status === "canceled") {
    patch.plan = "free";
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] subscription.updated: user=${userId} status=${planStatus}`);
}

/**
 * customer.subscription.deleted
 *
 * Fired when a subscription is fully cancelled and the billing period ends.
 * Downgrade the agency to the free plan.
 */
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      plan:                   "free",
      plan_status:            "canceled",
      stripe_subscription_id: null,
    } as Record<string, unknown>)
    .eq("id", userId);

  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] subscription.deleted: user=${userId} → downgraded to free`);
}

/**
 * invoice.paid
 *
 * Fired when a subscription invoice is paid successfully.
 * Activates or confirms the plan. Handles intro→recurring price transitions
 * natively through Stripe coupons (no manual cycle counter needed).
 */
async function handleInvoicePaid(
  supabase: ReturnType<typeof createServerClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const userId = await resolveUserIdFromCustomer(supabase, customerId);
  if (!userId) return;

  // Compute plan_expires_at: current period end + 1 day buffer
  const invoiceRaw     = invoice as unknown as Record<string, unknown>;
  const subscriptionId = typeof invoiceRaw.subscription === "string" ? invoiceRaw.subscription : null;
  const periodEnd      = (invoice as unknown as { lines?: { data?: Array<{ period?: { end?: number } }> } })
    .lines?.data?.[0]?.period?.end;
  const planExpiresAt  = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;

  const patch: Record<string, unknown> = {
    plan_status: "active",
  };
  if (planExpiresAt)   patch.plan_expires_at          = planExpiresAt;
  if (subscriptionId)  patch.stripe_subscription_id   = subscriptionId;

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] invoice.paid: user=${userId} amount=${invoice.amount_paid} expires=${planExpiresAt}`);
}

/**
 * invoice.payment_failed
 *
 * Fired when a subscription payment fails (card declined, expired, etc.).
 * Sets plan_status to "past_due" so the UI can prompt the user to update
 * their payment method via the Stripe Customer Portal.
 */
async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createServerClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const userId = await resolveUserIdFromCustomer(supabase, customerId);
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({ plan_status: "past_due" } as Record<string, unknown>)
    .eq("id", userId);

  if (error) throw new Error(`profiles update failed: ${error.message}`);

  console.log(`[stripe/webhook] invoice.payment_failed: user=${userId}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Looks up a BrisaHub user ID from a Stripe Customer ID.
 * Uses the stripe_customer_id index on profiles.
 */
async function resolveUserIdFromCustomer(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!data) {
    console.warn(`[stripe/webhook] no profile found for customer ${customerId}`);
    return null;
  }
  return data.id as string;
}

/**
 * Looks up a BrisaHub user ID from a Stripe Subscription object.
 * Prefers metadata.user_id → falls back to customer ID lookup.
 */
async function resolveUserIdFromSubscription(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // Primary: metadata written at checkout time
  const metaUserId = subscription.metadata?.user_id;
  if (metaUserId) return metaUserId;

  // Fallback: look up via customer ID
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) {
    console.warn("[stripe/webhook] subscription has no customer ID or user_id metadata");
    return null;
  }
  return resolveUserIdFromCustomer(supabase, customerId);
}
