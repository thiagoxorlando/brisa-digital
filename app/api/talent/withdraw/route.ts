import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notifyAdmins } from "@/lib/notify";
import { createAutomaticStripeWithdrawal, StripeWithdrawalError } from "@/lib/stripeWithdrawal";
import { getStripeConnectStatusForUser, getStripePayoutAvailabilityState, hasManualPixFallback, isStripeConnectReady } from "@/lib/stripeConnect";

export const runtime = "nodejs";

async function createManualWithdrawal(supabase: ReturnType<typeof createServerClient>, userId: string, amount: number) {
  const { data: manualTxId, error: rpcError } = await supabase.rpc("request_wallet_withdrawal", {
    p_user_id: userId,
    p_amount: amount,
    p_kind: "talent",
  });

  if (rpcError || !manualTxId) {
    throw new Error(rpcError?.message ?? "request_wallet_withdrawal_failed");
  }

  return manualTxId;
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { amount?: unknown };
  const requestedAmount = Number(body.amount);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ error: "Valor de saque invalido." }, { status: 400 });
  }

  if (parseFloat(requestedAmount.toFixed(2)) !== requestedAmount) {
    return NextResponse.json({ error: "Valor de saque invalido." }, { status: 400 });
  }

  if (requestedAmount > 50_000) {
    return NextResponse.json({ error: "Valor de saque excede o limite por solicitacao." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const connectStatus = await getStripeConnectStatusForUser(supabase, user.id);
  if (!connectStatus || connectStatus.role !== "talent") {
    return NextResponse.json({ error: "Apenas talentos podem solicitar saques." }, { status: 403 });
  }

  const { data: lastStripeWithdrawal } = await supabase
    .from("wallet_transactions")
    .select("provider_status")
    .eq("user_id", user.id)
    .eq("type", "withdrawal")
    .eq("provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payoutState = getStripePayoutAvailabilityState({
    connected: connectStatus.connected,
    details_submitted: connectStatus.details_submitted,
    payouts_enabled: connectStatus.payouts_enabled,
    transfers_active: connectStatus.transfers_active,
    lastWithdrawalProviderStatus: lastStripeWithdrawal?.provider_status ?? null,
  });
  const useStripe = isStripeConnectReady(connectStatus) && payoutState === "ready";
  const hasPix = hasManualPixFallback(connectStatus);

  if (!useStripe && !hasPix) {
    return NextResponse.json(
      { error: "Configure Stripe automatico ou chave PIX fallback antes de solicitar saque." },
      { status: 400 },
    );
  }

  try {
    let txId: string;
    let status = "pending";
    let provider = "manual";
    let providerStatus = "pending";

    if (useStripe && connectStatus.stripe_account_id) {
      const stripeResult = await createAutomaticStripeWithdrawal({
        supabase,
        userId: user.id,
        role: "talent",
        amount: requestedAmount,
        stripeAccountId: connectStatus.stripe_account_id,
      });

      txId = stripeResult.txId;
      status = stripeResult.status;
      provider = stripeResult.provider;
      providerStatus = stripeResult.providerStatus;
    } else {
      txId = await createManualWithdrawal(supabase, user.id, requestedAmount);
    }

    const brl = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(requestedAmount);

    await notifyAdmins(
      "payment",
      useStripe
        ? `Saque Stripe iniciado - ${connectStatus.display_name}: ${brl}`
        : `Novo saque manual solicitado - ${connectStatus.display_name}: ${brl}`,
      "/admin/finances",
      `admin-withdrawal-request:${user.id}:${txId}`,
    );

    console.log("[withdrawal] requested", {
      txId,
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      provider,
      providerStatus,
      status,
    });

    return NextResponse.json({
      success: true,
      tx_id: txId,
      amount: requestedAmount,
      fee: 0,
      net_amount: requestedAmount,
      provider,
      provider_status: providerStatus,
      status,
      rail: provider === "stripe" ? "stripe_automatico" : "pix_manual",
    });
  } catch (error) {
    if (error instanceof StripeWithdrawalError) {
      if (hasPix && error.restorable) {
        const fallbackTxId = await createManualWithdrawal(supabase, user.id, requestedAmount);
        const brl = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(requestedAmount);

        await notifyAdmins(
          "payment",
          `Fallback manual apos falha Stripe - ${connectStatus.display_name}: ${brl}`,
          "/admin/finances",
          `admin-withdrawal-fallback:${user.id}:${fallbackTxId}`,
        );

        console.log("[withdrawal] automatic fallback to manual queue", {
          txId: fallbackTxId,
          userId: user.id,
          role: "talent",
          amount: requestedAmount,
          originalStripeTxId: error.txId,
        });

        return NextResponse.json({
          success: true,
          tx_id: fallbackTxId,
          amount: requestedAmount,
          fee: 0,
          net_amount: requestedAmount,
          provider: "manual",
          provider_status: "pending",
          status: "pending",
          rail: "pix_manual",
          fallback_reason: "stripe_failed",
          message: "Falha no payout Stripe. O saque foi enviado automaticamente para a fila manual via PIX.",
        });
      }

      console.error("[withdrawal] automatic stripe withdrawal failed", {
        txId: error.txId,
        userId: user.id,
        role: "talent",
        amount: requestedAmount,
        message: error.message,
        restorable: error.restorable,
      });

      return NextResponse.json(
        {
          error: error.restorable
            ? "Falha ao enviar saque automatico pelo Stripe. Saldo restaurado na carteira."
            : "Falha no saque automatico pelo Stripe. A transacao ficou para revisao manual do admin.",
        },
        { status: 502 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("invalid_amount")) {
      return NextResponse.json({ error: "Valor de saque invalido." }, { status: 400 });
    }
    if (message.includes("insufficient_balance")) {
      return NextResponse.json({ error: "Saldo insuficiente para saque." }, { status: 400 });
    }
    if (message.includes("profile_not_found")) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }
    if (message.includes("role_mismatch")) {
      return NextResponse.json({ error: "Apenas talentos podem solicitar saques." }, { status: 403 });
    }

    console.error("[withdrawal] requested error", {
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      message,
      payoutState,
    });
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }
}
