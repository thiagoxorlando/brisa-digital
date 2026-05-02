import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createPayment } from "@/lib/asaas";
import { PLAN_DEFINITIONS } from "@/lib/plans";
import { isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";

function extractAsaasError(err: unknown): string {
  try {
    const raw = err instanceof Error ? err.message : JSON.stringify(err);
    const parsed = JSON.parse(raw) as { errors?: { description?: string }[] };
    const desc = parsed?.errors?.[0]?.description;
    if (desc) return desc;
  } catch { /* ignore */ }
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: profileRow }, { data: agencyRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, cpf_cnpj").eq("id", user.id).single(),
    supabase.from("agencies").select("phone").eq("id", user.id).maybeSingle(),
  ]);

  const profileRaw = profileRow as Record<string, unknown> | null;
  const name       = (profileRaw?.full_name as string | undefined) ?? "Agência";

  // CPF/CNPJ: request body takes priority (freshly typed), then DB fallback
  const rawDoc   = (body.cpfCnpj as string | undefined) ?? (profileRaw?.cpf_cnpj as string | undefined) ?? "";
  const cleanDoc = normalizeCpfCnpj(rawDoc);

  if (!isValidCpfCnpj(cleanDoc)) {
    console.error("[asaas/plan/checkout] invalid CPF/CNPJ:", { rawDoc, userId: user.id });
    return NextResponse.json(
      { error: "CPF/CNPJ inválido. Verifique os números e tente novamente." },
      { status: 400 },
    );
  }

  // Phone — digits only, no +55, no mask
  const rawPhone    = (agencyRow as Record<string, unknown> | null)?.phone as string | undefined;
  const mobilePhone = rawPhone ? digitsOnly(rawPhone) : undefined;

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(user.id, name, user.email ?? "", cleanDoc, mobilePhone);
  } catch (err) {
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] ensureAsaasCustomer failed:", desc);
    return NextResponse.json(
      { error: desc || "Não foi possível criar o cliente no Asaas. Confira CPF/CNPJ, telefone e e-mail." },
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
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] createPayment failed:", desc);
    return NextResponse.json({ error: desc || "Erro ao gerar cobrança. Tente novamente." }, { status: 500 });
  }

  if (!payment.invoiceUrl) {
    console.error("[asaas/plan/checkout] no invoiceUrl returned, payment id:", payment.id);
    return NextResponse.json({ error: "Erro ao obter link de pagamento." }, { status: 500 });
  }

  return NextResponse.json({ url: payment.invoiceUrl });
}
