import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { getStripeConnectStatusForUser, syncStripeConnectAccountStatus } from "@/lib/stripeConnect";

export const runtime = "nodejs";

export type StripeConnectStatusResponse = {
  connected:         boolean;
  charges_enabled:   boolean;
  payouts_enabled:   boolean;
  details_submitted: boolean;
  transfers_active:  boolean;
  last_withdrawal_status: string | null;
  last_withdrawal_provider_status: string | null;
};

// GET /api/stripe/connect/status
// Returns raw Stripe account fields so the UI can derive its own display state.
// connected=false means no stripe_account_id is stored yet.
export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  const stored = await getStripeConnectStatusForUser(supabase, user.id);
  if (!stored) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accountId = stored.stripe_account_id;
  const { data: lastStripeWithdrawal } = await supabase
    .from("wallet_transactions")
    .select("status, provider_status")
    .eq("user_id", user.id)
    .eq("type", "withdrawal")
    .eq("provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!accountId) {
    const payload: StripeConnectStatusResponse = {
      connected:         false,
      charges_enabled:   false,
      payouts_enabled:   false,
      details_submitted: false,
      transfers_active:  false,
      last_withdrawal_status: null,
      last_withdrawal_provider_status: null,
    };
    return NextResponse.json(payload);
  }

  try {
    const account = await getStripe().accounts.retrieve(accountId);
    await syncStripeConnectAccountStatus(supabase, account);

    const payload: StripeConnectStatusResponse = {
      connected:         true,
      charges_enabled:   account.charges_enabled   ?? false,
      payouts_enabled:   account.payouts_enabled   ?? false,
      details_submitted: account.details_submitted ?? false,
      transfers_active:  account.capabilities?.transfers === "active",
      last_withdrawal_status: lastStripeWithdrawal?.status ?? null,
      last_withdrawal_provider_status: lastStripeWithdrawal?.provider_status ?? null,
    };

    console.log("[stripe status]", accountId, { role: stored.role, ...payload });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe status] failed to retrieve account:", accountId, msg);
    const fallback: StripeConnectStatusResponse = {
      connected:         true,
      charges_enabled:   stored.charges_enabled,
      payouts_enabled:   stored.payouts_enabled,
      details_submitted: stored.details_submitted,
      transfers_active:  stored.transfers_active,
      last_withdrawal_status: lastStripeWithdrawal?.status ?? null,
      last_withdrawal_provider_status: lastStripeWithdrawal?.provider_status ?? null,
    };
    return NextResponse.json(fallback);
  }
}
