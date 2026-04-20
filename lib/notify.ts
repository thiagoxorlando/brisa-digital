import { createClient } from "@supabase/supabase-js";

/**
 * Insert one or more notification rows using the service role key
 * so RLS is bypassed.
 *
 * Pass idempotencyKey to make the insert a no-op if the same key was
 * already inserted (e.g. by a Postgres RPC). The notifications table has
 * a UNIQUE index on idempotency_key, so ON CONFLICT DO NOTHING applies.
 */
export async function notify(
  userIds: string | string[],
  type: string,
  message: string,
  link: string,
  idempotencyKey?: string,
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return;

  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    console.error("[notify] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  const supabase = createClient(url, svcKey, { auth: { persistSession: false } });

  const rows = ids.map((user_id) => ({
    user_id,
    type,
    message,
    link,
    is_read: false,
    created_at: new Date().toISOString(),
    // Only set idempotency_key when provided (single-recipient calls)
    ...(idempotencyKey && ids.length === 1 ? { idempotency_key: idempotencyKey } : {}),
  }));

  console.log("[notify] inserting:", rows.map((r) => ({ user_id: r.user_id, type: r.type, idempotency_key: (r as Record<string, unknown>).idempotency_key ?? null })));

  const { data: inserted, error } = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id, user_id, type");

  if (error) {
    console.error("[notify] insert failed:", error.message, { type, message, ids });
  } else {
    console.log("[notify] inserted ok:", inserted);
  }
}
