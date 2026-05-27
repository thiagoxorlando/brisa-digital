import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { batchGetActiveDisputes } from "@/lib/contractState.server";
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
): TalentContract {
  return {
    id: row.id,
    jobId: row.job_id ?? null,
    bookingId: row.booking_id ?? null,
    agencyName: row.agency_id ? (agencyMap.get(row.agency_id) ?? "Agência sem nome") : "Agência sem nome",
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
  const [contractsResult, subsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, booking_id, agency_id, job_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, contract_file_url, signed_contract_url, created_at, agency_payment_sent_at, talent_payment_confirmed_at, payment_receipt_url")
      .or(`talent_id.eq.${talentId},talent_user_id.eq.${talentId}`)
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
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const agency of agencies ?? []) {
      agencyMap.set(agency.id, agency.company_name ?? "Agência sem nome");
    }
  }

  const contracts = allContracts.map((contract) => toTalentContract(contract, agencyMap, activeDisputeMap));
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
