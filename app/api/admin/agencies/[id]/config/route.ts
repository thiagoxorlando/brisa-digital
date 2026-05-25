import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { logAdminAction } from "@/lib/auditLog";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: current, error: fetchErr } = await supabase
    .from("agencies")
    .select("payment_mode, commission_percent_override, escrow_enabled, receipt_uploads_enabled")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Agência não encontrada." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (body.payment_mode !== undefined) {
    // null = reset to global platform default
    if (body.payment_mode !== null && !["internal", "escrow"].includes(String(body.payment_mode))) {
      return NextResponse.json({ error: "payment_mode inválido. Use 'internal', 'escrow', ou null para padrão global." }, { status: 400 });
    }
    patch.payment_mode = body.payment_mode ?? null;
    // Auto-sync escrow_enabled when switching to a concrete mode
    if (body.payment_mode === "internal") patch.escrow_enabled = false;
    if (body.payment_mode === "escrow" && body.escrow_enabled === undefined) patch.escrow_enabled = true;
  }

  if (body.commission_percent_override !== undefined) {
    const pct = body.commission_percent_override === null
      ? null
      : Number(body.commission_percent_override);
    if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
      return NextResponse.json({ error: "commission_percent_override fora do intervalo válido (0–100)." }, { status: 400 });
    }
    patch.commission_percent_override = pct;
  }

  if (body.escrow_enabled !== undefined) {
    patch.escrow_enabled = Boolean(body.escrow_enabled);
  }

  if (body.receipt_uploads_enabled !== undefined) {
    patch.receipt_uploads_enabled = Boolean(body.receipt_uploads_enabled);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("agencies")
    .update(patch)
    .eq("id", id);

  if (updateErr) {
    console.error("[admin/agencies/config] update failed:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "agency_config_changed",
    entityType: "agency",
    entityId: id,
    before: current,
    after: { ...current, ...patch },
  }).catch((e) => console.warn("[admin/agencies/config] auditLog failed:", e));

  return NextResponse.json({ ok: true, updated: patch });
}
