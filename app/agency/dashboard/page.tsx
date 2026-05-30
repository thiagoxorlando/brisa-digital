import type { Metadata } from "next";
import AgencyDashboardOverview from "@/features/agency/AgencyDashboardOverview";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import type { LaunchChecklistData } from "@/features/agency/AgencyLaunchChecklist";

export const metadata: Metadata = { title: "Dashboard - BrisaHub" };

export default async function AgencyDashboardPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const agencyId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: openJobsData },
    { data: submissionsData },
    { data: confirmedContractsDataRaw },
    { data: paidContractsRaw },
    { data: recentBookingsDataRaw },
    { data: recentSubmissionsDataRaw },
    { data: profile },
    { data: agencyRow },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, job_date, talents_needed, number_of_talents_required")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .is("workspace_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id, job_id, talent_user_id, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, payment_amount, job_description, talent_id, job_id, job_date")
      .eq("agency_id", agencyId)
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, payment_amount, job_description, talent_id, job_id, paid_at")
      .eq("agency_id", agencyId)
      .eq("status", "paid")
      .is("deleted_at", null)
      .order("paid_at", { ascending: false }),
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
    supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", agencyId)
      .single(),
    supabase
      .from("agencies")
      .select("company_name, avatar_url")
      .eq("id", agencyId)
      .maybeSingle(),
  ]);

  const openJobs = openJobsData ?? [];
  const openJobIds = new Set(openJobs.map((job) => job.id));
  const lifecycleJobIds = [
    ...new Set([
      ...(submissionsData ?? []).map((row) => row.job_id),
      ...(confirmedContractsDataRaw ?? []).map((row) => row.job_id),
      ...(paidContractsRaw ?? []).map((row) => row.job_id),
      ...(recentBookingsDataRaw ?? []).map((row) => row.job_id),
      ...(recentSubmissionsDataRaw ?? []).map((row) => row.job_id),
    ].filter((id): id is string => !!id)),
  ];

  const { data: lifecycleJobs } = lifecycleJobIds.length
    ? await supabase.from("jobs").select("id, title, job_date, workspace_id").in("id", lifecycleJobIds)
    : { data: [] };

  const lifecycleJobMap = new Map(
    (lifecycleJobs ?? [])
      .filter((job) => !(job as { workspace_id?: string | null }).workspace_id)
      .map((job) => [job.id, { title: job.title ?? "Vaga", jobDate: job.job_date ?? null }]),
  );

  const submissionsFiltered = (submissionsData ?? []).filter((row) => row.job_id && lifecycleJobMap.has(row.job_id));
  const confirmedContractsData = (confirmedContractsDataRaw ?? []).filter((row) => !row.job_id || lifecycleJobMap.has(row.job_id));
  const paidContracts = (paidContractsRaw ?? []).filter((row) => !row.job_id || lifecycleJobMap.has(row.job_id));
  const recentBookingsData = (recentBookingsDataRaw ?? []).filter((row) => !row.job_id || lifecycleJobMap.has(row.job_id));
  const recentSubmissionsData = (recentSubmissionsDataRaw ?? []).filter((row) => row.job_id && lifecycleJobMap.has(row.job_id));

  const paidCount = paidContracts.length;
  const totalSpent = paidContracts.reduce((sum, contract) => sum + Number(contract.payment_amount ?? 0), 0);
  const activeEscrowTotal = confirmedContractsData.reduce((sum, contract) => sum + Number(contract.payment_amount ?? 0), 0);

  const talentIds = [
    ...new Set([
      ...recentBookingsData.map((booking) => booking.talent_user_id),
      ...recentSubmissionsData.map((submission) => submission.talent_user_id),
      ...confirmedContractsData.map((contract) => contract.talent_id),
      ...paidContracts.map((contract) => contract.talent_id),
    ].filter((id): id is string => !!id)),
  ];

  const profileMap = new Map<string, string>();
  const avatarMap = new Map<string, string | null>();

  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .in("id", talentIds)
      .limit(20);
    for (const profileRow of profiles ?? []) {
      profileMap.set(profileRow.id, profileRow.full_name ?? "Talent");
      avatarMap.set(profileRow.id, profileRow.avatar_url ?? null);
    }
  }

  const bookingTalentIds = recentBookingsData
    .map((booking) => booking.talent_user_id)
    .filter((id): id is string => !!id);

  let recentTalentData: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    categories: string[] | null;
    city: string | null;
    country: string | null;
  }[] = [];

  if (bookingTalentIds.length) {
    const { data } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, categories, city, country")
      .in("id", bookingTalentIds)
      .limit(4);
    recentTalentData = data ?? [];
  }

  const recentActivity = [
    ...recentBookingsData.map((booking) => ({
      id: booking.id,
      type: "booking" as const,
      title: "Booking confirmado",
      sub: `${profileMap.get(booking.talent_user_id) ?? "Talent"} x ${booking.job_title ?? "uma vaga"}`,
      time: booking.created_at,
      link: "/agency/bookings",
      avatarUrl: avatarMap.get(booking.talent_user_id) ?? null,
      jobDate: booking.job_id ? (lifecycleJobMap.get(booking.job_id)?.jobDate ?? null) : null,
    })),
    ...recentSubmissionsData.map((submission) => ({
      id: submission.id,
      type: "submission" as const,
      title: "Nova candidatura",
      sub: `${profileMap.get(submission.talent_user_id) ?? "Talent"} se candidatou a "${lifecycleJobMap.get(submission.job_id)?.title ?? "uma vaga"}"`,
      time: submission.created_at,
      link: submission.job_id ? `/agency/jobs/${submission.job_id}` : "/agency/submissions",
      avatarUrl: avatarMap.get(submission.talent_user_id) ?? null,
      jobDate: submission.job_id ? (lifecycleJobMap.get(submission.job_id)?.jobDate ?? null) : null,
    })),
  ]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 6);

  const pendingContracts = confirmedContractsData.map((contract) => ({
    id: contract.id,
    amount: Number(contract.payment_amount ?? 0),
    talentName: contract.talent_id ? (profileMap.get(contract.talent_id) ?? "Talent") : "Talent",
    jobTitle: contract.job_id ? (lifecycleJobMap.get(contract.job_id)?.title ?? contract.job_description ?? "Vaga") : (contract.job_description ?? "Vaga"),
    jobDate: (contract as { job_date?: string | null }).job_date ?? (contract.job_id ? (lifecycleJobMap.get(contract.job_id)?.jobDate ?? null) : null),
  }));

  const activeJobsList = openJobs.slice(0, 5).map((job) => ({
    id: job.id,
    title: job.title ?? "Vaga",
    jobDate: job.job_date ?? null,
    talentsNeeded: job.talents_needed ?? job.number_of_talents_required ?? 1,
  }));

  const confirmedContracts = paidContracts.slice(0, 5).map((contract) => ({
    id: contract.id,
    amount: Number(contract.payment_amount ?? 0),
    talentName: contract.talent_id ? (profileMap.get(contract.talent_id) ?? "Talent") : "Talent",
    jobTitle: contract.job_id ? (lifecycleJobMap.get(contract.job_id)?.title ?? contract.job_description ?? "Vaga") : (contract.job_description ?? "Vaga"),
    paidAt: contract.paid_at ?? null,
  }));

  // ── Checklist: compute from existing data without extra queries ──
  const agencyData = agencyRow as Record<string, unknown> | null;
  const hasAnyJob = (openJobsData?.length ?? 0) > 0 || lifecycleJobIds.length > 0;
  const checklist: LaunchChecklistData = {
    hasJob: hasAnyJob,
    hasApplication: (submissionsData?.length ?? 0) > 0,
    hasContract: (confirmedContractsDataRaw?.length ?? 0) > 0 || (paidContractsRaw?.length ?? 0) > 0,
    hasPaidContract: (paidContractsRaw?.length ?? 0) > 0,
    hasBranding: !!(agencyData?.company_name && agencyData?.avatar_url),
  };

  return (
    <AgencyDashboardOverview
      stats={{
        totalJobs: openJobs.length,
        activeJobs: openJobs.length,
        submissions: submissionsFiltered.length,
        pendingPayment: confirmedContractsData.length,
        paidContracts: paidCount,
        totalSpent,
        walletBalance: Number(profile?.wallet_balance ?? 0),
        activeEscrowTotal,
      }}
      recentTalent={recentTalentData}
      recentActivity={recentActivity}
      pendingContracts={pendingContracts}
      activeJobsList={activeJobsList}
      confirmedContracts={confirmedContracts}
      checklist={checklist}
    />
  );
}
