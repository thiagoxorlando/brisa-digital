import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// GET /api/stripe/connect/refresh
// Stripe redirects the user here when the onboarding AccountLink has expired.
// We regenerate a fresh link and redirect immediately.
export async function GET(_req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    // Session expired — send back to finances page so they can log in and retry.
    return NextResponse.redirect(new URL("/talent/finances", APP_URL));
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: talentRow } = await supabase
    .from("talent_profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();

  const accountId = talentRow?.stripe_account_id ?? null;

  if (!accountId) {
    console.warn("[stripe] refresh called but no account_id for talent:", user.id);
    return NextResponse.redirect(new URL("/talent/finances", APP_URL));
  }

  console.log("[stripe] refreshing onboarding link for account:", accountId);

  const accountLink = await getStripe().accountLinks.create({
    account:     accountId,
    refresh_url: `${APP_URL}/talent/finances?stripe=refresh`,
    return_url:  `${APP_URL}/talent/finances?stripe=success`,
    type:        "account_onboarding",
  });

  return NextResponse.redirect(accountLink.url);
}
