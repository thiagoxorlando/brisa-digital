import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[DELETE /api/submissions/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
