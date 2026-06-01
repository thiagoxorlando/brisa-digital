/**
 * GET /api/debug/stripe-env
 *
 * Diagnostic endpoint — dumps Stripe-related env vars loaded at runtime.
 * Secrets are masked after the first 12 characters.
 *
 * Remove this file once the Stripe configuration is confirmed.
 */

import { NextResponse } from "next/server";

function mask(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 12) return value;
  return `${value.slice(0, 12)}${"*".repeat(value.length - 12)}`;
}

export async function GET() {
  const secret      = process.env.STRIPE_SECRET_KEY ?? "";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  return NextResponse.json({
    STRIPE_SECRET_KEY_prefix:              mask(secret      || undefined),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_prefix: mask(publishable || undefined),
    STRIPE_WEBHOOK_SECRET_prefix:          mask(process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_PRO_RECURRING_PRICE_ID:         process.env.STRIPE_PRO_RECURRING_PRICE_ID  ?? "(not set)",
    STRIPE_PRO_PRICE_ID:                   process.env.STRIPE_PRO_PRICE_ID            ?? "(not set)",
    STRIPE_PREMIUM_PRICE_ID:               process.env.STRIPE_PREMIUM_PRICE_ID        ?? "(not set)",
    livemode:                              secret.startsWith("sk_live"),
  });
}
