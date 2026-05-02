import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as { ids?: unknown };
  const ids = parseIds(body.ids);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um contrato." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select("id, status")
    .in("id", ids);

  if (contractsError) return NextResponse.json({ error: contractsError.message }, { status: 400 });

  if ((contracts ?? []).some((contract) => contract.status === "paid")) {
    return NextResponse.json({ error: "Contratos pagos não podem ser excluídos." }, { status: 409 });
  }

  const { error } = await supabase
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, count: ids.length });
}
