import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { checkStripeAutomaticWithdrawalReadiness } from "@/lib/stripeWithdrawal";

export const runtime = "nodejs";

export type StripeConnectStatusResponse = {
  connected: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_active: boolean;
  bank_ready: boolean;
  can_withdraw: boolean;
  availability_state: "unconnected" | "review" | "processing" | "available" | "blocked";
  display_message: string;
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
      details_submitted: readiness.detailsSubmitted,
      payouts_enabled: readiness.payoutsEnabled,
      transfers_active: readiness.transfersActive,
      bank_ready: readiness.bankReady,
      can_withdraw: readiness.ready,
      availability_state: readiness.publicState,
      display_message: readiness.publicMessage ?? "Saque automático indisponível — fale com o suporte",
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe status] failed to build withdrawal readiness", { userId: user.id, error: msg });

    const fallback: StripeConnectStatusResponse = {
      connected: false,
      details_submitted: false,
      payouts_enabled: false,
      transfers_active: false,
      bank_ready: false,
      can_withdraw: false,
      availability_state: "blocked",
      display_message: "Saque automático indisponível — fale com o suporte",
    };
    return NextResponse.json(fallback);
  }
}
