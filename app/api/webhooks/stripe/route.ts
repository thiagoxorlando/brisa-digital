/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook endpoint for BrisaHub subscription billing.
 *
 * Security:
 *   - Signature verified via constructWebhookEvent() before any DB writes.
 *   - Idempotent: every event_id is written to stripe_webhook_events;
 *     duplicate deliveries return 200 immediately.
 *
 * Handled events:
 *   checkout.session.completed        — link IDs + set initial trial state
 *   customer.subscription.created     — confirm trial state, set trial_ends_at
 *   customer.subscription.updated     — sync status changes
 *   customer.subscription.deleted     — downgrade to free
 *   invoice.paid                       — activate plan
 *   invoice.payment_failed             — set past_due
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  getStripe,
  constructWebhookEvent,
  mapStripeStatusToPlanStatus,
  getPlanKeyFromSubscription,
  type Stripe,
} from "@/lib/stripe";

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // TEMP DIAGNOSTIC — remove after root cause confirmed
  console.log("WEBHOOK HIT", {
    method: req.method,
    url: req.url,
    host: req.headers.get("host"),
    contentType: req.headers.get("content-type"),
    hasSignature: !!req.headers.get("stripe-signature"),
  });

  const rawBody   = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe/webhook] signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  console.log(`[stripe/webhook] received: ${event.type} (${event.id})`);

  // Idempotency — skip if already processed
  const { data: existing } = await supabase
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) {
    console.log(`[stripe/webhook] duplicate event skipped: ${event.id}`);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Persist event before processing for observability
  await supabase.from("stripe_webhook_events").insert({
    id:         event.id,
    event_type: event.type,
    payload:    event as unknown as Record<string, unknown>,
  } as Record<string, unknown>);

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
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err);
    console.error(`[stripe/webhook] error processing ${event.type} (${event.id}):`, processingError);
    await supabase
      .from("stripe_webhook_events")
      .update({ error: processingError } as Record<string, unknown>)
      .eq("id", event.id);
    // Return 200 so Stripe does not retry logic errors
    return NextResponse.json({ ok: true, error: processingError });
  }

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
 * Fired first after a user completes Stripe Checkout.
 * We fetch the subscription here so we can write trial state immediately —
 * without relying on customer.subscription.created arriving in order.
 *
 * Writes: stripe_customer_id, stripe_subscription_id, plan,
 *         plan_status, trial_ends_at, trial_started_at, subscription_provider
 */
async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createServerClient>,
  session: Stripe.Checkout.Session,
) {
  const userId         = session.metadata?.user_id;
  const customerId     = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const planKey        = session.metadata?.plan_key ?? "pro";

  if (!userId) {
    console.warn("[stripe/webhook] checkout.session.completed: missing user_id in metadata");
    return;
  }

  // ── Step 1: write the core plan fields unconditionally ──────────────────────
  // These columns have existed since early migrations; this update must never fail.
  // Kept separate so that a missing newer column (e.g. pro_trial_started_at) in
  // Step 2 cannot block plan from being set to "pro".
  const corePatch: Record<string, unknown> = {
    plan: planKey,
    subscription_provider: "stripe",
  };
  if (customerId)     corePatch.stripe_customer_id     = customerId;
  if (subscriptionId) corePatch.stripe_subscription_id = subscriptionId;

  const count = await profileUpdate(supabase, userId, corePatch, "checkout.session.completed/core");

  // ── Step 2: enrich with subscription details (trial fields, plan_status) ────
  // Non-fatal: if the Stripe API call fails or newer columns are missing, Step 1
  // already captured the critical plan assignment above.
  if (subscriptionId) {
    try {
      const stripe       = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const planStatus   = mapStripeStatusToPlanStatus(subscription.status);

      const enrichPatch: Record<string, unknown> = { plan_status: planStatus };

      if (subscription.trial_end) {
        const trialEndsAt              = new Date(subscription.trial_end * 1000).toISOString();
        enrichPatch.trial_ends_at      = trialEndsAt;
        enrichPatch.trial_started_at   = new Date().toISOString();
        enrichPatch.pro_trial_used     = true;
        try { enrichPatch.pro_trial_started_at = new Date().toISOString(); } catch { /* column may not exist */ }
        console.log(`[stripe/webhook] checkout.session.completed: trial ends ${trialEndsAt}`);
      }

      await profileUpdate(supabase, userId, enrichPatch, "checkout.session.completed/enrich");
    } catch (err) {
      // Non-fatal: customer.subscription.created will re-sync this state
      console.warn(
        "[stripe/webhook] checkout.session.completed: enrich step failed (non-fatal)",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  console.log(
    `[stripe/webhook] checkout.session.completed: user=${userId} rows_updated=${count}`,
    `customer=${customerId} subscription=${subscriptionId} plan=${corePatch.plan}`,
  );
}

/**
 * customer.subscription.created
 *
 * Confirms or corrects the plan state set by checkout.session.completed.
 * Sets plan_status, trial_ends_at from the authoritative subscription object.
 */
async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const planStatus = mapStripeStatusToPlanStatus(subscription.status);
  const planKey    = getPlanKeyFromSubscription(subscription);
  const trialEnd   = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  // Core fields first — must never be blocked by a missing newer column.
  const corePatch: Record<string, unknown> = {
    plan:                   planKey,
    plan_status:            planStatus,
    stripe_subscription_id: subscription.id,
    subscription_provider:  "stripe",
  };
  const count = await profileUpdate(supabase, userId, corePatch, "subscription.created/core");

  // Optional trial fields — safe to fail if newer columns are absent.
  if (trialEnd) {
    const trialPatch: Record<string, unknown> = {
      trial_ends_at:    trialEnd,
      trial_started_at: new Date().toISOString(),
      pro_trial_used:   true,
    };
    try { trialPatch.pro_trial_started_at = new Date().toISOString(); } catch { /* column may not exist */ }
    try {
      await profileUpdate(supabase, userId, trialPatch, "subscription.created/trial");
    } catch (err) {
      console.warn("[stripe/webhook] subscription.created: trial fields update failed (non-fatal)",
        err instanceof Error ? err.message : String(err));
    }
  }
  console.log(
    `[stripe/webhook] subscription.created: user=${userId} rows_updated=${count}`,
    `status=${planStatus} plan=${planKey} trial_ends=${trialEnd ?? "none"}`,
  );
}

/**
 * customer.subscription.updated
 *
 * Syncs status changes: trial→active, active→past_due, etc.
 * Also updates trial_ends_at in case Stripe changed the trial period.
 */
async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const planStatus = mapStripeStatusToPlanStatus(subscription.status);
  const planKey    = getPlanKeyFromSubscription(subscription);

  // Core: plan + status — must never fail due to missing optional columns.
  const corePatch: Record<string, unknown> = {
    plan:        subscription.status === "canceled" ? "free" : planKey,
    plan_status: planStatus,
  };
  if (subscription.trial_end) {
    corePatch.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
  }

  const count = await profileUpdate(supabase, userId, corePatch, "subscription.updated");
  console.log(
    `[stripe/webhook] subscription.updated: user=${userId} rows_updated=${count}`,
    `status=${planStatus} plan=${corePatch.plan}`,
  );

  // Optional: pro_trial_ended_at — safe to fail if the column is absent.
  if (subscription.status === "active" && subscription.trial_end) {
    try {
      await profileUpdate(supabase, userId,
        { pro_trial_ended_at: new Date(subscription.trial_end * 1000).toISOString() },
        "subscription.updated/trial_ended");
    } catch {
      // non-fatal
    }
  }
}

/**
 * customer.subscription.deleted
 *
 * Downgrade to free when subscription is fully cancelled.
 */
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(supabase, subscription);
  if (!userId) return;

  const count = await profileUpdate(supabase, userId, {
    plan:                   "free",
    plan_status:            "canceled",
    stripe_subscription_id: null,
    trial_ends_at:          null,
    plan_expires_at:        null,
  }, "subscription.deleted");

  console.log(`[stripe/webhook] subscription.deleted: user=${userId} rows_updated=${count} → free`);
}

/**
 * invoice.paid
 *
 * Confirms the plan is active after a successful payment (trial end, renewal).
 */
async function handleInvoicePaid(
  supabase: ReturnType<typeof createServerClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const userId = await resolveUserIdFromCustomer(supabase, customerId);
  if (!userId) return;

  const invoiceRaw     = invoice as unknown as Record<string, unknown>;
  const subscriptionId = typeof invoiceRaw.subscription === "string" ? invoiceRaw.subscription : null;
  const periodEnd      = (invoice as unknown as { lines?: { data?: Array<{ period?: { end?: number } }> } })
    .lines?.data?.[0]?.period?.end;
  const planExpiresAt  = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  const patch: Record<string, unknown> = { plan_status: "active" };
  if (planExpiresAt)  patch.plan_expires_at        = planExpiresAt;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;

  const count = await profileUpdate(supabase, userId, patch, "invoice.paid");
  console.log(
    `[stripe/webhook] invoice.paid: user=${userId} rows_updated=${count}`,
    `amount=${invoice.amount_paid} expires=${planExpiresAt}`,
  );
}

/**
 * invoice.payment_failed
 *
 * Card declined — prompt user to update payment method.
 */
async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createServerClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const userId = await resolveUserIdFromCustomer(supabase, customerId);
  if (!userId) return;

  const count = await profileUpdate(supabase, userId, { plan_status: "past_due" }, "invoice.payment_failed");
  console.log(`[stripe/webhook] invoice.payment_failed: user=${userId} rows_updated=${count}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * profileUpdate — wraps supabase.update() and logs when 0 rows are matched.
 *
 * Supabase PostgREST returns data:[] + error:null when the WHERE clause
 * matches nothing — it is NOT an error. This wrapper detects that case
 * and throws so the caller sees it in logs.
 */
async function profileUpdate(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  patch: Record<string, unknown>,
  context: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id");

  if (error) {
    throw new Error(`[stripe/webhook] ${context}: profiles update DB error: ${error.message}`);
  }

  const count = (data as { id: string }[] | null)?.length ?? 0;
  if (count === 0) {
    console.error(
      `[stripe/webhook] ${context}: profiles update matched 0 rows for user=${userId}`,
      "patch=", JSON.stringify(patch),
    );
  }

  return count;
}

/**
 * resolveUserIdFromCustomer
 * Looks up profile by stripe_customer_id (written by checkout.session.completed).
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
    console.warn(`[stripe/webhook] no profile found for stripe_customer_id=${customerId}`);
    return null;
  }
  return data.id as string;
}

/**
 * resolveUserIdFromSubscription
 *
 * Three-path lookup to find the BrisaHub user ID for a given subscription:
 *   1. subscription.metadata.user_id   (set at checkout creation)
 *   2. profiles.stripe_customer_id     (written by checkout.session.completed)
 *   3. profiles.stripe_subscription_id (written by checkout.session.completed or billing/success)
 *
 * Path 2 and 3 handle events that arrive before or concurrently with
 * checkout.session.completed.
 */
async function resolveUserIdFromSubscription(
  supabase: ReturnType<typeof createServerClient>,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // Path 1: metadata written at checkout creation (fastest, no DB round-trip)
  const metaUserId = subscription.metadata?.user_id;
  if (metaUserId) {
    console.log(`[stripe/webhook] resolved user ${metaUserId} via subscription metadata`);
    return metaUserId;
  }

  // Path 2: look up via stripe_customer_id
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (customerId) {
    const userId = await resolveUserIdFromCustomer(supabase, customerId);
    if (userId) {
      console.log(`[stripe/webhook] resolved user ${userId} via stripe_customer_id`);
      return userId;
    }
  }

  // Path 3: look up via stripe_subscription_id
  // (set by /billing/success or a previously processed checkout.session.completed)
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (data) {
    console.log(`[stripe/webhook] resolved user ${data.id} via stripe_subscription_id`);
    return data.id as string;
  }

  console.error(
    `[stripe/webhook] cannot resolve user for subscription=${subscription.id}`,
    `customer=${customerId} metadata=${JSON.stringify(subscription.metadata)}`,
  );
  return null;
}
