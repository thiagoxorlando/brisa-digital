import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

type Params = { params: Promise<{ id: string }> };

// ── PATCH — update role OR freeze/unfreeze ────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();

  const supabase = createServerClient({ useServiceRole: true });

  // Add wallet balance
  if (body.action === "add_balance") {
    const amount = Number(body.amount ?? 0);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", id)
      .single();

    const current = Number(profile?.wallet_balance ?? 0);

    const { error } = await supabase
      .from("profiles")
      .update({ wallet_balance: current + amount })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("wallet_transactions").insert({
      user_id:     id,
      type:        "admin_credit",
      amount,
      description: body.description?.trim() || "Crédito manual — administrador",
    });

    return NextResponse.json({ ok: true, newBalance: current + amount });
  }

  // Freeze / unfreeze action
  if (body.action === "freeze" || body.action === "unfreeze") {
    const { error } = await supabase
      .from("profiles")
      .update({ is_frozen: body.action === "freeze" })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Role change
  const { role } = body;
  if (!["talent", "agency", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// ── DELETE — soft-delete user profile (moves to trash) ───────────────────────
// Soft-deletes talent_profiles / agencies / jobs / contracts so they appear in
// the trash page. Hard-deletes ephemeral rows (submissions, notifications,
// bookings) and the auth account since those can't be meaningfully restored.
// Order:
//  1. Hard-delete submissions + notifications (ephemeral, not in trash)
//  2. Hard-delete bookings (not tracked in trash)
//  3. Soft-delete unpaid contracts (talent side + agency side)
//  4. Soft-delete jobs posted by this agency + their unpaid contracts
//  5. Soft-delete talent_profiles / agencies row
//  6. Hard-delete profiles row + auth user (account is gone)
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  // 1. Hard-delete submissions + notifications
  await supabase.from("submissions").delete().eq("talent_user_id", id);
  await supabase.from("notifications").delete().eq("user_id", id);

  // 2. Soft-delete bookings (appear in trash)
  await supabase.from("bookings").update({ deleted_at: now }).or(`talent_user_id.eq.${id},agency_id.eq.${id}`);

  // 3. Soft-delete unpaid contracts (talent side)
  await supabase
    .from("contracts")
    .update({ deleted_at: now })
    .eq("talent_id", id)
    .neq("status", "paid");

  // 3b. Soft-delete unpaid contracts (agency side)
  await supabase
    .from("contracts")
    .update({ deleted_at: now })
    .eq("agency_id", id)
    .neq("status", "paid");

  // 4. Jobs posted by this user (agency)
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("agency_id", id);

  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map((j) => j.id);

    // Soft-delete unpaid contracts for these jobs
    await supabase
      .from("contracts")
      .update({ deleted_at: now })
      .in("job_id", jobIds)
      .neq("status", "paid");

    // Hard-delete submissions for these jobs
    await supabase.from("submissions").delete().in("job_id", jobIds);

    // Soft-delete the jobs
    await supabase.from("jobs").update({ deleted_at: now }).in("id", jobIds);
  }

  // 5. Soft-delete profile rows (appear in trash)
  await supabase.from("talent_profiles").update({ deleted_at: now }).eq("id", id);
  await supabase.from("agencies").update({ deleted_at: now }).eq("id", id);

  // 6. Hard-delete the profiles row and auth account (can't restore auth)
  await supabase.from("profiles").delete().eq("id", id);
  const { error: authErr } = await supabase.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
