import type { Metadata } from "next";
import AgencyDashboardOverview from "@/features/agency/AgencyDashboardOverview";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Dashboard — Brisa Digital" };

export default async function AgencyDashboardPage() {
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const agencyId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { count: totalJobs },
    { count: activeJobs },
    { count: submissionsCount },
    { count: pendingPayment },
    { data: paidContracts },
    { data: recentBookingsData },
    { data: recentSubmissionsData },
    { data: pendingContractsData },
    { data: activeJobsData },
    { data: confirmedContractsData },
  ] = await Promise.all([
    // All jobs (not just open)
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .is("deleted_at", null),

    // Open jobs count (stat card)
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .is("deleted_at", null),

    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId),

    // Contracts in escrow (confirmed) — awaiting payout to talent
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "confirmed")
      .is("deleted_at", null),

    // Paid contracts — amounts for totalSpent
    supabase
      .from("contracts")
      .select("id, payment_amount")
      .eq("agency_id", agencyId)
      .eq("status", "paid")
      .is("deleted_at", null),

    supabase
      .from("bookings")
      .select("id, job_title, job_id, talent_user_id, status, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(4),

    supabase
      .from("submissions")
      .select("id, job_id, talent_user_id, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(4),

    // Confirmed contracts list (escrow locked, awaiting payout)
    supabase
      .from("contracts")
      .select("id, payment_amount, job_description, talent_id, job_id, job_date")
      .eq("agency_id", agencyId)
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),

    // Active jobs list
    supabase
      .from("jobs")
      .select("id, title, job_date, talents_needed, number_of_talents_required")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),

    // Paid contracts list
    supabase
      .from("contracts")
      .select("id, payment_amount, job_description, talent_id, job_id, paid_at")
      .eq("agency_id", agencyId)
      .eq("status", "paid")
      .is("deleted_at", null)
      .order("paid_at", { ascending: false })
      .limit(5),
  ]);

  const paidCount  = paidContracts?.length ?? 0;
  const totalSpent = (paidContracts ?? []).reduce(
    (sum, c) => sum + Number(c.payment_amount ?? 0),
    0
  );

  // ── Talent profiles for activity feed ────────────────────────────────────
  const talentIds = [
    ...new Set([
      ...(recentBookingsData    ?? []).map((b) => b.talent_user_id),
      ...(recentSubmissionsData ?? []).map((s) => s.talent_user_id),
      ...(pendingContractsData  ?? []).map((c) => c.talent_id),
      ...(confirmedContractsData ?? []).map((c) => c.talent_id),
    ].filter((id): id is string => !!id)),
  ];

  const profileMap = new Map<string, string>();
  const avatarMap  = new Map<string, string | null>();

  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .in("id", talentIds)
      .limit(20);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.full_name ?? "Talent");
      avatarMap.set(p.id, p.avatar_url ?? null);
    }
  }

  // ── Job titles / dates ────────────────────────────────────────────────────
  const jobIds = [
    ...new Set([
      ...(recentSubmissionsData  ?? []).map((s) => s.job_id),
      ...(recentBookingsData     ?? []).map((b) => b.job_id),
      ...(pendingContractsData   ?? []).map((c) => c.job_id),
      ...(confirmedContractsData ?? []).map((c) => c.job_id),
    ].filter(Boolean)),
  ];

  const jobMap     = new Map<string, string>();
  const jobDateMap = new Map<string, string | null>();

  if (jobIds.length) {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, job_date")
      .in("id", jobIds);
    for (const j of jobs ?? []) {
      jobMap.set(j.id, j.title ?? "Vaga");
      jobDateMap.set(j.id, j.job_date ?? null);
    }
  }

  // ── Recent talent panel ───────────────────────────────────────────────────
  const bookingTalentIds = (recentBookingsData ?? [])
    .map((b) => b.talent_user_id)
    .filter((id): id is string => !!id);

  let recentTalentData: {
    id: string; full_name: string | null; avatar_url: string | null;
    categories: string[] | null; city: string | null; country: string | null;
  }[] = [];

  if (bookingTalentIds.length) {
    const { data } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .in("id", bookingTalentIds)
      .limit(4);
    recentTalentData = data ?? [];
  }

  // ── Activity feed ─────────────────────────────────────────────────────────
  const recentActivity = [
    ...(recentBookingsData ?? []).map((b) => ({
      id:        b.id,
      type:      "booking" as const,
      title:     "Booking confirmado",
      sub:       `${profileMap.get(b.talent_user_id) ?? "Talent"} × ${b.job_title ?? "uma vaga"}`,
      time:      b.created_at,
      link:      "/agency/bookings",
      avatarUrl: avatarMap.get(b.talent_user_id) ?? null,
      jobDate:   b.job_id ? (jobDateMap.get(b.job_id) ?? null) : null,
    })),
    ...(recentSubmissionsData ?? []).map((s) => ({
      id:        s.id,
      type:      "submission" as const,
      title:     "Nova candidatura",
      sub:       `${profileMap.get(s.talent_user_id) ?? "Talent"} se candidatou a "${jobMap.get(s.job_id) ?? "uma vaga"}"`,
      time:      s.created_at,
      link:      s.job_id ? `/agency/jobs/${s.job_id}` : "/agency/submissions",
      avatarUrl: avatarMap.get(s.talent_user_id) ?? null,
      jobDate:   s.job_id ? (jobDateMap.get(s.job_id) ?? null) : null,
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 6);

  // ── Pending contracts list ────────────────────────────────────────────────
  const pendingContracts = (pendingContractsData ?? []).map((c) => ({
    id:         c.id,
    amount:     Number(c.payment_amount ?? 0),
    talentName: c.talent_id ? (profileMap.get(c.talent_id) ?? "Talent") : "Talent",
    jobTitle:   c.job_id ? (jobMap.get(c.job_id) ?? c.job_description ?? "Vaga") : (c.job_description ?? "Vaga"),
    jobDate:    (c as any).job_date ?? (c.job_id ? (jobDateMap.get(c.job_id) ?? null) : null),
  }));

  // ── Active jobs list ──────────────────────────────────────────────────────
  const activeJobsList = (activeJobsData ?? []).map((j) => ({
    id:           j.id,
    title:        j.title ?? "Vaga",
    jobDate:      j.job_date ?? null,
    talentsNeeded: j.talents_needed ?? j.number_of_talents_required ?? 1,
  }));

  // ── Confirmed contracts list ──────────────────────────────────────────────
  const confirmedContracts = (confirmedContractsData ?? []).map((c) => ({
    id:         c.id,
    amount:     Number(c.payment_amount ?? 0),
    talentName: c.talent_id ? (profileMap.get(c.talent_id) ?? "Talent") : "Talent",
    jobTitle:   c.job_id ? (jobMap.get(c.job_id) ?? c.job_description ?? "Vaga") : (c.job_description ?? "Vaga"),
    paidAt:     c.paid_at ?? null,
  }));

  return (
    <AgencyDashboardOverview
      stats={{
        totalJobs:      totalJobs       ?? 0,
        activeJobs:     activeJobs      ?? 0,
        submissions:    submissionsCount ?? 0,
        pendingPayment: pendingPayment   ?? 0,
        paidContracts:  paidCount,
        totalSpent,
      }}
      recentTalent={recentTalentData}
      recentActivity={recentActivity}
      pendingContracts={pendingContracts}
      activeJobsList={activeJobsList}
      confirmedContracts={confirmedContracts}
    />
  );
}
