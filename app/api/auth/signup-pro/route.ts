/**
 * POST /api/auth/signup-pro — DEPRECATED (Phase 4B.5)
 *
 * This route previously handled PRO agency signup via Asaas credit-card
 * subscription creation. It collected CPF/CNPJ, phone, and raw card data.
 *
 * It has been replaced by the Stripe Checkout flow:
 *   POST /api/stripe/create-checkout  →  Stripe-hosted payment page
 *
 * The signup page (app/signup/page.tsx) no longer calls this route.
 * Returns 410 Gone to any client that still has this route cached.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:   "This endpoint has been deprecated.",
      message: "Asaas subscription signup has been removed. Use Stripe Checkout via POST /api/stripe/create-checkout.",
      docs:    "https://stripe.com/docs/billing/subscriptions",
    },
    { status: 410 },
  );
}
