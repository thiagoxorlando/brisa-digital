import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export type StripeConnectStatusResponse = {
  connected:         boolean;
  charges_enabled:   boolean;
  payouts_enabled:   boolean;
  details_submitted: boolean;
};

// GET /api/stripe/connect/status
// Returns raw Stripe account fields so the UI can derive its own display state.
// connected=false means no stripe_account_id is stored yet.
export async function GET(_req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: talentRow } = await supabase
    .from("talent_profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();

  const accountId = talentRow?.stripe_account_id ?? null;

  if (!accountId) {
    const payload: StripeConnectStatusResponse = {
      connected:         false,
      charges_enabled:   false,
      payouts_enabled:   false,
      details_submitted: false,
    };
    return NextResponse.json(payload);
  }

  try {
    const account = await getStripe().accounts.retrieve(accountId);

    const payload: StripeConnectStatusResponse = {
      connected:         true,
      charges_enabled:   account.charges_enabled   ?? false,
      payouts_enabled:   account.payouts_enabled   ?? false,
      details_submitted: account.details_submitted ?? false,
    };

    console.log("[stripe status]", accountId, payload);
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe status] failed to retrieve account:", accountId, msg);
    // Return connected=true so the UI shows the "Finalizar cadastro" button rather than
    // treating the account as never created.
    const fallback: StripeConnectStatusResponse = {
      connected:         true,
      charges_enabled:   false,
      payouts_enabled:   false,
      details_submitted: false,
    };
    return NextResponse.json(fallback);
  }
}
