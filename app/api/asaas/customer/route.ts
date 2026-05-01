import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { createCustomer } from "@/lib/asaas";
import { resolveDocument } from "@/lib/asaasCustomer";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { cpfCnpj?: string };
  const cpfCnpj = body.cpfCnpj?.replace(/\D/g, "") ?? "";
  const resolvedCpfCnpj = cpfCnpj || await resolveDocument(user.id);

  if (!resolvedCpfCnpj) {
    return NextResponse.json(
      { error: "Complete seu CPF para continuar" },
      { status: 400 },
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  // 1. Check for cached Asaas customer ID
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, asaas_customer_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if ((profile as Record<string, unknown>).asaas_customer_id) {
    return NextResponse.json({
      customerId: (profile as Record<string, unknown>).asaas_customer_id,
    });
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
  let customerId: string;
  try {
    const created = await createCustomer({ name, email, cpfCnpj: resolvedCpfCnpj });
    customerId = created.id;
    console.log("[asaas customer] created", { userId: user.id, customerId });
  } catch (err) {
    console.error("[asaas customer] failed", { userId: user.id, error: String(err) });
    return NextResponse.json(
      { error: "Complete seu CPF para continuar" },
      { status: 400 },
    );
  }

  // 4. Persist to profile (non-fatal)
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ asaas_customer_id: customerId } as Record<string, unknown>)
    .eq("id", user.id);
  if (updateErr) {
    console.warn("[asaas customer] cache write failed (non-fatal)", updateErr.message);
  }

  return NextResponse.json({ customerId });
}
