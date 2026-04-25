import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";
import { WITHDRAWAL_FEE_RATE } from "@/lib/withdrawal-fee";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { amount?: unknown };
  const requestedAmount = Number(body.amount);
  if (!requestedAmount || requestedAmount <= 0) {
    return NextResponse.json({ error: "Valor de saque inválido." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agências podem solicitar saques." }, { status: 403 });
  }

  const { data: result, error: rpcError } = await supabase.rpc("request_agency_withdrawal", {
    p_user_id:  user.id,
    p_amount:   requestedAmount,
    p_fee_rate: WITHDRAWAL_FEE_RATE,
  });

  if (rpcError) {
    console.error("[POST /api/agencies/withdraw] rpc error:", rpcError.message);
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }

  if (!result?.ok) {
    if (result?.error === "pix_not_configured") {
      return NextResponse.json({ error: "Configure sua chave PIX antes de solicitar saque." }, { status: 400 });
    }
    if (result?.error === "invalid_amount") {
      return NextResponse.json({ error: "Valor de saque inválido." }, { status: 400 });
    }
    if (result?.error === "insufficient_balance") {
      return NextResponse.json({ error: "Saldo insuficiente para saque." }, { status: 400 });
    }
    if (result?.error === "profile_not_found") {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao processar saque." }, { status: 500 });
  }

  const amount = Number(result.amount);
  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("company_name")
    .eq("id", user.id)
    .single();
  const agencyName = agencyRow?.company_name ?? "Agência";

  await notifyAdmins(
    "payment",
    `Novo saque solicitado — ${agencyName}: ${brl}`,
    "/admin/finances",
    `admin-withdrawal-request:${user.id}:${amount}`,
  );

  return NextResponse.json({
    success:           true,
    amount,
    fee:               Number(result.fee ?? 0),
    net_amount:        Number(result.net_amount ?? amount),
    remaining_balance: Number(result.remaining_balance ?? 0),
  });
}
