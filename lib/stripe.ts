// Server-only — never import from client components or NEXT_PUBLIC_ code.
// STRIPE_SECRET_KEY must not be prefixed with NEXT_PUBLIC_.
import Stripe from "stripe";

let _instance: Stripe | undefined;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Lazy singleton: throws at the first request rather than at module load,
// so `next build` succeeds even when STRIPE_SECRET_KEY is not in the environment.
export function getStripe(): Stripe {
  if (_instance) return _instance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Missing STRIPE_SECRET_KEY");
    throw new Error(
      "[stripe] STRIPE_SECRET_KEY is not configured. " +
        "Add it to your .env.local (or server environment) and restart."
    );
  }

  _instance = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name:    "BrisaHub",
      url:     "https://brisahub.com.br",
      version: "1.0.0",
    },
  });

  console.log("[stripe] client initialized");
  return _instance;
}
