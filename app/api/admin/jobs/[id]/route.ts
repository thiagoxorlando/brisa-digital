import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

type Params = { params: Promise<{ id: string }> };

// ── PATCH — edit job fields ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["title", "status", "budget", "deadline", "description", "location"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { error } = await supabase.from("jobs").update(updates).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// ── DELETE — soft-delete job (moves to trash) ────────────────────────────────
// Order:
//   1. Soft-delete unpaid contracts for this job (paid contracts are preserved)
//   2. Hard-delete submissions (not tracked in trash)
//   3. Soft-delete the job itself (sets deleted_at so it appears in trash)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  // 1. Soft-delete unpaid contracts
  await supabase
    .from("contracts")
    .update({ deleted_at: now })
    .eq("job_id", id)
    .neq("status", "paid");

  // 2. Hard-delete submissions (not shown in trash)
  await supabase.from("submissions").delete().eq("job_id", id);

  // 3. Soft-delete the job
  const { error } = await supabase.from("jobs").update({ deleted_at: now }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
