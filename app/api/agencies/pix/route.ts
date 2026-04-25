import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;

// GET /api/agencies/pix — returns current PIX key for the authenticated agency
export async function GET() {
  const session = await createSessionClient();
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "agency") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabase
    .from("agencies")
    .select("pix_key_type, pix_key_value, pix_holder_name")
    .eq("id", user.id)
    .single();


  return NextResponse.json({ pix: data ?? null });
}

// POST /api/agencies/pix — save or update PIX key for the authenticated agency
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "agency") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { pix_key_type?: string; pix_key_value?: string; pix_holder_name?: string };
  const keyType   = body.pix_key_type?.trim() ?? "";
  const keyValue  = body.pix_key_value?.trim() ?? "";
  const holderName = body.pix_holder_name?.trim() ?? "";

  if (!PIX_KEY_TYPES.includes(keyType as (typeof PIX_KEY_TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de chave PIX inválido." }, { status: 400 });
  }
  if (!keyValue) return NextResponse.json({ error: "Chave PIX obrigatória." }, { status: 400 });
  if (!holderName) return NextResponse.json({ error: "Nome do titular obrigatório." }, { status: 400 });

  const { error: upsertErr } = await supabase
    .from("agencies")
    .update({ pix_key_type: keyType, pix_key_value: keyValue, pix_holder_name: holderName })
    .eq("id", user.id);

  if (upsertErr) {
    console.error("[agencies/pix] update error:", upsertErr.message);
    return NextResponse.json({ error: "Erro ao salvar chave PIX." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
