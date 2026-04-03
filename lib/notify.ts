import { createServerClient } from "@/lib/supabase";

export type NotifType =
  | "job_application"
  | "job_selected"
  | "booking_created"
  | "new_job"
  | "payment_received"
  | "booking_cancelled"
  | "contract_received"
  | "contract_signed"
  | "booking_updated"
  | "payment_update";

export async function notify(
  userIds: string | string[],
  type: NotifType,
  message: string,
  link?: string
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return;

  const supabase = createServerClient({ useServiceRole: true });
  await supabase.from("notifications").insert(
    ids.map((user_id) => ({ user_id, type, message, is_read: false, link: link ?? null }))
  );
}
