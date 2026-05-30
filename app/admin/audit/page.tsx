import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import AdminAudit, { type AuditLogEntry, type AuditSummary } from "@/features/admin/AdminAudit";

export const metadata: Metadata = { title: "Audit — Admin — BrisaHub" };

export default async function AdminAuditPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: rawLogs } = await supabase
    .from("admin_audit_logs")
    .select("id, admin_id, action, entity_type, entity_id, before, after, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const adminIds = [...new Set((rawLogs ?? []).map((l) => l.admin_id as string).filter(Boolean))];

  const adminNameMap = new Map<string, string>();
  if (adminIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", adminIds);

    for (const p of profiles ?? []) {
      if (p.full_name) adminNameMap.set(p.id as string, p.full_name as string);
    }

    for (const id of adminIds) {
      if (!adminNameMap.has(id)) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(id);
          if (authUser.user?.email) adminNameMap.set(id, authUser.user.email);
        } catch {
          // ignore
        }
      }
    }
  }

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const FINANCIAL_ACTIONS = new Set(["balance_adjusted", "withdrawal_cancelled", "plan_settings_changed", "premium_extra_seats_updated"]);
  const USER_ACTIONS = new Set(["user_deleted", "user_restored", "user_frozen"]);

  const logs = (rawLogs ?? []).map((l): AuditLogEntry => ({
    id: l.id as string,
    admin_id: l.admin_id as string,
    adminName: adminNameMap.get(l.admin_id as string) ?? "Admin",
    action: l.action as string,
    entity_type: (l.entity_type ?? "") as string,
    entity_id: (l.entity_id ?? null) as string | null,
    before: (l.before ?? null) as Record<string, unknown> | null,
    after: (l.after ?? null) as Record<string, unknown> | null,
    metadata: (l.metadata ?? null) as Record<string, unknown> | null,
    created_at: l.created_at as string,
  }));

  const summary: AuditSummary = {
    todayCount: logs.filter((l) => new Date(l.created_at).getTime() >= todayStart.getTime()).length,
    sevenDayCount: logs.filter((l) => new Date(l.created_at).getTime() >= now - 7 * 86400_000).length,
    financialCount: logs.filter((l) => FINANCIAL_ACTIONS.has(l.action)).length,
    userCount: logs.filter((l) => USER_ACTIONS.has(l.action)).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#1F2D2E]">Auditoria</h1>
        <p className="text-[14px] text-[#647B7B] mt-1">Histórico de ações administrativas importantes.</p>
      </div>
      <AdminAudit logs={logs} summary={summary} />
    </div>
  );
}
