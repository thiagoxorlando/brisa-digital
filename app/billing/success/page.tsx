/**
 * /billing/success — Stripe Checkout success landing page.
 *
 * Stripe redirects here after a successful checkout session.
 * URL contains: ?session_id=cs_xxx
 *
 * This page is intentionally minimal — it shows a brief confirmation
 * then immediately redirects to /agency/billing with ?stripe=success
 * so the BillingDashboard can display the "Plan activated" banner.
 *
 * Why a separate page instead of going directly to /agency/billing?
 *   Stripe allows only HTTPS success_url values for live keys. Having
 *   a dedicated path lets us verify the session_id and perform any
 *   post-checkout housekeeping before the user sees the billing dashboard.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const metadata: Metadata = { title: "Checkout Complete — BrisaHub" };

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function BillingSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  // Auth guard — unauthenticated users bounced to login
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  // If Stripe is not configured or no session ID, redirect with a success
  // flag anyway — the webhook will have already (or will soon) update state.
  if (!session_id || !isStripeConfigured()) {
    redirect("/agency/billing?stripe=success");
  }

  // Verify the session belongs to this user before trusting it
  try {
    const stripe       = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "customer"],
    });

    const metaUserId = checkoutSession.metadata?.user_id;

    if (metaUserId && metaUserId === user.id) {
      // Proactively cache the Stripe customer/subscription IDs on the profile
      // so the billing page shows the correct state even before the webhook fires.
      const customerId     = typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : (checkoutSession.customer as { id?: string } | null)?.id ?? null;
      const subscriptionId = typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : (checkoutSession.subscription as { id?: string } | null)?.id ?? null;

      if (customerId || subscriptionId) {
        const supabase = createServerClient({ useServiceRole: true });
        const patch: Record<string, unknown> = { subscription_provider: "stripe" };
        if (customerId)     patch.stripe_customer_id     = customerId;
        if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
        // plan / plan_status will be set by the webhook; we just cache the IDs here
        await supabase.from("profiles").update(patch).eq("id", user.id);
        console.log(
          `[billing/success] session verified: user=${user.id}`,
          `customer=${customerId} subscription=${subscriptionId}`
        );
      }
    } else if (metaUserId && metaUserId !== user.id) {
      // Session belongs to a different user — do not apply it
      console.warn(
        `[billing/success] session user mismatch: session_user=${metaUserId} auth_user=${user.id}`
      );
    }
  } catch (err) {
    // Non-fatal — session retrieval failing doesn't block the user
    console.error("[billing/success] session retrieval failed:", err instanceof Error ? err.message : err);
  }

  redirect("/agency/billing?stripe=success");
}
