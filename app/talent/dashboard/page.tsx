import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TalentDashboard from "@/features/talent/TalentDashboard";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { resolvePortalOnlyTalentLanding } from "@/lib/talentPortalLanding";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

export const metadata: Metadata = { title: "Dashboard - BrisaHub" };

export default async function TalentDashboardPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const talentId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });
  if (talentId) {
    const portalLanding = await resolvePortalOnlyTalentLanding(supabase, talentId);
    if (portalLanding) {
      redirect(portalLanding);
    }
  }

  const [
    [{ data: submissionsData }, { data: contractsData }, { data: profileData }],
    globalDefaults,
  ] = await Promise.all([
    Promise.all([
      supabase
        .from("submissions")
        .select("id, job_id")
        .eq("talent_user_id", talentId),
      supabase
        .from("contracts")
        .select("id, agency_id, job_id, job_description, job_date, job_time, location, payment_amount, net_amount, payment_status, status, paid_at")
        .eq("talent_id", talentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", talentId)
        .maybeSingle(),
    ]),
    getGlobalPaymentDefaults(),
  ]);

  const jobIds = [
    ...new Set([
      ...(submissionsData ?? []).map((submission) => submission.job_id),
      ...(contractsData ?? []).map((contract) => contract.job_id),
    ].filter((id): id is string => !!id)),
  ];

  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, workspace_id").in("id", jobIds)
    : { data: [] };

  const openJobMap = new Map(
    (jobs ?? [])
      .filter((job) => !(job as { workspace_id?: string | null }).workspace_id)
      .map((job) => [job.id, job.title ?? "Vaga"]),
  );

  const filteredSubmissions = (submissionsData ?? []).filter((submission) => submission.job_id && openJobMap.has(submission.job_id));
  const filteredContracts = (contractsData ?? []).filter((contract) => !contract.job_id || openJobMap.has(contract.job_id));

  const agencyIds = [
    ...new Set(
      filteredContracts
        .map((contract) => contract.agency_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const agencyMap = new Map<string, string>();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const agency of agencies ?? []) agencyMap.set(agency.id, agency.company_name ?? "Agency");
  }

  const acceptedContracts = filteredContracts.filter((contract) => ["sent", "signed", "confirmed"].includes(contract.status ?? ""));
  const upcomingContracts = filteredContracts
    .filter((contract) => ["signed", "confirmed"].includes(contract.status ?? ""))
    .filter((contract) => contract.job_date && contract.job_date >= new Date().toISOString().slice(0, 10))
    .slice(0, 5);
  const pendingContracts = filteredContracts.filter((contract) => contract.status === "confirmed" && contract.payment_status === "pending");
  const paidContracts = filteredContracts.filter((contract) => contract.payment_status === "paid" || contract.status === "paid");

  // In Internal mode the agency pays the talent directly — the full payment_amount
  // is what the talent receives. In Escrow mode net_amount (post-commission) applies.
  const isInternalMode = globalDefaults.default_payment_mode === "internal";
  function talentAmount(c: { net_amount?: unknown; payment_amount?: unknown }): number {
    return isInternalMode
      ? Number(c.payment_amount ?? 0)
      : Number(c.net_amount ?? c.payment_amount ?? 0);
  }

  const upcomingBookings = upcomingContracts.map((contract) => ({
    id: contract.id,
    title: contract.job_id ? (openJobMap.get(contract.job_id) ?? contract.job_description?.slice(0, 60) ?? "Upcoming Job") : (contract.job_description?.slice(0, 60) ?? "Upcoming Job"),
    agencyName: contract.agency_id ? (agencyMap.get(contract.agency_id) ?? "Agency") : "Agency",
    jobDate: contract.job_date as string | null,
    jobTime: contract.job_time as string | null,
    location: contract.location as string | null,
    amount: talentAmount(contract),
    status: contract.status as string,
  }));

  const pendingPayments = pendingContracts.map((contract) => ({
    id: contract.id,
    title: contract.job_id ? (openJobMap.get(contract.job_id) ?? contract.job_description?.slice(0, 60) ?? "Contract") : (contract.job_description?.slice(0, 60) ?? "Contract"),
    amount: talentAmount(contract),
  }));

  const totalEarned = paidContracts.reduce((sum, contract) => sum + talentAmount(contract), 0);
  const pendingWithdraw = Math.max(0, Number(profileData?.wallet_balance ?? 0));

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
        start_time: todayAvailRow.start_time as string | null,
        end_time: todayAvailRow.end_time as string | null,
      }
    : null;

  return (
    <TalentDashboard
      paymentMode={globalDefaults.default_payment_mode}
      stats={{
        applied: filteredSubmissions.length,
        accepted: acceptedContracts.length,
        upcoming: upcomingBookings.length,
        pendingWithdraw,
        totalEarned,
        paidContractsCount: paidContracts.length,
      }}
      upcomingBookings={upcomingBookings}
      pendingPayments={pendingPayments}
      todayAvailability={todayAvailability}
    />
  );
}
