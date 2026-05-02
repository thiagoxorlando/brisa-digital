import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createPayment } from "@/lib/asaas";
import { PLAN_DEFINITIONS } from "@/lib/plans";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Prefer CPF/CNPJ from request body (sent right after setup-profile saves it)
  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, cpf_cnpj")
    .eq("id", user.id)
    .single();

  const profileRaw = profile as Record<string, unknown> | null;
  const name       = (profileRaw?.full_name as string | undefined) ?? "Agência";

  // Resolve CPF/CNPJ: body takes priority, then DB fallback
  const rawDoc  = (body.cpfCnpj as string | undefined) ?? (profileRaw?.cpf_cnpj as string | undefined) ?? "";
  const cleanDoc = normalizeCpfCnpj(rawDoc);

  if (!isValidCpfCnpj(cleanDoc)) {
    console.error("[asaas/plan/checkout] invalid CPF/CNPJ:", { rawDoc, cleanDoc, userId: user.id });
    return NextResponse.json(
      { error: "CPF/CNPJ inválido. Verifique os números e tente novamente." },
      { status: 400 },
    );
  }

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(user.id, name, user.email ?? "", cleanDoc);
  } catch (err) {
    console.error(
      "[asaas/plan/checkout] ensureAsaasCustomer failed:",
      err instanceof Error ? err.message : JSON.stringify(err),
    );
    return NextResponse.json(
      { error: "Não foi possível criar o cliente no Asaas. Confira CPF/CNPJ, telefone e e-mail." },
      { status: 500 },
    );
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  let payment: { id: string; invoiceUrl?: string };
  try {
    payment = await createPayment({
      customer:    customerId,
      billingType: "CREDIT_CARD",
      value:       PLAN_DEFINITIONS.pro.price,
      dueDate:     dueDateStr,
      description: "Plano PRO - BrisaHub",
    });
  } catch (err) {
    console.error(
      "[asaas/plan/checkout] createPayment failed:",
      err instanceof Error ? err.message : JSON.stringify(err),
    );
    return NextResponse.json({ error: "Erro ao gerar cobrança. Tente novamente." }, { status: 500 });
  }

  if (!payment.invoiceUrl) {
    console.error("[asaas/plan/checkout] no invoiceUrl returned, payment id:", payment.id);
    return NextResponse.json({ error: "Erro ao obter link de pagamento." }, { status: 500 });
  }

  return NextResponse.json({ url: payment.invoiceUrl });
}
