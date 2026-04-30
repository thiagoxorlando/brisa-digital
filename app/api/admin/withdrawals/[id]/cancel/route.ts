import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id obrigatorio." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json({ error: "Motivo do cancelamento e obrigatorio." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: result, error: rpcError } = await supabase.rpc("cancel_wallet_withdrawal", {
    p_transaction_id: id,
    p_reason: reason,
  });

  if (rpcError) {
    console.error("[withdrawal] cancelled rpc error", {
      id,
      adminId: auth.userId,
      message: rpcError.message,
    });
    return NextResponse.json({ error: "Erro ao cancelar saque." }, { status: 500 });
  }

  if (!result?.ok) {
    if (result?.error === "not_found") {
      return NextResponse.json({ error: "Saque nao encontrado." }, { status: 404 });
    }
    if (result?.error === "not_pending") {
      return NextResponse.json(
        { error: `Saque ja esta com status "${result.current_status}". Apenas saques pendentes podem ser cancelados.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Erro ao cancelar saque." }, { status: 500 });
  }

  console.log("[withdrawal] cancelled", {
    id,
    adminId: auth.userId,
    amountRestored: result.amount_restored ?? null,
  });

  const { data: tx } = await supabase
    .from("wallet_transactions")
    .select("user_id, amount")
    .eq("id", id)
    .single();

  if (tx?.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", tx.user_id)
      .maybeSingle();
    const brlAmt = new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Math.abs(Number(tx.amount ?? 0)));
    await notify(
      tx.user_id,
      "payment",
      `Seu saque de ${brlAmt} foi cancelado. Motivo: ${reason}`,
      profile?.role === "talent" ? "/talent/finances" : "/agency/finances",
      `wallet-withdrawal-cancelled:${id}`,
    ).catch((e) => console.error("[withdrawal] cancelled notify failed:", e));
  }

  return NextResponse.json({ ok: true, id, status: "cancelled", amount_restored: result.amount_restored ?? null });
}
