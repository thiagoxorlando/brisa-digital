import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { batchGetActiveDisputes } from "@/lib/contractState.server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import type { ApprovedSubmission, TalentContract } from "@/features/talent/TalentContracts";
import type { createServerClient } from "@/lib/supabase";

type AdminSupabaseClient = ReturnType<typeof createServerClient>;

type ContractRow = {
  id: string;
  booking_id?: string | null;
  agency_id?: string | null;
  job_id?: string | null;
  job_date?: string | null;
  job_time?: string | null;
  location?: string | null;
  job_description?: string | null;
  payment_amount?: number | null;
  payment_method?: string | null;
  additional_notes?: string | null;
  status?: string | null;
  contract_file_url?: string | null;
  signed_contract_url?: string | null;
  created_at?: string | null;
  agency_payment_sent_at?: string | null;
  talent_payment_confirmed_at?: string | null;
  payment_receipt_url?: string | null;
};

type SubmissionRow = {
  id: string;
  job_id: string | null;
  status: string | null;
};

function toTalentContract(
  row: ContractRow,
  agencyMap: Map<string, string>,
  activeDisputeMap: Map<string, { id: string }>,
  agencyModeMap?: Map<string, "escrow" | "internal">,
): TalentContract {
  return {
    id: row.id,
    jobId: row.job_id ?? null,
    bookingId: row.booking_id ?? null,
    agencyName: row.agency_id ? (agencyMap.get(row.agency_id) ?? "Agência sem nome") : "Agência sem nome",
    paymentMode: row.agency_id ? (agencyModeMap?.get(row.agency_id) ?? "escrow") : "escrow",
    jobDate: row.job_date ?? null,
    jobTime: row.job_time ?? null,
    location: row.location ?? null,
    jobDescription: row.job_description ?? null,
    paymentAmount: row.payment_amount ?? 0,
    paymentMethod: row.payment_method ?? null,
    additionalNotes: row.additional_notes ?? null,
    status: row.status ?? "sent",
    createdAt: row.created_at ?? "",
    contractFileUrl: row.contract_file_url ? buildContractFileAccessUrl(row.id, "original") : null,
    signedContractUrl: row.signed_contract_url ? buildContractFileAccessUrl(row.id, "signed") : null,
    activeDisputeId: activeDisputeMap.get(row.id)?.id ?? null,
    agencyPaymentSentAt: row.agency_payment_sent_at ?? null,
    talentPaymentConfirmedAt: row.talent_payment_confirmed_at ?? null,
    paymentReceiptUrl: row.payment_receipt_url ? buildContractFileAccessUrl(row.id, "receipt") : null,
  };
}

export async function loadTalentContractsPageData(
  supabase: AdminSupabaseClient,
  talentId: string,
): Promise<{
  contracts: TalentContract[];
  approvedSubmissions: ApprovedSubmission[];
}> {
  // Fetch bookings for this talent so we can also match contracts by booking_id.
  // This covers cases where a contract's talent_user_id was set to a profile ID
  // rather than the auth user ID (agency-side creation flows).
  // No deleted_at filter — the column may not exist in all environments.
  const { data: talentBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id")
    .eq("talent_user_id", talentId);

  if (bookingsError) {
    console.error("[TalentContractsPage] bookings lookup failed", { talentId, error: bookingsError.message });
  }

  const bookingIds = (talentBookings ?? []).map((b: { id: string }) => b.id);

  console.info("[TalentContractsPage] booking-id-lookup", { talentId, bookingCount: bookingIds.length, bookingIds });

  const contractFilter = bookingIds.length > 0
    ? `talent_id.eq.${talentId},talent_user_id.eq.${talentId},booking_id.in.(${bookingIds.join(",")})`
    : `talent_id.eq.${talentId},talent_user_id.eq.${talentId}`;

  const [contractsResult, subsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, booking_id, agency_id, job_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, contract_file_url, signed_contract_url, created_at, agency_payment_sent_at, talent_payment_confirmed_at, payment_receipt_url")
      .or(contractFilter)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id, job_id, status")
      .eq("talent_user_id", talentId)
      .eq("status", "approved"),
  ]);

  if (contractsResult.error) console.error("[TalentContractsPage] contracts:", contractsResult.error.message);
  if (subsResult.error) console.error("[TalentContractsPage] submissions:", subsResult.error.message);

  const directContracts = (contractsResult.data ?? []) as ContractRow[];
  const submissionRows = (subsResult.data ?? []) as SubmissionRow[];

  const allJobIds = [...new Set([
    ...directContracts.map((contract) => contract.job_id),
    ...submissionRows.map((submission) => submission.job_id),
  ].filter((id): id is string => Boolean(id)))];

  const { data: jobs } = allJobIds.length
    ? await supabase.from("jobs").select("id, title, agency_id, workspace_id").in("id", allJobIds)
    : { data: [] };

  const jobMap = new Map(
    (jobs ?? []).map((job) => [
      job.id,
      {
        title: job.title ?? "Vaga sem título",
        agencyId: job.agency_id ?? "",
        workspaceId: (job as { workspace_id?: string | null }).workspace_id ?? null,
      },
    ]),
  );
  const openJobMap = new Map(
    [...jobMap.entries()].filter(([, job]) => !job.workspaceId),
  );

  const allContracts = [...directContracts].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const activeDisputeMap = await batchGetActiveDisputes(allContracts.map((contract) => contract.id));

  const agencyIds = [...new Set([
    ...allContracts.map((contract) => contract.agency_id),
  ].filter((id): id is string => Boolean(id)))];

  const agencyMap = new Map<string, string>();
  const agencyModeMap = new Map<string, "escrow" | "internal">();
  if (agencyIds.length) {
    const [agencyRows, globalDefaults] = await Promise.all([
      supabase
        .from("agencies")
        .select("id, company_name, payment_mode")
        .in("id", agencyIds),
      getGlobalPaymentDefaults(),
    ]);
    for (const agency of agencyRows.data ?? []) {
      agencyMap.set(agency.id, (agency as Record<string, unknown>).company_name as string ?? "Agência sem nome");
      const rawMode = (agency as Record<string, unknown>).payment_mode as string | null;
      const mode: "escrow" | "internal" =
        rawMode === "internal" ? "internal"
        : rawMode === "escrow" ? "escrow"
        : globalDefaults.default_payment_mode;
      agencyModeMap.set(agency.id, mode);
    }
  }

  const contracts = allContracts.map((contract) => toTalentContract(contract, agencyMap, activeDisputeMap, agencyModeMap));
  const contractJobIds = new Set(contracts.map((contract) => contract.jobId).filter((id): id is string => Boolean(id)));

  const filteredSubmissionRows = submissionRows.filter((submission) => submission.job_id && openJobMap.has(submission.job_id));
  const pendingSubJobIds = filteredSubmissionRows
    .filter((submission) => submission.job_id && !contractJobIds.has(submission.job_id))
    .map((submission) => submission.job_id as string);

  const approvedSubmissions: ApprovedSubmission[] = pendingSubJobIds
    .map((jobId) => {
      const job = openJobMap.get(jobId);
      const submission = filteredSubmissionRows.find((row) => row.job_id === jobId);
      if (!job || !submission) return null;
      return {
        submissionId: submission.id,
        jobId,
        jobTitle: job.title,
        agencyId: job.agencyId,
        agencyName: job.agencyId ? (agencyMap.get(job.agencyId) ?? "Agência") : "Agência",
      };
    })
    .filter((row): row is ApprovedSubmission => Boolean(row));

  const queryCount = {
    contracts: directContracts.length,
    mergedContracts: contracts.length,
    approvedSubmissions: approvedSubmissions.length,
  };

  console.info("[TalentContractsPage] summary", {
    talentId,
    reservationId: null,
    contractId: null,
    contractStatus: null,
    queryCount,
  });

  for (const contract of contracts) {
    console.info("[TalentContractsPage] contract-linkage", {
      talentId,
      reservationId: contract.bookingId,
      contractId: contract.id,
      contractStatus: contract.status,
      queryCount,
    });
  }

  return {
    contracts,
    approvedSubmissions,
  };
}
