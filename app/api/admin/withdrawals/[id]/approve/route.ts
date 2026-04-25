import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

// POST /api/admin/withdrawals/[id]/approve
// Marks withdrawal as paid via RPC. Does NOT move money — admin must have
// already sent the PIX manually before confirming here.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { note?: string };
  const note = body.note?.trim() ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const { data: result, error: rpcError } = await supabase.rpc("mark_agency_withdrawal_paid", {
    p_tx_id:    id,
    p_admin_id: auth.userId,
    p_note:     note,
  });

  if (rpcError) {
    console.error("[approve-withdrawal] rpc error:", {
      message: rpcError.message,
      code:    rpcError.code,
      details: rpcError.details,
      hint:    rpcError.hint,
    });
    return NextResponse.json({
      error:   "Erro ao chamar RPC mark_agency_withdrawal_paid.",
      details: rpcError.message,
      code:    rpcError.code,
    }, { status: 500 });
  }

  if (!result?.ok) {
    console.error("[approve-withdrawal] rpc returned not-ok:", result);
    if (result?.error === "not_found") {
      return NextResponse.json({ error: "Saque não encontrado.", details: `tx_id: ${id}` }, { status: 404 });
    }
    if (result?.error === "not_pending") {
      return NextResponse.json({
        error:   `Saque já está com status "${result.current_status}". Apenas saques pendentes podem ser aprovados.`,
        details: result,
      }, { status: 409 });
    }
    return NextResponse.json({ error: "RPC retornou erro desconhecido.", details: result }, { status: 500 });
  }

  console.log("[approve-withdrawal] paid:", id, "by admin:", auth.userId);

  const { data: tx } = await supabase
    .from("wallet_transactions")
    .select("user_id, amount")
    .eq("id", id)
    .single();

  if (tx?.user_id) {
    const brlAmt = new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL", maximumFractionDigits: 0,
    }).format(Math.abs(Number(tx.amount ?? 0)));
    await notify(
      tx.user_id,
      "payment",
      `Seu saque de ${brlAmt} foi marcado como pago.`,
      "/agency/finances",
      `agency-withdrawal-paid:${id}`,
    ).catch((e) => console.error("[approve-withdrawal] notify agency failed:", e));
  } else {
    console.error("[approve-withdrawal] could not fetch tx to notify agency:", id);
  }

  return NextResponse.json({ ok: true, id, status: "paid" });
}
