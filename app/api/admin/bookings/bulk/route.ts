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
    return NextResponse.json({ error: "Informe ao menos uma reserva." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { error } = await supabase
    .from("bookings")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, count: ids.length });
}
