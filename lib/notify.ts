import { createClient } from "@supabase/supabase-js";

/**
 * Insert one or more notification rows using the service role key
 * so RLS is bypassed. Logs errors instead of swallowing them.
 */
export async function notify(
  userIds: string | string[],
  type: string,
  message: string,
  link: string
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error("[notify] Insert failed:", error.message, { type, message, ids });
  }
}
