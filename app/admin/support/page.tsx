import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { resolveSupportUsers } from "@/lib/resolveSupportUsers";
import AdminSupport, { type AdminConversation } from "@/features/admin/AdminSupport";

export const metadata: Metadata = { title: "Support — Admin — BrisaHub" };

export default async function AdminSupportPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: convs } = await supabase
    .from("support_conversations")
    .select("id, user_id, subject, status, priority, last_message_at, created_at, closed_at, archived_at")
    .is("archived_at", null)
    .order("last_message_at", { ascending: false });

  const userIds = [...new Set((convs ?? []).map((c) => c.user_id))];
  const userMap = await resolveSupportUsers(userIds);

  const conversations: AdminConversation[] = (convs ?? []).map((c) => {
    const u = userMap.get(c.user_id);
    return {
      id:              c.id,
      user_id:         c.user_id,
      subject:         c.subject,
      status:          c.status,
      priority:        c.priority,
      last_message_at: c.last_message_at,
      created_at:      c.created_at,
      closed_at:       c.closed_at,
      archived_at:     (c as Record<string, unknown>).archived_at as string | null ?? null,
      userName:      u?.name      ?? "Usuário removido",
      userEmail:     u?.email     ?? "",
      userRole:      u?.role      ?? "unknown",
      userRoleLabel: u?.roleLabel ?? "Usuário",
    };
  });

  return <AdminSupport initialConversations={conversations} />;
}
