import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getStripe } from "@/lib/stripe";

type TalentWithdrawalResult = {
  ok?: boolean;
  error?: string;
  tx_id?: string;
  amount?: number;
  net_amount?: number;
  remaining_balance?: number;
  provider?: string;
};

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { amount?: unknown };
  const requestedAmount = Number(body.amount);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ error: "Valor de saque inválido." }, { status: 400 });
  }

  if (parseFloat(requestedAmount.toFixed(2)) !== requestedAmount) {
    return NextResponse.json({ error: "Valor de saque inválido." }, { status: 400 });
  }

  if (requestedAmount > 50_000) {
    return NextResponse.json({ error: "Valor de saque excede o limite por solicitação." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: talent } = await supabase
    .from("talent_profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();

  const stripeAccountId = talent?.stripe_account_id ?? null;
  if (!stripeAccountId) {
    return NextResponse.json(
      {
        error: "Configure sua conta Stripe para sacar.",
        code: "stripe_not_configured",
        requires_stripe_setup: true,
      },
      { status: 400 },
    );
  }

  try {
    const account = await getStripe().accounts.retrieve(stripeAccountId);
    const transfersActive = account.capabilities?.transfers === "active";
    const stripeReady = Boolean(account.details_submitted && account.payouts_enabled && transfersActive);

    if (!stripeReady) {
      return NextResponse.json(
        {
          error: "Finalize a configuração da sua conta Stripe para sacar.",
          code: "stripe_not_ready",
          requires_stripe_setup: true,
        },
        { status: 400 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[talent withdraw stripe] account check failed:", message);
    return NextResponse.json(
      { error: "Não foi possível verificar sua conta Stripe agora." },
      { status: 500 },
    );
  }

  const { data: result, error: rpcError } = await supabase.rpc("request_talent_withdrawal", {
    p_user_id: user.id,
    p_amount: requestedAmount,
    p_provider: "stripe",
  });

  if (rpcError) {
    console.error("[POST /api/talent/withdraw] rpc error:", rpcError.message);
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }

  const withdrawal = result as TalentWithdrawalResult | null;
  if (!withdrawal?.ok) {
    if (withdrawal?.error === "stripe_not_configured") {
      return NextResponse.json(
        {
          error: "Configure sua conta Stripe para sacar.",
          code: "stripe_not_configured",
          requires_stripe_setup: true,
        },
        { status: 400 },
      );
    }
    if (withdrawal?.error === "invalid_amount") {
      return NextResponse.json({ error: "Valor de saque inválido." }, { status: 400 });
    }
    if (withdrawal?.error === "insufficient_balance") {
      return NextResponse.json({ error: "Saldo insuficiente para saque." }, { status: 400 });
    }
    if (withdrawal?.error === "not_talent") {
      return NextResponse.json({ error: "Apenas talentos podem solicitar este saque." }, { status: 403 });
    }
    if (withdrawal?.error === "profile_not_found") {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }

  const amount = Number(withdrawal.amount ?? requestedAmount);
  const amountInCents = Math.round(amount * 100);
  const txId = withdrawal.tx_id;

  if (!txId) {
    return NextResponse.json({ error: "Erro ao criar registro de saque." }, { status: 500 });
  }

  const { data: existingTx } = await supabase
    .from("wallet_transactions")
    .select("provider_transfer_id, status, provider_status")
    .eq("id", txId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingTx?.provider_transfer_id) {
    console.log("[talent withdraw stripe] skipped already transferred", {
      txId,
      transferId: existingTx.provider_transfer_id,
    });
    return NextResponse.json({
      success: true,
      provider: "stripe",
      provider_transfer_id: existingTx.provider_transfer_id,
      status: existingTx.status ?? "paid",
      provider_status: existingTx.provider_status ?? "succeeded",
      amount,
      net_amount: Number(withdrawal.net_amount ?? amount),
      remaining_balance: Number(withdrawal.remaining_balance ?? 0),
      tx_id: txId,
    });
  }

  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: amountInCents,
        currency: "brl",
        destination: stripeAccountId,
        description: "Saque BrisaHub",
        metadata: {
          withdrawal_id: txId,
          talent_id: user.id,
        },
      },
      {
        idempotencyKey: `talent_withdrawal:${txId}`,
      },
    );

    const processedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("wallet_transactions")
      .update({
        provider:             "stripe",
        provider_transfer_id: transfer.id,
        provider_status:      "succeeded",
        status:               "paid",
        processed_at:         processedAt,
      })
      .eq("id", txId)
      .eq("user_id", user.id)
      .eq("type", "withdrawal");

    if (updateError) {
      console.error("[talent withdraw stripe] transfer saved by Stripe but DB update failed:", {
        txId,
        transferId: transfer.id,
        error: updateError.message,
      });
      return NextResponse.json(
        {
          error: "Stripe enviou o saque, mas houve erro ao atualizar o histórico. O suporte deve verificar.",
          provider_transfer_id: transfer.id,
        },
        { status: 500 },
      );
    }

    console.log("[talent withdraw stripe] transfer created", {
      txId,
      transferId: transfer.id,
      talentId: user.id,
      amount,
    });

    return NextResponse.json({
      success: true,
      provider: "stripe",
      provider_transfer_id: transfer.id,
      provider_status: "succeeded",
      status: "paid",
      amount,
      net_amount: Number(withdrawal.net_amount ?? amount),
      remaining_balance: Number(withdrawal.remaining_balance ?? 0),
      tx_id: txId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[talent withdraw stripe] transfer failed:", {
      txId,
      talentId: user.id,
      error: message,
    });

    await supabase.rpc("refund_failed_withdrawal", {
      p_tx_id: txId,
      p_reason: message.slice(0, 300),
    });

    return NextResponse.json(
      { error: "O Stripe recusou o saque. O saldo foi devolvido à sua carteira." },
      { status: 502 },
    );
  }
}
