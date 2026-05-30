import type { Metadata } from "next";
import AdminNotifications, {
  type BroadcastEntry,
  type UserOption,
} from "@/features/admin/AdminNotifications";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Notifications — Admin — BrisaHub" };

export default async function AdminNotificationsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [broadcastsResult, profilesResult, authUsersResult] = await Promise.all([
    Promise.resolve(
      supabase
        .from("admin_notification_broadcasts")
        .select("id, admin_id, title, message, audience, target_user_id, link, sent_count, created_at, archived_at, deleted_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ).then((r) => r).catch(() => ({ data: null, error: null })),

    supabase
      .from("profiles")
      .select("id, role")
      .in("role", ["agency", "talent"]),

    Promise.resolve(supabase.auth.admin.listUsers({ perPage: 1000 }))
      .then((r) => (r.data?.users ?? []) as { id: string; email?: string }[])
      .catch(() => [] as { id: string; email?: string }[]),
  ]);

  const emailMap = new Map<string, string>(authUsersResult.map((u) => [u.id, u.email ?? ""]));
  const authUserIdSet = new Set(authUsersResult.map((u) => u.id));

  const [agenciesResult] = await Promise.all([
    supabase
      .from("agencies")
      .select("user_id, company_name")
      .is("deleted_at", null),
  ]);

  const [talentsResult] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id, full_name")
      .is("deleted_at", null),
  ]);

  const agencyNameMap = new Map<string, string>(
    (agenciesResult.data ?? []).map((a) => [a.user_id as string, a.company_name as string ?? ""]),
  );
  const talentNameMap = new Map<string, string>(
    (talentsResult.data ?? []).map((t) => [t.id as string, t.full_name as string ?? ""]),
  );

  const users: UserOption[] = (profilesResult.data ?? [])
    .filter((p) => authUserIdSet.has(p.id as string))
    .map((p) => {
    const id = p.id as string;
    const role = p.role as "agency" | "talent";
    const email = emailMap.get(id) ?? "";
    const name = role === "agency"
      ? (agencyNameMap.get(id) || email || id)
      : (talentNameMap.get(id) || email || id);
    return { id, role, email, name };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const broadcasts: BroadcastEntry[] = (broadcastsResult.data ?? []).map((row) => ({
    id:             row.id as string,
    adminId:        row.admin_id as string,
    adminEmail:     emailMap.get(row.admin_id as string) ?? null,
    title:          row.title as string,
    message:        row.message as string,
    audience:       row.audience as string,
    targetUserId:   row.target_user_id as string | null,
    targetUserName: row.target_user_id
      ? users.find((u) => u.id === row.target_user_id)?.name ?? (authUserIdSet.has(row.target_user_id as string) ? null : "Usuário deletado")
      : null,
    link:           row.link as string | null,
    sentCount:      Number(row.sent_count ?? 0),
    createdAt:      row.created_at as string,
    archivedAt:     (row as { archived_at?: string | null }).archived_at ?? null,
    deletedAt:      (row as { deleted_at?: string | null }).deleted_at ?? null,
    isOrphanTarget: !!row.target_user_id && !authUserIdSet.has(row.target_user_id as string),
  }));

  return <AdminNotifications users={users} broadcasts={broadcasts} />;
}
