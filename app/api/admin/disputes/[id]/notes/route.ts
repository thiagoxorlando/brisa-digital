import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    body?: string;
    visibility?: "internal" | "public";
  };
  const noteBody = body.body?.trim() ?? "";
  const visibility = body.visibility === "public" ? "public" : "internal";

  if (!id || !noteBody) {
    return NextResponse.json({ error: "dispute id and note body are required." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: dispute } = await supabase
    .from("contract_disputes")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  const { data: note, error } = await supabase
    .from("contract_dispute_notes")
    .insert({
      dispute_id: id,
      admin_user_id: auth.userId,
      visibility,
      body: noteBody,
    })
    .select("id")
    .single();

  if (error || !note) {
    console.error("[admin/dispute-notes] insert failed", error?.message);
    return NextResponse.json({ error: "Could not add note." }, { status: 500 });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "dispute_note_added",
    entityType: "contract_dispute",
    entityId: id,
    metadata: { visibility },
  });

  revalidatePath(`/admin/disputes/${id}`);

  return NextResponse.json({ ok: true, id: note.id });
}
