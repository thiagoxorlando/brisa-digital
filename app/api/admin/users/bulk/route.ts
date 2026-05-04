import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as { ids?: unknown; action?: unknown };
  const ids = parseIds(body.ids);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um usuário." }, { status: 400 });
  }

  if (body.action !== "freeze") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { error } = await supabase
    .from("profiles")
    .update({ is_frozen: true })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, count: ids.length });
}

// ── DELETE — soft-delete: move users to trash (lixeira) ──────────────────────
//
// For each user: freezes the profile and sets deleted_at on their role record.
// Permanent deletion only happens from /admin/lixeira (calls deleteUserDeep).
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId: adminId } = auth;

  const body = await req.json().catch(() => ({})) as { ids?: unknown };
  const ids = parseIds(body.ids);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um usuário." }, { status: 400 });
  }

  if (ids.includes(adminId)) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  // Freeze all accounts
  await supabase.from("profiles").update({ is_frozen: true }).in("id", ids);

  // Soft-delete role records
  await supabase
    .from("agencies")
    .update({ deleted_at: now })
    .in("user_id", ids)
    .is("deleted_at", null);

  await supabase
    .from("talent_profiles")
    .update({ deleted_at: now })
    .in("id", ids)
    .is("deleted_at", null);

  return NextResponse.json({ ok: true, deletedIds: ids, count: ids.length });
}
