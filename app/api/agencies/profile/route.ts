import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf";

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { company_name, avatar_url, phone, address, cpf_cnpj } = await req.json();
  const normalizedCpf = cpf_cnpj === undefined || cpf_cnpj === null ? undefined : normalizeCpfCnpj(String(cpf_cnpj));

  if (normalizedCpf !== undefined && !isValidCpfCnpj(normalizedCpf)) {
    return NextResponse.json({ error: "CPF/CNPJ inválido" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (company_name !== undefined) updates.company_name = company_name;
  if (avatar_url   !== undefined) updates.avatar_url   = avatar_url;
  if (phone        !== undefined) updates.phone        = phone;
  if (address      !== undefined) updates.address      = address;

  if (Object.keys(updates).length === 0 && normalizedCpf === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  if (normalizedCpf !== undefined) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ cpf_cnpj: normalizedCpf } as Record<string, unknown>)
      .eq("id", user.id);

    if (profileError) {
      console.error("[PATCH /api/agencies/profile][profiles]", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("agencies")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("[PATCH /api/agencies/profile]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("agencies")
    .select("company_name, avatar_url, subscription_status")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
