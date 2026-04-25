import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";

// POST /api/admin/withdrawals/[id]/mark-paid
// Marks a pending withdrawal transaction as paid.
// Does NOT send money — admin confirms after transferring externally.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { admin_note?: string };

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch the transaction — must be a withdrawal in pending status
  const { data: tx, error: fetchErr } = await supabase
    .from("wallet_transactions")
    .select("id, type, status, user_id, amount")
    .eq("id", id)
    .single();

  if (fetchErr || !tx) {
    return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });
  }
  if (tx.type !== "withdrawal") {
    return NextResponse.json({ error: "Transação não é um saque." }, { status: 400 });
  }
  if (tx.status !== "pending") {
    return NextResponse.json(
      { error: `Saque já está com status "${tx.status}". Apenas saques pendentes podem ser marcados como pagos.` },
      { status: 409 },
    );
  }

  const { error: updateErr } = await supabase
    .from("wallet_transactions")
    .update({
      status:       "paid",
      processed_at: new Date().toISOString(),
      processed_by: auth.userId,
      ...(body.admin_note ? { admin_note: body.admin_note } : {}),
    })
    .eq("id", id)
    .eq("status", "pending"); // optimistic guard — prevents double-mark

  if (updateErr) {
    console.error("[mark-paid] update error:", updateErr.message);
    return NextResponse.json({ error: "Erro ao atualizar saque." }, { status: 500 });
  }

  console.log("[mark-paid] withdrawal marked paid:", id, "by admin:", auth.userId, "amount:", tx.amount);
  return NextResponse.json({ ok: true, id, status: "paid" });
}
