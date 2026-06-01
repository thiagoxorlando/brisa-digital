/**
 * GET /api/debug/stripe
 *
 * Diagnostic endpoint — confirms which Stripe key is loaded at runtime
 * and verifies connectivity via accounts.retrieve().
 *
 * Returns:
 *   account_id       — Stripe account ID (acct_...)
 *   livemode         — true = live key, false = test key
 *   stripe_key_prefix — first 12 chars of STRIPE_SECRET_KEY (rest masked)
 *
 * Remove this file once the price-ID mismatch is confirmed resolved.
 */

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function GET() {
  const raw = process.env.STRIPE_SECRET_KEY ?? "";
  const stripe_key_prefix = raw
    ? `${raw.slice(0, 12)}${"*".repeat(Math.max(0, raw.length - 12))}`
    : "(not set)";

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured", stripe_key_prefix },
      { status: 503 },
    );
  }

  try {
    const stripe  = getStripe();
    // Passing empty string retrieves the platform account (same as no arg in older SDK)
    const account = await (stripe.accounts.retrieve as (id?: string) => Promise<{ id: string; charges_enabled: boolean }>)();

    return NextResponse.json({
      account_id:        account.id,
      livemode:          account.charges_enabled ? (raw.startsWith("sk_live") ? true : false) : false,
      stripe_key_prefix,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:             err instanceof Error ? err.message : "Unknown error",
        stripe_key_prefix,
      },
      { status: 500 },
    );
  }
}
