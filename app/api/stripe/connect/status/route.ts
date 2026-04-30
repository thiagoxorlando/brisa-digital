import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { checkStripeAutomaticWithdrawalReadiness } from "@/lib/stripeWithdrawal";

export const runtime = "nodejs";

export type StripeConnectStatusResponse = {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  transfers_active: boolean;
  bank_ready: boolean;
  wallet_ok: boolean;
  stripe_account_ok: boolean;
  platform_balance_ok: boolean;
  platform_available_balance_brl: number;
  exact_reason: string | null;
  stripe_account_id: string | null;
  stripe_account_country: string | null;
  needs_source_transaction_for_brazil: boolean;
  last_withdrawal_status: string | null;
  last_withdrawal_provider_status: string | null;
};

export async function GET(request: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const amountParam = request.nextUrl.searchParams.get("amount");
  const amount = amountParam ? Number(amountParam) : 0.01;
  const supabase = createServerClient({ useServiceRole: true });

  try {
    const readiness = await checkStripeAutomaticWithdrawalReadiness({
      supabase,
      userId: user.id,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0.01,
    });

    const payload: StripeConnectStatusResponse = {
      connected: Boolean(readiness.stripeAccountId),
      charges_enabled: readiness.chargesEnabled,
      payouts_enabled: readiness.payoutsEnabled,
      details_submitted: readiness.detailsSubmitted,
      transfers_active: readiness.transfersActive,
      bank_ready: readiness.bankReady,
      wallet_ok: readiness.walletOk,
      stripe_account_ok: readiness.stripeAccountOk,
      platform_balance_ok: readiness.platformBalanceOk,
      platform_available_balance_brl: readiness.platformAvailableBalanceBrl,
      exact_reason: readiness.exactReason,
      stripe_account_id: readiness.stripeAccountId,
      stripe_account_country: readiness.stripeAccountCountry,
      needs_source_transaction_for_brazil: readiness.needsSourceTransactionForBrazil,
      last_withdrawal_status: readiness.lastWithdrawalStatus,
      last_withdrawal_provider_status: readiness.lastWithdrawalProviderStatus,
    };

    console.log("[stripe status]", {
      userId: user.id,
      payload,
    });

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe status] failed to build withdrawal readiness", { userId: user.id, error: msg });

    const fallback: StripeConnectStatusResponse = {
      connected: false,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      transfers_active: false,
      bank_ready: false,
      wallet_ok: false,
      stripe_account_ok: false,
      platform_balance_ok: false,
      platform_available_balance_brl: 0,
      exact_reason: "nao foi possivel verificar a conta Stripe agora",
      stripe_account_id: null,
      stripe_account_country: null,
      needs_source_transaction_for_brazil: false,
      last_withdrawal_status: null,
      last_withdrawal_provider_status: null,
    };
    return NextResponse.json(fallback);
  }
}
