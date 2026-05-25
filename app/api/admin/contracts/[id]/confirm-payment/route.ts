import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

// Admin override: manually confirm an internal-mode payment on behalf of the talent.
// Used when talent is unresponsive beyond the auto-confirm window.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, status, agency_payment_sent_at, talent_payment_confirmed_at")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  if (contract.talent_payment_confirmed_at || contract.status === "paid") {
    return NextResponse.json({ error: "Pagamento já foi confirmado." }, { status: 409 });
  }

  if (!contract.agency_payment_sent_at) {
    return NextResponse.json(
      { error: "Agência ainda não marcou o pagamento como enviado." },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("contracts")
    .update({
      talent_payment_confirmed_at: now,
      status:  "paid",
      paid_at: now,
    } as Record<string, unknown>)
    .eq("id", id);

  if (updateErr) {
    console.error("[admin/contracts/confirm-payment] update failed:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Notify talent
  const talentUserId = contract.talent_user_id ?? contract.talent_id;
  if (talentUserId) {
    await notify(
      talentUserId,
      "payment_admin_confirmed",
      "Pagamento confirmado pela administração da plataforma.",
      "/talent/contracts",
      `admin_confirm:${id}`,
    ).catch((e) => console.warn("[admin/contracts/confirm-payment] notify talent failed:", e));
  }

  await logAdminAction({
    adminId:    auth.userId,
    action:     "contract_payment_manually_confirmed",
    entityType: "contract",
    entityId:   id,
    before:     { status: contract.status, talent_payment_confirmed_at: null },
    after:      { status: "paid", talent_payment_confirmed_at: now },
  }).catch((e) => console.warn("[admin/contracts/confirm-payment] auditLog failed:", e));

  return NextResponse.json({ ok: true });
}
