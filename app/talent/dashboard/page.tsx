import type { Metadata } from "next";
import TalentDashboard from "@/features/talent/TalentDashboard";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Painel — BrisaHub" };

export default async function TalentDashboardPage() {
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const talentId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { count: appliedCount },
    { count: acceptedCount },
    { data: upcomingData },
    { data: pendingContractsData },
    { data: paidContractsData },
    { data: profileData },
  ] = await Promise.all([
    // Jobs applied
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("talent_user_id", talentId),

    // Jobs accepted (contract signed or beyond)
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("talent_id", talentId)
      .in("status", ["signed", "confirmed", "paid"])
      .is("deleted_at", null),

    // Upcoming jobs — confirmed contracts with a future job date
    supabase
      .from("contracts")
      .select("id, job_description, job_date, job_time, location, payment_amount, status, agency_id")
      .eq("talent_id", talentId)
      .in("status", ["signed", "confirmed"])
      .is("deleted_at", null)
      .gte("job_date", new Date().toISOString().slice(0, 10))
      .order("job_date", { ascending: true })
      .limit(5),

    // Awaiting payment — agency confirmed but hasn't paid yet
    supabase
      .from("contracts")
      .select("id, job_description, payment_amount, payment_status, status")
      .eq("talent_id", talentId)
      .eq("status", "confirmed")
      .eq("payment_status", "pending")
      .is("deleted_at", null),

    // Paid contracts — to compute earnings and withdrawable balance
    supabase
      .from("contracts")
      .select("id, payment_amount, paid_at, withdrawn_at")
      .eq("talent_id", talentId)
      .eq("payment_status", "paid")
      .is("deleted_at", null),

    supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", talentId)
      .maybeSingle(),
  ]);

  // Resolve agency names for upcoming jobs
  const agencyIds = [
    ...new Set(
      (upcomingData ?? [])
        .map((c) => c.agency_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const agencyMap = new Map<string, string>();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const a of agencies ?? []) agencyMap.set(a.id, a.company_name ?? "Agency");
  }

  const TALENT_RATE = 0.85;

  const upcomingBookings = (upcomingData ?? []).map((c) => ({
    id:         c.id,
    title:      c.job_description?.slice(0, 60) ?? "Upcoming Job",
    agencyName: agencyMap.get(c.agency_id) ?? "Agency",
    jobDate:    c.job_date   as string | null,
    jobTime:    c.job_time   as string | null,
    location:   c.location   as string | null,
    amount:     Math.round(Number(c.payment_amount ?? 0) * TALENT_RATE * 100) / 100,
    status:     c.status     as string,
  }));

  const pendingPayments = (pendingContractsData ?? []).map((c) => ({
    id:     c.id,
    title:  c.job_description?.slice(0, 60) ?? "Contract",
    amount: Math.round(Number(c.payment_amount ?? 0) * TALENT_RATE * 100) / 100,
  }));

  const totalEarned     = (paidContractsData ?? [])
    .reduce((sum, c) => sum + Math.round(Number(c.payment_amount ?? 0) * TALENT_RATE * 100) / 100, 0);
  const pendingWithdraw = Math.max(0, Number(profileData?.wallet_balance ?? 0));

  // Today's availability
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayAvailRow } = await supabase
    .from("talent_availability")
    .select("is_available, start_time, end_time")
    .eq("talent_id", talentId)
    .eq("date", today)
    .single();

  const todayAvailability = todayAvailRow
    ? {
        is_available: todayAvailRow.is_available as boolean,
        start_time:   todayAvailRow.start_time   as string | null,
        end_time:     todayAvailRow.end_time      as string | null,
      }
    : null;

  return (
    <TalentDashboard
      stats={{
        applied:        appliedCount  ?? 0,
        accepted:       acceptedCount ?? 0,
        upcoming:       upcomingBookings.length,
        pendingWithdraw,
        totalEarned,
      }}
      upcomingBookings={upcomingBookings}
      pendingPayments={pendingPayments}
      todayAvailability={todayAvailability}
    />
  );
}
