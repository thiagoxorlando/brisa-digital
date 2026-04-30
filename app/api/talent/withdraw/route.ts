import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notifyAdmins } from "@/lib/notify";

export const runtime = "nodejs";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "talent") {
    return NextResponse.json({ error: "Apenas talentos podem solicitar saques." }, { status: 403 });
  }

  const { data: txId, error: rpcError } = await supabase.rpc("request_wallet_withdrawal", {
    p_user_id: user.id,
    p_amount: requestedAmount,
    p_kind: "talent",
  });

  if (rpcError) {
    console.error("[withdrawal] requested rpc error", {
      userId: user.id,
      role: "talent",
      amount: requestedAmount,
      message: rpcError.message,
    });

    if (rpcError.message.includes("pix_not_configured")) {
      return NextResponse.json({ error: "Configure sua chave PIX antes de solicitar saque." }, { status: 400 });
    }
    if (rpcError.message.includes("invalid_amount")) {
      return NextResponse.json({ error: "Valor de saque invalido." }, { status: 400 });
    }
    if (rpcError.message.includes("insufficient_balance")) {
      return NextResponse.json({ error: "Saldo insuficiente para saque." }, { status: 400 });
    }
    if (rpcError.message.includes("profile_not_found")) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }
    if (rpcError.message.includes("role_mismatch")) {
      return NextResponse.json({ error: "Apenas talentos podem solicitar saques." }, { status: 403 });
    }
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }

  const { data: talentRow } = await supabase
    .from("talent_profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const talentName = talentRow?.full_name ?? "Talento";
  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(requestedAmount);

  await notifyAdmins(
    "payment",
    `Novo saque solicitado - ${talentName}: ${brl}`,
    "/admin/finances",
    `admin-withdrawal-request:${user.id}:${txId}`,
  );

  console.log("[withdrawal] requested", {
    txId,
    userId: user.id,
    role: "talent",
    amount: requestedAmount,
  });

  return NextResponse.json({
    success: true,
    tx_id: txId,
    amount: requestedAmount,
    fee: 0,
    net_amount: requestedAmount,
  });
}
