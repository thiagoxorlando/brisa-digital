import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// POST /api/stripe/connect/create-account
// Creates a Stripe Express Connected Account for the talent (if not yet created),
// then returns a fresh account-onboarding URL.
// Idempotent: calling again on an existing account just returns a new link.
export async function POST(_req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  // Only talents may connect a Stripe payout account.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "talent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Read existing account id (may be null for first-time call).
  const { data: talentRow } = await supabase
    .from("talent_profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();

  let accountId = talentRow?.stripe_account_id ?? null;

  if (!accountId) {
    console.log("[stripe connect create] creating Express account for talent:", user.id);

    console.log("[stripe connect fixed capabilities] requesting transfers + card_payments for BR account");
    const account = await getStripe().accounts.create({
      type: "express",
      country: "BR",
      capabilities: {
        transfers:     { requested: true },
        card_payments: { requested: true },
      },
    });

    accountId = account.id;
    console.log("[stripe connect create] account created:", accountId, "talent:", user.id);

    const { error: updateErr } = await supabase
      .from("talent_profiles")
      .update({ stripe_account_id: accountId })
      .eq("id", user.id);

    if (updateErr) {
      console.error("[stripe connect create] failed to save stripe_account_id:", updateErr.message);
      return NextResponse.json({ error: "Erro ao salvar conta Stripe." }, { status: 500 });
    }
  }

  // Always generate a fresh onboarding link (links expire after ~5 minutes).
  const accountLink = await getStripe().accountLinks.create({
    account:     accountId,
    refresh_url: `${APP_URL}/talent/finances?stripe=refresh`,
    return_url:  `${APP_URL}/talent/finances?stripe=success`,
    type:        "account_onboarding",
  });

  console.log("[stripe onboarding link] created for account:", accountId);

  return NextResponse.json({ url: accountLink.url });
}
