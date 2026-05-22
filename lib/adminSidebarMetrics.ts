/**
 * Admin sidebar operational badge counters with seen-state filtering.
 *
 * Each badge shows only when the section has activity NEWER than the last
 * time the admin visited that page. Visiting a page marks it as seen;
 * new records arriving after that timestamp re-show the badge.
 *
 * All queries run in a single Promise.allSettled — no sequential waits.
 * Individual failures (e.g. contract_disputes table not yet migrated) are
 * silently swallowed so the sidebar never breaks.
 */

import { createServerClient } from "@/lib/supabase";

export type AdminSidebarBadgeColor = "red" | "amber";

export type AdminSidebarBadge = {
  count: number;
  color: AdminSidebarBadgeColor;
};

/** Keyed by nav item href. Only populated when badge should be visible. */
export type AdminSidebarMetrics = Record<string, AdminSidebarBadge>;

/** Maps sidebar route prefixes to their nav_key stored in admin_nav_seen. */
export const ROUTE_TO_NAV_KEY: Record<string, string> = {
  "/admin/withdrawals": "withdrawals",
  "/admin/disputes":    "disputes",
  "/admin/support":     "support",
  "/admin/payouts":     "payouts",
  "/admin/contracts":   "contracts",
  "/admin/bookings":    "bookings",
  "/admin/users":       "users",
};

const NAV_KEY_TO_HREF: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTE_TO_NAV_KEY).map(([href, key]) => [key, href]),
);

// ── helpers ───────────────────────────────────────────────────────────────────

type Settled = PromiseSettledResult<unknown>;

function count(res: Settled): number {
  if (res.status !== "fulfilled") return 0;
  return (res.value as { count: number | null }).count ?? 0;
}

function latestAt(res: Settled, ...fields: string[]): Date | null {
  if (res.status !== "fulfilled") return null;
  const row = ((res.value as { data: Record<string, string | null>[] | null }).data ?? [])[0];
  if (!row) return null;
  for (const f of fields) {
    const v = row[f];
    if (v) return new Date(v);
  }
  return null;
}

function isUnseen(navKey: string, activityAt: Date | null, seenMap: Map<string, Date>): boolean {
  if (!activityAt) return false;
  const seen = seenMap.get(navKey);
  return !seen || activityAt > seen;
}

// ── main export ───────────────────────────────────────────────────────────────

export async function buildAdminSidebarMetrics(adminUserId: string): Promise<AdminSidebarMetrics> {
  const supabase = createServerClient({ useServiceRole: true });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const results = await Promise.allSettled([
    // [0] Saques pendentes → /admin/withdrawals → red
    supabase
      .from("wallet_transactions")
      .select("created_at", { count: "exact" })
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1),

    // [1] Disputas abertas → /admin/disputes → red
    supabase
      .from("contract_disputes")
      .select("created_at", { count: "exact" })
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: false })
      .limit(1),

    // [2] Suporte waiting_admin → /admin/support → amber
    //     Use updated_at (latest message) with created_at fallback.
    supabase
      .from("support_conversations")
      .select("updated_at, created_at", { count: "exact" })
      .eq("status", "waiting_admin")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1),

    // [3] Custódia aguardando liberação → /admin/payouts → amber
    //     Use deposit_paid_at (when confirmed) with created_at fallback.
    supabase
      .from("contracts")
      .select("deposit_paid_at, created_at", { count: "exact" })
      .is("deleted_at", null)
      .eq("status", "confirmed")
      .order("deposit_paid_at", { ascending: false })
      .limit(1),

    // [4] Contratos aguardando assinatura/depósito → /admin/contracts → amber
    supabase
      .from("contracts")
      .select("created_at", { count: "exact" })
      .is("deleted_at", null)
      .in("status", ["sent", "signed"])
      .order("created_at", { ascending: false })
      .limit(1),

    // [5] Novos usuários hoje → /admin/users → amber
    supabase
      .from("profiles")
      .select("created_at", { count: "exact" })
      .is("deleted_at", null)
      .gte("created_at", todayIso)
      .order("created_at", { ascending: false })
      .limit(1),

    // [6] Reservas pendentes → /admin/bookings → amber
    supabase
      .from("bookings")
      .select("created_at", { count: "exact" })
      .is("deleted_at", null)
      .in("status", ["pending", "pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1),

    // [7] Seen timestamps for this admin (all nav_keys in one query)
    supabase
      .from("admin_nav_seen")
      .select("nav_key, seen_at")
      .eq("admin_user_id", adminUserId),
  ]);

  // Build seen map from result [7]
  const seenMap = new Map<string, Date>();
  const seenRes = results[7];
  if (seenRes.status === "fulfilled") {
    const rows = (seenRes.value as { data: { nav_key: string; seen_at: string }[] | null }).data ?? [];
    for (const row of rows) seenMap.set(row.nav_key, new Date(row.seen_at));
  }

  const metrics: AdminSidebarMetrics = {};

  function maybe(
    idx: number,
    navKey: string,
    color: AdminSidebarBadgeColor,
    ...tsFields: string[]
  ) {
    const n = count(results[idx]);
    if (n === 0) return;
    const at = latestAt(results[idx], ...tsFields);
    if (isUnseen(navKey, at, seenMap)) {
      metrics[NAV_KEY_TO_HREF[navKey]!] = { count: n, color };
    }
  }

  maybe(0, "withdrawals", "red",   "created_at");
  maybe(1, "disputes",    "red",   "created_at");
  maybe(2, "support",     "amber", "updated_at", "created_at");
  maybe(3, "payouts",     "amber", "deposit_paid_at", "created_at");
  maybe(4, "contracts",   "amber", "created_at");
  maybe(5, "users",       "amber", "created_at");
  maybe(6, "bookings",    "amber", "created_at");

  return metrics;
}
