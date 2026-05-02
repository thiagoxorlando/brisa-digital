import { createServerClient } from "@/lib/supabase";

/**
 * Permanently removes a user so the same email/phone can be reused.
 *
 * Handles orphan rows (role table exists, auth/profile may not),
 * auth-only users, and rows keyed by user_id instead of id.
 *
 * Throws on any unrecoverable error so the caller can return 500.
 */
export async function deleteUserDeep(userId: string): Promise<void> {
  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  // ── 1. Collect all IDs that belong to this account ──────────────────────────
  // Some tables use user_id as FK instead of id.
  const candidateIds = new Set<string>([userId]);

  const [{ data: agencyRows }, { data: talentRows }] = await Promise.all([
    supabase.from("agencies").select("id, user_id").or(`id.eq.${userId},user_id.eq.${userId}`),
    supabase.from("talent_profiles").select("id, user_id").or(`id.eq.${userId},user_id.eq.${userId}`),
  ]);

  for (const r of agencyRows ?? []) {
    if (r.id) candidateIds.add(r.id);
    const uid = (r as Record<string, unknown>).user_id;
    if (uid && typeof uid === "string") candidateIds.add(uid);
  }
  for (const r of talentRows ?? []) {
    if (r.id) candidateIds.add(r.id);
    const uid = (r as Record<string, unknown>).user_id;
    if (uid && typeof uid === "string") candidateIds.add(uid);
  }

  const ids = [...candidateIds];

  // ── 2. Find agency jobs ──────────────────────────────────────────────────────
  const { data: jobRows } = await supabase.from("jobs").select("id").in("agency_id", ids);
  const jobIds = (jobRows ?? []).map((j) => j.id);

  // ── 3. Unlink payments FK (preserve financial records) ──────────────────────
  await supabase.from("payments").update({ agency_id: null }).in("agency_id", ids);

  // ── 4. Hard-delete wallet_transactions (removes FK blocking profile delete) ─
  await supabase.from("wallet_transactions").delete().in("user_id", ids);

  // ── 5. Delete notifications ──────────────────────────────────────────────────
  await supabase.from("notifications").delete().in("user_id", ids);

  // ── 6. Delete submissions ────────────────────────────────────────────────────
  await supabase.from("submissions").delete().in("talent_user_id", ids);
  if (jobIds.length > 0) {
    await supabase.from("submissions").delete().in("job_id", jobIds);
  }

  // ── 7. Bookings — soft-delete ────────────────────────────────────────────────
  await supabase.from("bookings").update({ deleted_at: now }).in("talent_user_id", ids);
  await supabase.from("bookings").update({ deleted_at: now }).in("agency_id", ids);
  if (jobIds.length > 0) {
    await supabase.from("bookings").update({ deleted_at: now }).in("job_id", jobIds);
  }

  // ── 8. Contracts — soft-delete unpaid ───────────────────────────────────────
  await supabase.from("contracts").update({ deleted_at: now }).in("talent_id", ids).neq("status", "paid");
  await supabase.from("contracts").update({ deleted_at: now }).in("agency_id", ids).neq("status", "paid");
  if (jobIds.length > 0) {
    await supabase.from("contracts").update({ deleted_at: now }).in("job_id", jobIds).neq("status", "paid");
  }

  // ── 9. Jobs — soft-delete ────────────────────────────────────────────────────
  if (jobIds.length > 0) {
    await supabase.from("jobs").update({ deleted_at: now }).in("id", jobIds);
  }

  // ── 10. Unlink FK columns that would block the hard-deletes below ────────────
  // PostgreSQL FK default is RESTRICT — rows referencing agencies/talent_profiles
  // must have their FK columns cleared before those tables can be hard-deleted.
  // Soft-deleting (deleted_at) does NOT remove the FK reference.
  if (jobIds.length > 0) {
    await supabase.from("jobs").update({ agency_id: null }).in("id", jobIds);
  }
  await supabase.from("bookings").update({ agency_id: null }).in("agency_id", ids);
  await supabase.from("bookings").update({ talent_user_id: null }).in("talent_user_id", ids);
  await supabase.from("contracts").update({ agency_id: null }).in("agency_id", ids);
  await supabase.from("contracts").update({ talent_id: null }).in("talent_id", ids);

  // ── 11. HARD-DELETE role rows (critical — blocks email/phone reuse if left) ─
  // Delete by both id and user_id to catch any orphan rows with mismatched keys.
  await supabase.from("talent_profiles").delete().in("id", ids);
  await supabase.from("agencies").delete().in("id", ids);
  // Fallback sweep by user_id column in case schema diverges
  await supabase.from("talent_profiles").delete().in("user_id", ids);
  await supabase.from("agencies").delete().in("user_id", ids);

  // ── 12. HARD-DELETE profile row ──────────────────────────────────────────────
  const { error: profileErr } = await supabase.from("profiles").delete().in("id", ids);
  if (profileErr) {
    throw new Error(`Não foi possível excluir o perfil: ${profileErr.message}`);
  }

  // ── 13. Delete from Supabase Auth ────────────────────────────────────────────
  const authErrors: string[] = [];

  for (const id of ids) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (!authErr) continue;

    const msg = authErr.message.toLowerCase();

    if (msg.includes("user not found")) {
      // Already removed — acceptable
      continue;
    }

    if (msg.includes("database error deleting user")) {
      // Retry once — Supabase occasionally returns this transiently
      await new Promise((r) => setTimeout(r, 600));
      const { error: retry } = await supabase.auth.admin.deleteUser(id);
      if (!retry || retry.message.toLowerCase().includes("user not found")) continue;
      authErrors.push(`${id}: ${retry.message}`);
      continue;
    }

    authErrors.push(`${id}: ${authErr.message}`);
  }

  if (authErrors.length > 0) {
    console.error("[deleteUserDeep] auth delete failed:", authErrors);
    throw new Error(
      `Não foi possível remover a conta de autenticação. O e-mail ainda não pode ser reutilizado. Detalhe: ${authErrors.join("; ")}`,
    );
  }
}
