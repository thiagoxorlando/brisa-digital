import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, status, agency_payment_sent_at, talent_payment_confirmed_at")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  const talentUserId = contract.talent_user_id ?? contract.talent_id;
  if (talentUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!contract.agency_payment_sent_at) {
    return NextResponse.json(
      { error: "A agência ainda não confirmou o envio do pagamento." },
      { status: 422 },
    );
  }

  if (contract.talent_payment_confirmed_at) {
    return NextResponse.json({ error: "Recebimento já foi confirmado." }, { status: 409 });
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
    console.error("[confirm-payment-received] update failed:", updateErr.message);
    return NextResponse.json({ error: "Falha ao confirmar recebimento." }, { status: 500 });
  }

  if (contract.agency_id) {
    await notify(
      contract.agency_id,
      "payment_confirmed",
      "O talento confirmou o recebimento do pagamento. Contrato encerrado.",
      `/agency/contracts`,
      `payment_confirmed:${id}`,
    ).catch((e) => console.warn("[confirm-payment-received] notify failed:", e));
  }

  return NextResponse.json({ ok: true });
}
