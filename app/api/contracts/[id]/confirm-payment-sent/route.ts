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
    .select("id, agency_id, talent_id, talent_user_id, status, agency_payment_sent_at, job_id")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  if (contract.agency_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["signed", "confirmed"].includes(contract.status)) {
    return NextResponse.json(
      { error: "Contrato precisa estar assinado ou confirmado para registrar envio de pagamento." },
      { status: 422 },
    );
  }

  if (contract.agency_payment_sent_at) {
    return NextResponse.json({ error: "Pagamento já foi marcado como enviado." }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from("contracts")
    .update({ agency_payment_sent_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("id", id);

  if (updateErr) {
    console.error("[confirm-payment-sent] update failed:", updateErr.message);
    return NextResponse.json({ error: "Falha ao registrar envio." }, { status: 500 });
  }

  const talentUserId = contract.talent_user_id ?? contract.talent_id;
  if (talentUserId) {
    await notify(
      talentUserId,
      "payment_sent",
      "A agência confirmou o envio do pagamento. Confirme o recebimento para encerrar o contrato.",
      `/talent/contracts`,
      `payment_sent:${id}`,
    ).catch((e) => console.warn("[confirm-payment-sent] notify failed:", e));
  }

  return NextResponse.json({ ok: true });
}
