/**
 * Aggregated sidebar badge counts for the admin navigation.
 *
 * Called once per admin layout render (server-side). All queries run in
 * parallel via Promise.allSettled — individual query failures silently
 * return 0 so a missing/new table never breaks the sidebar.
 */

import { createServerClient } from "@/lib/supabase";

export type AdminSidebarBadgeColor = "red" | "amber" | "green";

export type AdminSidebarBadge = {
  count: number;
  color: AdminSidebarBadgeColor;
};

/** Keyed by the nav item href, e.g. "/admin/withdrawals". Only contains entries where count > 0. */
export type AdminSidebarMetrics = Record<string, AdminSidebarBadge>;

export async function buildAdminSidebarMetrics(): Promise<AdminSidebarMetrics> {
  const supabase = createServerClient({ useServiceRole: true });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const results = await Promise.allSettled([
    // [0] Saques pendentes → /admin/withdrawals → red (urgent, needs action)
    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"]),

    // [1] Suporte aguardando admin → /admin/support → amber
    supabase
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_admin")
      .is("archived_at", null),

    // [2] Pagamentos em custódia aguardando liberação → /admin/payouts → amber
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "confirmed"),

    // [3] Contratos aguardando assinatura ou depósito → /admin/contracts → amber
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["sent", "signed"]),

    // [4] Novos usuários hoje → /admin/users → amber (informational)
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),

    // [5] Reservas pendentes de confirmação → /admin/bookings → amber
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["pending", "pending_payment"]),

    // [6] Disputas abertas → /admin/disputes → red (allSettled handles missing table gracefully)
    supabase
      .from("contract_disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "under_review"]),
  ]);

  function get(idx: number): number {
    const r = results[idx];
    if (r.status !== "fulfilled") return 0;
    return (r.value as { count: number | null }).count ?? 0;
  }

  const metrics: AdminSidebarMetrics = {};

  const withdrawals = get(0);
  if (withdrawals > 0) metrics["/admin/withdrawals"] = { count: withdrawals, color: "red" };

  const support = get(1);
  if (support > 0) metrics["/admin/support"] = { count: support, color: "amber" };

  const payouts = get(2);
  if (payouts > 0) metrics["/admin/payouts"] = { count: payouts, color: "amber" };

  const contracts = get(3);
  if (contracts > 0) metrics["/admin/contracts"] = { count: contracts, color: "amber" };

  const users = get(4);
  if (users > 0) metrics["/admin/users"] = { count: users, color: "amber" };

  const bookings = get(5);
  if (bookings > 0) metrics["/admin/bookings"] = { count: bookings, color: "amber" };

  const disputes = get(6);
  if (disputes > 0) metrics["/admin/disputes"] = { count: disputes, color: "red" };

  return metrics;
}
