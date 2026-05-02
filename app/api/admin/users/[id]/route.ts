import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { deleteUserDeep } from "@/lib/admin/deleteUserDeep";

type Params = { params: Promise<{ id: string }> };

// ── PATCH — update role OR freeze/unfreeze ────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();

  const supabase = createServerClient({ useServiceRole: true });

  // Add wallet balance
  if (body.action === "add_balance") {
    const amount = Number(body.amount ?? 0);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", id)
      .single();

    const current = Number(profile?.wallet_balance ?? 0);

    const { error } = await supabase
      .from("profiles")
      .update({ wallet_balance: current + amount })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("wallet_transactions").insert({
      user_id:     id,
      type:        "admin_credit",
      amount,
      description: body.description?.trim() || "Crédito manual — administrador",
    });

    return NextResponse.json({ ok: true, newBalance: current + amount });
  }

  // Freeze / unfreeze action
  if (body.action === "freeze" || body.action === "unfreeze") {
    const { error } = await supabase
      .from("profiles")
      .update({ is_frozen: body.action === "freeze" })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Role change
  const { role } = body;
  if (!["talent", "agency", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// ── DELETE — permanently remove user account ─────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId: adminId } = auth;

  const { id } = await params;
  if (id === adminId) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 });
  }

  try {
    await deleteUserDeep(id);
  } catch (err) {
    console.error("[admin delete user]", { id, error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao excluir usuário." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deletedIds: [id], count: 1 });
}
