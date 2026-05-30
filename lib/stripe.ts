/**
 * Stripe client for BrisaHub subscription billing.
 *
 * SCOPE  US subscription billing only (PRO plan, future Premium).
 *        Asaas remains in use for Brazil PIX deposits/withdrawals (escrow mode).
 *
 * Import examples:
 *   import { stripe, constructWebhookEvent } from "@/lib/stripe";
 *   import { assertStripeConfigured, mapStripeStatusToPlanStatus } from "@/lib/stripe";
 */

// Server-only — never import from client components or NEXT_PUBLIC_ code.
// STRIPE_SECRET_KEY must NOT be prefixed with NEXT_PUBLIC_.
import Stripe from "stripe";

// ── Environment helpers ───────────────────────────────────────────────────────

/**
 * Returns true when all three Stripe env vars are present.
 * Use this to feature-flag Stripe paths without crashing at startup.
 */
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

/**
 * Throws a descriptive error if any Stripe env var is missing.
 * Call at the top of any API route that requires Stripe.
 */
export function assertStripeConfigured(): void {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY)                   missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET)               missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)  missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (missing.length) {
    throw new Error(
      `[stripe] Missing environment variable(s): ${missing.join(", ")}. ` +
      "Add them to .env.local (development) or your deployment environment."
    );
  }
}

// ── Stripe singleton ──────────────────────────────────────────────────────────

let _instance: Stripe | undefined;

/**
 * Lazy singleton — throws at the first request rather than at module load,
 * so `next build` succeeds even when STRIPE_SECRET_KEY is absent in CI.
 */
export function getStripe(): Stripe {
  if (_instance) return _instance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "[stripe] STRIPE_SECRET_KEY is not configured. " +
      "Add it to .env.local and restart the dev server."
    );
  }

  _instance = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
    appInfo: {
      name:    "BrisaHub",
      url:     "https://brisahub.com",
      version: "1.0.0",
    },
  });

  return _instance;
}

/**
 * Convenience proxy — allows `import { stripe } from "@/lib/stripe"` without
 * calling getStripe() explicitly at every call site.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── Webhook verification ──────────────────────────────────────────────────────

/**
 * Verifies a Stripe webhook signature and returns the typed event.
 *
 * MUST be called with the raw request body (Buffer/string), NOT parsed JSON —
 * JSON.parse() alters whitespace and breaks signature verification.
 *
 * @throws {Stripe.errors.StripeSignatureVerificationError} on invalid signature.
 */
export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("[stripe] STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ── Status mapping ────────────────────────────────────────────────────────────

/**
 * Maps a Stripe subscription status to BrisaHub's internal plan_status value.
 *
 * Stripe statuses:
 *   incomplete | incomplete_expired | trialing | active |
 *   past_due   | canceled           | unpaid   | paused
 */
export function mapStripeStatusToPlanStatus(
  stripeStatus: Stripe.Subscription["status"],
): string {
  switch (stripeStatus) {
    case "trialing":           return "trialing";
    case "active":             return "active";
    case "past_due":           return "past_due";
    case "unpaid":             return "past_due";
    case "canceled":           return "canceled";
    case "incomplete":         return "pending";
    case "incomplete_expired": return "canceled";
    case "paused":             return "inactive";
    default:                   return "inactive";
  }
}

// ── Plan key resolution ───────────────────────────────────────────────────────

/**
 * Extracts the BrisaHub plan key from a Stripe subscription.
 *
 * Convention: at checkout creation we write `{ plan_key: "pro" }` into
 * `subscription_data.metadata`. This is the primary source.
 * Fallback: inspect the product name attached to the first line item
 * (requires the subscription to be expanded with `items.data.price.product`).
 */
export function getPlanKeyFromSubscription(
  subscription: Stripe.Subscription,
): "pro" | "premium" {
  const meta = subscription.metadata?.plan_key;
  if (meta === "pro" || meta === "premium") return meta;

  const item    = subscription.items?.data?.[0];
  const product = item?.price?.product;
  const name    = typeof product === "object" && product !== null
    ? ((product as Stripe.Product).name ?? "").toLowerCase()
    : "";

  if (name.includes("premium")) return "premium";
  return "pro";
}

// ── Type re-exports ───────────────────────────────────────────────────────────

export type { Stripe };
export type StripeSubscriptionStatus = Stripe.Subscription["status"];
