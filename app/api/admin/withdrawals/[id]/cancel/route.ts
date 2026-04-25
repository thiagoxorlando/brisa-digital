import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";

// POST /api/admin/withdrawals/[id]/cancel
// Atomically marks withdrawal as rejected AND restores full amount to agency wallet.
// Does NOT move money externally.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json({ error: "Motivo do cancelamento é obrigatório." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: result, error: rpcError } = await supabase.rpc("cancel_agency_withdrawal", {
    p_tx_id:    id,
    p_admin_id: auth.userId,
    p_note:     reason,
  });

  if (rpcError) {
    console.error("[cancel-withdrawal] rpc error:", rpcError.message);
    return NextResponse.json({ error: "Erro ao cancelar saque." }, { status: 500 });
  }

  if (!result?.ok) {
    if (result?.error === "not_found") {
      return NextResponse.json({ error: "Saque não encontrado." }, { status: 404 });
    }
    if (result?.error === "not_pending") {
      return NextResponse.json(
        { error: `Saque já está com status "${result.current_status}". Apenas saques pendentes podem ser cancelados.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Erro ao cancelar saque." }, { status: 500 });
  }

  console.log("[cancel-withdrawal] cancelled:", id, "by admin:", auth.userId, "restored:", result.amount_restored);
  return NextResponse.json({ ok: true, id, status: "rejected", amount_restored: result.amount_restored });
}
