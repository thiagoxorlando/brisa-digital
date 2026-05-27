import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { batchGetActiveDisputes } from "@/lib/contractState.server";
import type { ApprovedSubmission, TalentContract, TalentReservationFallback } from "@/features/talent/TalentContracts";
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

type BookingContractRow = ContractRow & {
  net_amount?: number | null;
  commission_amount?: number | null;
};

type BookingRow = {
  id: string;
  job_id?: string | null;
  job_title?: string | null;
  agency_id?: string | null;
  status?: string | null;
  price?: number | null;
  created_at?: string | null;
  contracts?: BookingContractRow[] | null;
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
  reservationFallbacks: TalentReservationFallback[];
}> {
  const contractSelect = [
    "id",
    "booking_id",
    "agency_id",
    "job_id",
    "job_date",
    "job_time",
    "location",
    "job_description",
    "payment_amount",
    "payment_method",
    "additional_notes",
    "status",
    "contract_file_url",
    "signed_contract_url",
    "created_at",
    "agency_payment_sent_at",
    "talent_payment_confirmed_at",
    "payment_receipt_url",
  ].join(", ");

  const [contractsResult, bookingsResult, subsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select(contractSelect)
      .or(`talent_id.eq.${talentId},talent_user_id.eq.${talentId}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, job_id, job_title, agency_id, status, price, created_at,
        contracts!contracts_booking_id_fkey (
          ${contractSelect},
          net_amount,
          commission_amount
        )
      `)
      .eq("talent_user_id", talentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id, job_id, status")
      .eq("talent_user_id", talentId)
      .eq("status", "approved"),
  ]);

  if (contractsResult.error) console.error("[TalentContractsPage] contracts:", contractsResult.error.message);
  if (bookingsResult.error) console.error("[TalentContractsPage] bookings:", bookingsResult.error.message);
  if (subsResult.error) console.error("[TalentContractsPage] submissions:", subsResult.error.message);

  const directContracts = (contractsResult.data ?? []) as ContractRow[];
  const bookings = (bookingsResult.data ?? []) as BookingRow[];
  const submissionRows = (subsResult.data ?? []) as SubmissionRow[];

  const bookingContracts = bookings.flatMap((booking) =>
    (Array.isArray(booking.contracts) ? booking.contracts : []).map((contract) => ({
      ...contract,
      booking_id: contract.booking_id ?? booking.id,
    })),
  );

  const allJobIds = [...new Set([
    ...directContracts.map((contract) => contract.job_id),
    ...bookingContracts.map((contract) => contract.job_id),
    ...bookings.map((booking) => booking.job_id),
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

  const contractMap = new Map<string, ContractRow>();
  for (const contract of directContracts) contractMap.set(contract.id, contract);
  for (const contract of bookingContracts) {
    if (!contractMap.has(contract.id)) {
      contractMap.set(contract.id, contract);
    }
  }

  const allContracts = [...contractMap.values()].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const activeDisputeMap = await batchGetActiveDisputes(allContracts.map((contract) => contract.id));

  const agencyIds = [...new Set([
    ...allContracts.map((contract) => contract.agency_id),
    ...bookings.map((booking) => booking.agency_id),
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

  const reservationFallbacks = bookings
    .filter((booking) => {
      if (!booking.job_id || !openJobMap.has(booking.job_id)) return false;
      const bookingContractsForRow = Array.isArray(booking.contracts) ? booking.contracts : [];
      return bookingContractsForRow.length === 0;
    })
    .map((booking) => ({
      reservationId: booking.id,
      contractId: null,
      contractStatus: null,
      jobId: booking.job_id ?? null,
      jobTitle: booking.job_title ?? openJobMap.get(booking.job_id ?? "")?.title ?? "Reserva",
      agencyName: booking.agency_id ? (agencyMap.get(booking.agency_id) ?? "Agência") : "Agência",
      paymentAmount: booking.price ?? 0,
      createdAt: booking.created_at ?? "",
      bookingStatus: booking.status ?? "pending",
    }));

  const queryCount = {
    contracts: directContracts.length,
    bookingContracts: bookingContracts.length,
    bookings: bookings.length,
    mergedContracts: contracts.length,
    approvedSubmissions: approvedSubmissions.length,
    reservationFallbacks: reservationFallbacks.length,
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

  for (const fallback of reservationFallbacks) {
    console.warn("[TalentContractsPage] missing-contract-linkage", {
      talentId,
      reservationId: fallback.reservationId,
      contractId: fallback.contractId,
      contractStatus: fallback.contractStatus,
      queryCount,
    });
  }

  return {
    contracts,
    approvedSubmissions,
    reservationFallbacks,
  };
}
