import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminAnalytics, {
  type AnalyticsBucket,
  type AnalyticsData,
} from "@/features/admin/AdminAnalytics";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

export const metadata: Metadata = { title: "Analytics — Admin — BrisaHub" };

function sumNumeric(rows: { [k: string]: unknown }[] | null | undefined, field: string): number {
  if (!rows) return 0;
  return rows.reduce((acc, r) => acc + Math.abs(Number((r as Record<string, unknown>)[field] ?? 0)), 0);
}

export default async function AdminAnalyticsPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // All-time aggregates — parallel
  const [
    profilesAllRes,
    bookingsAllRes,
    bookingsConfirmedRes,
    contractsAllRes,
    contractsPaidRes,
    escrowContractsRes,
    payoutsRes,
    withdrawalsRes,
    commissionPaidRes,
    workspacesActiveRes,
    // 30-day windows
    profilesNewRes,
    bookings30Res,
    commission30Res,
  ] = await Promise.all([
    supabase.from("profiles").select("id, role").is("deleted_at", null),
    supabase.from("bookings").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["confirmed", "paid"]),
    supabase.from("contracts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "paid"),
    supabase
      .from("contracts")
      .select("payment_amount")
      .is("deleted_at", null)
      .eq("status", "confirmed"),
    supabase.from("wallet_transactions").select("amount").eq("type", "payout"),
    supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("type", "withdrawal")
      .in("status", ["paid", "completed"]),
    supabase
      .from("contracts")
      .select("commission_amount")
      .is("deleted_at", null)
      .eq("status", "paid"),
    supabase
      .from("premium_workspaces")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("contracts")
      .select("commission_amount")
      .is("deleted_at", null)
      .eq("status", "paid")
      .gte("paid_at", thirtyDaysAgo),
  ]);

  const profiles = profilesAllRes.data ?? [];
  const totalAgencies = profiles.filter((p) => p.role === "agency").length;
  const totalTalents = profiles.filter((p) => p.role === "talent").length;

  const allTime: AnalyticsBucket = {
    totalUsers: profiles.length,
    newUsers: profilesNewRes.count ?? 0,
    totalAgencies,
    totalTalents,
    totalBookings: bookingsAllRes.count ?? 0,
    confirmedBookings: bookingsConfirmedRes.count ?? 0,
    totalContracts: contractsAllRes.count ?? 0,
    paidContracts: contractsPaidRes.count ?? 0,
    escrowValue: sumNumeric(escrowContractsRes.data, "payment_amount"),
    payoutsValue: sumNumeric(payoutsRes.data, "amount"),
    withdrawalsValue: sumNumeric(withdrawalsRes.data, "amount"),
    commissionRevenue: sumNumeric(commissionPaidRes.data, "commission_amount"),
    activePremiumWorkspaces: workspacesActiveRes.count ?? 0,
  };

  const last30Days: AnalyticsBucket = {
    ...allTime,
    newUsers: profilesNewRes.count ?? 0,
    totalBookings: bookings30Res.count ?? 0,
    commissionRevenue: sumNumeric(commission30Res.data, "commission_amount"),
  };

  const data: AnalyticsData = { allTime, last30Days };

  return <AdminAnalytics data={data} />;
}
