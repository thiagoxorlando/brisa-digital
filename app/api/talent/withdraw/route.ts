import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notifyAdmins } from "@/lib/notify";
import {
  checkStripeAutomaticWithdrawalReadiness,
  createAutomaticStripeWithdrawal,
  StripeWithdrawalError,
} from "@/lib/stripeWithdrawal";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { amount?: unknown };
  const requestedAmount = Number(body.amount);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ error: "Saque automático indisponível: valor de saque invalido" }, { status: 400 });
  }

  if (parseFloat(requestedAmount.toFixed(2)) !== requestedAmount) {
    return NextResponse.json({ error: "Saque automático indisponível: valor de saque invalido" }, { status: 400 });
  }

  if (requestedAmount > 50_000) {
    return NextResponse.json({ error: "Saque automático indisponível: valor de saque excede o limite por solicitacao" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "talent") {
    return NextResponse.json({ error: "Apenas talentos podem solicitar saques." }, { status: 403 });
  }

  try {
    const readiness = await checkStripeAutomaticWithdrawalReadiness({
      supabase,
      userId: user.id,
      amount: requestedAmount,
    });

    if (!readiness.ready || !readiness.stripeAccountId) {
      console.error("[withdrawal stripe] failed before deduction", {
        userId: user.id,
        role: "talent",
        amount: requestedAmount,
        reason: readiness.exactReason,
        readiness,
      });

      return NextResponse.json(
        { error: `Saque automático indisponível: ${readiness.exactReason ?? "requisitos Stripe nao atendidos"}` },
        { status: 400 },
      );
    }

    const stripeResult = await createAutomaticStripeWithdrawal({
      supabase,
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      stripeAccountId: readiness.stripeAccountId,
    });

    const brl = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(requestedAmount);

    await notifyAdmins(
      "payment",
      `Saque Stripe iniciado - Talento: ${brl}`,
      "/admin/finances",
      `admin-withdrawal-request:${user.id}:${stripeResult.txId}`,
    );

    console.log("[withdrawal] requested", {
      txId: stripeResult.txId,
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      provider: stripeResult.provider,
      providerStatus: stripeResult.providerStatus,
      status: stripeResult.status,
    });

    return NextResponse.json({
      success: true,
      tx_id: stripeResult.txId,
      amount: requestedAmount,
      fee: 0,
      net_amount: requestedAmount,
      provider: stripeResult.provider,
      provider_status: stripeResult.providerStatus,
      status: stripeResult.status,
      rail: "stripe_automatico",
    });
  } catch (error) {
    if (error instanceof StripeWithdrawalError) {
      console.error("[withdrawal stripe] request failed", {
        txId: error.txId,
        userId: user.id,
        role: "talent",
        amount: requestedAmount,
        stage: error.stage,
        message: error.message,
        restorable: error.restorable,
      });

      return NextResponse.json(
        { error: error.userMessage ?? "Saque automático indisponível: erro ao processar saque Stripe" },
        { status: 502 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[withdrawal stripe] unexpected error", {
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      message,
    });
    return NextResponse.json({ error: "Saque automático indisponível: erro interno ao processar saque" }, { status: 500 });
  }
}
