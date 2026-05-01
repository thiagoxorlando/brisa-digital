import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  const body = await req.json().catch(() => ({})) as { cpf_cnpj?: string };
  const bodyDocument = body.cpf_cnpj === undefined ? undefined : normalizeCpfCnpj(body.cpf_cnpj);

  if (bodyDocument !== undefined && !isValidCpfCnpj(bodyDocument)) {
    return NextResponse.json({ error: "CPF/CNPJ inválido" }, { status: 400 });
  }

  if (bodyDocument) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ cpf_cnpj: bodyDocument } as Record<string, unknown>)
      .eq("id", user.id);

    if (updateError) {
      console.error("[asaas customer] failed to persist cpf_cnpj", { userId: user.id, error: updateError.message });
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  // 1. Check for cached Asaas customer ID
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profileCpfCnpj =
    typeof (profile as Record<string, unknown> | null)?.cpf_cnpj === "string"
      ? ((profile as Record<string, unknown>).cpf_cnpj as string)
      : "";
  const resolvedCpfCnpj = bodyDocument ?? normalizeCpfCnpj(profileCpfCnpj);
  if (!isValidCpfCnpj(resolvedCpfCnpj)) {
    return NextResponse.json(
      { error: "CPF/CNPJ inválido" },
      { status: 400 },
    );
  }

  // 2. Resolve display name by role
  let name = user.email ?? "Usuário";

  if (profile.role === "agency") {
    const { data: agency } = await supabase
      .from("agencies")
      .select("company_name")
      .eq("id", user.id)
      .maybeSingle();
    if (agency?.company_name) name = agency.company_name;
  } else {
    const { data: talent } = await supabase
      .from("talent_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (talent?.full_name) name = talent.full_name;
  }

  const email = user.email ?? `${user.id}@brisahub.com.br`;

  // 3. Create Asaas customer
  try {
    const customerId = await ensureAsaasCustomer(user.id, name, email, resolvedCpfCnpj);
    return NextResponse.json({ customerId });
  } catch (err) {
    console.error("[asaas customer] failed", { userId: user.id, error: String(err) });
    return NextResponse.json(
      { error: "CPF/CNPJ inválido" },
      { status: 400 },
    );
  }
}
