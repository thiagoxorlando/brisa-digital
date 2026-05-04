import type { Metadata } from "next";
import AdminDashboard from "@/features/admin/AdminDashboard";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Painel administrativo — BrisaHub" };

const COMMISSION_RATE = 0.1;
const REFERRAL_RATE   = 0.02;

export default async function AdminDashboardPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: bookingsData },
    { count: jobsCount },
    { count: talentCount },
    { count: agencyCount },
    { count: pendingWithdrawalsCount },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, talent_user_id, job_id, job_title, price, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("talent_profiles").select("id", { count: "exact", head: true }),
    supabase.from("agencies").select("id", { count: "exact", head: true }),
    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"])
      .eq("type", "withdrawal"),
  ]);

  // Find which job+talent pairs have a referrer
  const jobIds = [...new Set((bookingsData ?? []).map((b) => b.job_id).filter(Boolean))] as string[];
  const referrerJobSet = new Set<string>();
  if (jobIds.length) {
    const { data: subs } = await supabase
      .from("submissions")
      .select("job_id, talent_user_id")
      .in("job_id", jobIds)
      .not("referrer_id", "is", null);
    for (const s of subs ?? []) {
      referrerJobSet.add(`${s.job_id}::${s.talent_user_id}`);
    }
  }

  // Resolve talent profiles via talent_user_id
  const talentIds = [
    ...new Set(
      (bookingsData ?? [])
        .map((b) => b.talent_user_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const profileMap = new Map<string, { full_name: string; instagram: string | null }>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, instagram")
      .in("id", talentIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name ?? "", instagram: p.instagram ?? null });
    }
  }

  const bookings = (bookingsData ?? []).map((b) => {
    const profile = b.talent_user_id ? profileMap.get(b.talent_user_id) : null;
    const total       = Number(b.price ?? 0);
    const hasReferrer = referrerJobSet.has(`${b.job_id}::${b.talent_user_id}`);
    return {
      id:                 String(b.id),
      talentId:           b.talent_user_id ?? null,
      talentName:         profile?.full_name ?? "Talento sem nome",
      talentHandle:       profile?.instagram ?? null,
      jobTitle:           b.job_title    ?? "—",
      totalValue:         total,
      platformCommission: Math.round(total * COMMISSION_RATE * 100) / 100,
      referralPayout:     hasReferrer ? Math.round(total * REFERRAL_RATE * 100) / 100 : 0,
      hasReferrer,
      status:             b.status ?? "pending",
      bookedAt:           b.created_at   ?? "",
    };
  });

  const totalRevenue = bookings.reduce((s, b) => s + b.platformCommission, 0);

  const stats = {
    totalJobs:          jobsCount     ?? 0,
    totalUsers:         (talentCount ?? 0) + (agencyCount ?? 0),
    totalBookings:      bookings.length,
    totalRevenue,
    pendingWithdrawals: pendingWithdrawalsCount ?? 0,
  };

  return <AdminDashboard bookings={bookings} stats={stats} />;
}
