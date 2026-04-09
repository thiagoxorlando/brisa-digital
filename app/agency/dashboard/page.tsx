import type { Metadata } from "next";
import AgencyDashboardOverview from "@/features/agency/AgencyDashboardOverview";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Dashboard — Brisa Digital" };

export default async function AgencyDashboardPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const agencyId = user?.id;

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { count: activeJobs },
    { count: submissionsCount },
    { count: bookingsCount },
    { data: recentBookingsData },
    { data: recentSubmissionsData },
  ] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId ?? ""),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("agency_id", agencyId ?? ""),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("agency_id", agencyId ?? ""),
    supabase.from("bookings")
      .select("id, job_title, job_id, talent_user_id, status, created_at")
      .eq("agency_id", agencyId ?? "")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("submissions")
      .select("id, job_id, talent_user_id, created_at")
      .eq("agency_id", agencyId ?? "")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  // Resolve talent profiles for recent bookings + submissions
  const talentIds = [
    ...new Set([
      ...(recentBookingsData ?? []).map((b) => b.talent_user_id),
      ...(recentSubmissionsData ?? []).map((s) => s.talent_user_id),
    ].filter((id): id is string => !!id)),
  ];

  const profileMap = new Map<string, string>();
  const avatarMap  = new Map<string, string | null>();
  let recentTalentData: { id: string; full_name: string | null; avatar_url: string | null; categories: string[] | null; city: string | null; country: string | null }[] = [];

  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .in("id", talentIds)
      .limit(4);
    recentTalentData = profiles ?? [];
    for (const p of recentTalentData) {
      profileMap.set(p.id, p.full_name ?? "Unknown");
      avatarMap.set(p.id, p.avatar_url ?? null);
    }
  }

  // Resolve job titles and dates for recent submissions
  const jobIds = [...new Set([
    ...(recentSubmissionsData ?? []).map((s) => s.job_id),
    ...(recentBookingsData ?? []).map((b) => b.job_id),
  ].filter(Boolean))];

  const jobMap     = new Map<string, string>();
  const jobDateMap = new Map<string, string | null>();

  if (jobIds.length) {
    const { data: jobs } = await supabase.from("jobs").select("id, title, job_date").in("id", jobIds);
    for (const j of jobs ?? []) {
      jobMap.set(j.id, j.title ?? "Job");
      jobDateMap.set(j.id, j.job_date ?? null);
    }
  }

  const recentActivity = [
    ...(recentBookingsData ?? []).map((b) => ({
      id:       b.id,
      type:     "booking" as const,
      title:    "Booking confirmed",
      sub:      `${profileMap.get(b.talent_user_id) ?? "Talent"} × ${b.job_title ?? "a job"}`,
      time:     b.created_at,
      link:     "/agency/bookings",
      avatarUrl: avatarMap.get(b.talent_user_id) ?? null,
      jobDate:  b.job_id ? jobDateMap.get(b.job_id) ?? null : null,
    })),
    ...(recentSubmissionsData ?? []).map((s) => ({
      id:       s.id,
      type:     "submission" as const,
      title:    "New submission",
      sub:      `${profileMap.get(s.talent_user_id) ?? "Talent"} applied to "${jobMap.get(s.job_id) ?? "a job"}"`,
      time:     s.created_at,
      link:     s.job_id ? `/agency/jobs/${s.job_id}` : "/agency/submissions",
      avatarUrl: avatarMap.get(s.talent_user_id) ?? null,
      jobDate:  s.job_id ? jobDateMap.get(s.job_id) ?? null : null,
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 6);

  return (
    <AgencyDashboardOverview
      stats={{
        activeJobs:  activeJobs     ?? 0,
        submissions: submissionsCount ?? 0,
        bookings:    bookingsCount  ?? 0,
      }}
      recentTalent={recentTalentData ?? []}
      recentActivity={recentActivity}
    />
  );
}
