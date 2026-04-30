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

  const body = await req.json().catch(() => ({})) as { note?: string; provider?: string };
  const note = body.note?.trim() ?? "";
  const provider = body.provider?.trim() || "manual";

  const supabase = createServerClient({ useServiceRole: true });

  const { data: result, error: rpcError } = await supabase.rpc("mark_wallet_withdrawal_paid", {
    p_transaction_id: id,
    p_provider: provider,
    p_admin_note: note,
  });

  if (rpcError) {
    console.error("[withdrawal] marked paid rpc error", {
      id,
      adminId: auth.userId,
      message: rpcError.message,
    });
    return NextResponse.json({ error: "Erro ao marcar saque como pago." }, { status: 500 });
  }

  if (!result?.ok) {
    if (result?.error === "not_found") {
      return NextResponse.json({ error: "Saque nao encontrado." }, { status: 404 });
    }
    if (result?.error === "not_pending") {
      return NextResponse.json(
        { error: `Saque ja esta com status "${result.current_status}". Apenas saques pendentes podem ser aprovados.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Erro ao marcar saque como pago." }, { status: 500 });
  }

  console.log("[withdrawal] marked paid", {
    id,
    adminId: auth.userId,
    provider,
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
      `Seu saque de ${brlAmt} foi marcado como pago.`,
      profile?.role === "talent" ? "/talent/finances" : "/agency/finances",
      `wallet-withdrawal-paid:${id}`,
    ).catch((e) => console.error("[withdrawal] marked paid notify failed:", e));
  }

  return NextResponse.json({ ok: true, id, status: "paid" });
}
