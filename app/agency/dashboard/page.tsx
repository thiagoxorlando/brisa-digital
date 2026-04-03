import type { Metadata } from "next";
import AgencyDashboardOverview from "@/features/agency/AgencyDashboardOverview";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Dashboard — ucastanet" };

export default async function AgencyDashboardPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { count: activeJobs },
    { count: submissionsCount },
    { count: bookingsCount },
    { data: recentTalentData },
    { data: recentBookingsData },
    { data: recentSubmissionsData },
  ] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("submissions").select("id", { count: "exact", head: true }),
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("bookings")
      .select("id, job_title, talent_user_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("submissions")
      .select("id, job_id, talent_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  // Resolve talent names for recent bookings + submissions
  const talentIds = [
    ...new Set([
      ...(recentBookingsData ?? []).map((b) => b.talent_user_id),
      ...(recentSubmissionsData ?? []).map((s) => s.talent_user_id),
    ].filter((id): id is string => !!id)),
  ];

  const profileMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) profileMap.set(p.id, p.full_name ?? "Unknown");
  }

  // Resolve job titles for recent submissions
  const jobIds = [...new Set((recentSubmissionsData ?? []).map((s) => s.job_id).filter(Boolean))];
  const jobMap = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs } = await supabase.from("jobs").select("id, title").in("id", jobIds);
    for (const j of jobs ?? []) jobMap.set(j.id, j.title ?? "Job");
  }

  const recentActivity = [
    ...(recentBookingsData ?? []).map((b) => ({
      id:    b.id,
      type:  "booking" as const,
      title: "Booking confirmed",
      sub:   `${profileMap.get(b.talent_user_id) ?? "Talent"} × ${b.job_title ?? "a job"}`,
      time:  b.created_at,
    })),
    ...(recentSubmissionsData ?? []).map((s) => ({
      id:    s.id,
      type:  "submission" as const,
      title: "New submission",
      sub:   `${profileMap.get(s.talent_user_id) ?? "Talent"} applied to "${jobMap.get(s.job_id) ?? "a job"}"`,
      time:  s.created_at,
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
